import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { AZ_CITYHIVE_SOURCES, collectArizonaCityHive } from '../src/collectors/precision-probes.mjs';
import { runArizonaSourcesWithDenialBackoff } from '../src/collectors/arizona-source-attempts.mjs';
import { METRO_ACCESS_DENIAL_BACKOFF_MS, METRO_RATE_LIMIT_BACKOFF_MS, writeMetroSourceAttempts } from '../src/collectors/metro-refresh-state.mjs';

const initialAt = '2026-10-24T12:00:00.000Z';
const initialMs = Date.parse(initialAt);
const precisionUrl = new URL('../src/collectors/precision-probes.mjs', import.meta.url).href;
const attemptUrl = new URL('../src/collectors/arizona-source-attempts.mjs', import.meta.url).href;
const flagstaff = { id: 'flagstaff-liquor', sourceLabel: 'Flagstaff Liquor Shopify store inventory', baseUrl: 'https://flagstaffliquor.com/products.json?limit=250' };
const ledgerPath = 'out/optimization/metro-source-attempts/AZ.json';

function workspace(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'arizona-denial-fixture-'));
  t.after(() => {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('arizona-denial-fixture-'));
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

function page(source, quantity = 2) {
  const merchantId = source.merchantIds[0];
  const product = {
    id: 'fixture-product', name: 'Buffalo Trace Bourbon 750ml', basic_category: ['bourbon'],
    merchants: [{ product_options: [0, 1].map((index) => ({
      product_id: 'fixture-product', option_id: `fixture-option-${index}`, merchant_id: merchantId,
      full_address: '123 Fixture Ave, Phoenix, AZ 85001', quantity,
      option_params: { size: { quantity: 750, measure: 'ml' } },
      option_display_data: { name: 'Buffalo Trace Bourbon 750ml' },
      product_url: `${source.baseUrl}/shop/product/buffalo-trace/fixture-product`, price: 34.99,
    })) }],
  };
  return `<script>JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify({ products: [product] }))}"))</script>`;
}

// Every sweep uses a fresh process; only the standalone AZ ledger is shared.
// All HTTP dependencies are fixtures, and unexpected native fetches fail closed.
function sweep(directory, {
  at = initialAt, status = 403, healthyId = null, detailDenial = false,
  quantity = 2, flagstaffOnly = false, failPublication = false, requestAdvanceMs = 0,
} = {}) {
  const script = `
    import { readFile } from 'node:fs/promises';
    import { mock } from 'node:test';
    mock.timers.enable({ apis: ['Date'], now: new Date(${JSON.stringify(at)}) });
    const { AZ_CITYHIVE_SOURCES, collectArizonaCityHive } = await import(${JSON.stringify(precisionUrl)});
    const { runArizonaSourcesWithDenialBackoff } = await import(${JSON.stringify(attemptUrl)});
    globalThis.fetch = async () => { throw new Error('Unexpected live fetch in denial fixture'); };
    const page = ${page.toString()};
    const calls = [];
    const fetchText = async (url) => {
      calls.push(url);
      const source = AZ_CITYHIVE_SOURCES.find(candidate => new URL(candidate.baseUrl).hostname === new URL(url).hostname);
      if (!source) throw new Error('Unregistered fixture request: ' + url);
      const detail = new URL(url).pathname.includes('/shop/product/');
      const positivePage = source.id === ${JSON.stringify(healthyId)} || (${detailDenial} && source.id === AZ_CITYHIVE_SOURCES[0].id && !detail);
      mock.timers.setTime(Date.now() + ${requestAdvanceMs});
      return { ok: positivePage, status: positivePage ? 200 : ${status}, url, text: positivePage ? page(source, ${detailDenial} && source.id === AZ_CITYHIVE_SOURCES[0].id ? 100 : ${quantity}) : '' };
    };
    const bible = { match: () => ({ confidence: 1, record: { id: 'buffalo-trace', canonical: 'Buffalo Trace Bourbon', tier: 1 } }) };
    const flagstaff = ${JSON.stringify(flagstaff)};
    const result = ${flagstaffOnly}
      ? await runArizonaSourcesWithDenialBackoff([flagstaff], async () => {
          calls.push(flagstaff.baseUrl);
          mock.timers.setTime(Date.now() + ${requestAdvanceMs});
          return { signals: [], roadblocks: ${status} >= 400 ? [{ status: ${status} }] : [] };
        }, { registeredSources: [...AZ_CITYHIVE_SOURCES, flagstaff], directRequestCount: 1 })
      : await collectArizonaCityHive({ id: 'AZ' }, bible, ${JSON.stringify(at)}, { fetchText, sleepFn: async () => {} });
    if (${failPublication}) throw new Error('Fixture nationwide publication rejected zero positive inventory');
    const ledger = JSON.parse(await readFile(${JSON.stringify(ledgerPath)}, 'utf8'));
    process.stdout.write(JSON.stringify({ calls, result, ledger }));
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: directory, encoding: 'utf8', windowsHide: true, timeout: 20_000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, PATH: '', Path: '', BOURBON_SIGNAL_AZ_CITYHIVE_MAX_PAGES: '2', BOURBON_SIGNAL_AZ_FORCE_CITYHIVE_LIVE: '1', BOURBON_SIGNAL_AZ_FORCE_LIVE: '1' },
  });
  if (failPublication) {
    assert.notEqual(child.status, 0);
    assert.match(child.stderr, /nationwide publication rejected/);
    return;
  }
  assert.equal(child.status, 0, child.stderr || child.error?.message);
  return JSON.parse(child.stdout);
}

test('production denials remain parked while the new source gets its independent first attempt', (t) => {
  const directory = workspace(t);
  const first = sweep(directory, { at: '2026-10-22T17:50:00.000Z' });
  assert.equal(first.calls.length, 1);
  assert.equal(new URL(first.calls[0]).hostname, 'a1liquorstore.com');
  assert.equal(first.result.signals.length, 0);
  assert.deepEqual(first.result.metadata.skippedSourceIds, AZ_CITYHIVE_SOURCES.filter(source => source.id !== 'a1-liquor-phoenix').map(source => source.id));
  assert.equal(Object.keys(first.ledger.sourceAttempts).length, 9);
  for (const source of AZ_CITYHIVE_SOURCES.filter(source => source.id !== 'a1-liquor-phoenix')) {
    assert.equal(first.ledger.sourceAttempts[source.id].lastAttemptAt, '2026-10-22T17:07:44.857Z');
    assert.equal(first.ledger.sourceAttempts[source.id].nextAllowedAt, '2026-10-23T17:07:44.857Z');
  }
  const flagstaffSkip = sweep(directory, { at: '2026-10-22T17:51:00.000Z', flagstaffOnly: true });
  assert.deepEqual(flagstaffSkip.calls, []);
  assert.equal(flagstaffSkip.ledger.sourceAttempts[flagstaff.id].lastAttemptAt, '2026-10-22T17:42:56.671Z');
  assert.equal(flagstaffSkip.ledger.sourceAttempts[flagstaff.id].nextAllowedAt, '2026-10-22T21:42:56.671Z');
  assert.deepEqual(flagstaffSkip.ledger.sourceAttempts, first.ledger.sourceAttempts);
});

for (const status of [401, 403, 429]) test(`HTTP ${status} stops every source after one request and survives a fresh process with ledger only`, (t) => {
  const directory = workspace(t);
  const first = sweep(directory, { status });
  assert.equal(first.calls.length, AZ_CITYHIVE_SOURCES.length);
  assert.equal(new Set(first.calls.map(url => new URL(url).hostname)).size, AZ_CITYHIVE_SOURCES.length);
  assert.equal(first.result.signals.length, 0);
  for (const source of AZ_CITYHIVE_SOURCES) {
    const attempt = first.ledger.sourceAttempts[source.id];
    assert.equal(attempt.httpStatus, status);
    assert.equal(attempt.lastAttemptAt, initialAt);
    assert.equal(Date.parse(attempt.nextAllowedAt), initialMs + (status === 429 ? METRO_RATE_LIMIT_BACKOFF_MS : METRO_ACCESS_DENIAL_BACKOFF_MS));
  }
  const restarted = sweep(directory, { status, at: '2026-10-24T12:01:00.000Z' });
  assert.deepEqual(restarted.calls, []);
  assert.deepEqual(restarted.ledger, first.ledger);
  const due = sweep(directory, { status, at: status === 429 ? '2026-10-24T16:00:00.000Z' : '2026-10-25T12:00:00.000Z' });
  assert.equal(due.calls.length, AZ_CITYHIVE_SOURCES.length);
});

test('a failed nationwide publication with zero inventory does not discard the denial ledger', (t) => {
  const directory = workspace(t);
  sweep(directory, { failPublication: true });
  const ledger = JSON.parse(readFileSync(path.join(directory, ledgerPath), 'utf8'));
  const restarted = sweep(directory, { at: '2026-10-24T12:01:00.000Z' });
  assert.deepEqual(restarted.calls, []);
  assert.deepEqual(restarted.ledger, ledger);
});

test('a real 200 after expiry replaces the denial at actual finish and does not cache healthy sources across restart', (t) => {
  const directory = workspace(t);
  sweep(directory);
  const healthyId = 'paradise-liquor-phoenix';
  const resumedAt = '2026-10-25T12:00:00.000Z';
  const first = sweep(directory, { at: resumedAt, healthyId, requestAdvanceMs: 25 });
  const attempt = first.ledger.sourceAttempts[healthyId];
  assert.equal(attempt.status, 'success');
  assert.equal(attempt.httpStatus, 200);
  assert.equal(attempt.lastAttemptAt, '2026-10-25T12:00:00.100Z');
  assert.equal(attempt.nextAllowedAt, attempt.lastAttemptAt);
  assert.ok(first.result.signals.every(signal => signal.observedAt === resumedAt));
  const restarted = sweep(directory, { at: '2026-10-25T12:00:01.000Z', healthyId });
  assert.equal(restarted.calls.length, 4, 'all four healthy source pages run again immediately');
  assert.ok(restarted.calls.every(url => new URL(url).hostname === 'paradiseliquoraz.com'));
  assert.equal(restarted.ledger.sourceAttempts[healthyId].lastAttemptAt, '2026-10-25T12:00:01.000Z');
  const flagstaffHealthy = sweep(directory, { at: '2026-10-25T12:00:02.000Z', flagstaffOnly: true, status: 200, requestAdvanceMs: 25 });
  assert.equal(flagstaffHealthy.ledger.sourceAttempts[flagstaff.id].status, 'success');
  assert.equal(flagstaffHealthy.ledger.sourceAttempts[flagstaff.id].httpStatus, 200);
  assert.equal(flagstaffHealthy.ledger.sourceAttempts[flagstaff.id].lastAttemptAt, '2026-10-25T12:00:02.025Z');
  const flagstaffRestart = sweep(directory, { at: '2026-10-25T12:00:03.000Z', flagstaffOnly: true, status: 200 });
  assert.equal(flagstaffRestart.calls.length, 1);
});

test('initial ledger EACCES fails closed before any CityHive request', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: initialMs });
  const directory = workspace(t);
  const original = process.cwd();
  process.chdir(directory);
  try {
    let requests = 0;
    const result = await collectArizonaCityHive({ id: 'AZ' }, { match: () => null }, initialAt, {
      fetchText: async () => { requests += 1; return { ok: true, status: 200, text: '' }; },
      writeArizonaSourceAttempts: async () => { throw Object.assign(new Error('Fixture denied ledger write'), { code: 'EACCES' }); },
    });
    assert.equal(requests, 0);
    assert.equal(result.metadata.requestCount, 0);
    assert.equal(result.metadata.attemptStateAvailable, false);
    assert.deepEqual(result.metadata.attemptLedgerErrors, [{ code: 'EACCES', phase: 'initial', sourceId: null }]);
    assert.deepEqual(result.metadata.skippedSourceIds, AZ_CITYHIVE_SOURCES.map(source => source.id));
    assert.ok(result.roadblocks.every(roadblock => roadblock.status === 'source_attempt_state_unavailable'));
  } finally { process.chdir(original); }
});

for (const failedStatus of [200, 403]) test(`post-${failedStatus} ledger EACCES retains accepted rows and stops every remaining risky request`, async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: initialMs });
  const directory = workspace(t);
  const original = process.cwd();
  process.chdir(directory);
  try {
    const calls = [];
    let writes = 0;
    const observedAt = '2026-10-24T11:59:59.000Z';
    const source = AZ_CITYHIVE_SOURCES[0];
    const bible = { match: () => ({ confidence: 1, record: { id: 'buffalo-trace', canonical: 'Buffalo Trace Bourbon', tier: 1 } }) };
    const result = await collectArizonaCityHive({ id: 'AZ' }, bible, observedAt, {
      sleepFn: async () => {},
      fetchText: async (url) => {
        calls.push(url);
        t.mock.timers.setTime(initialMs + calls.length * 25);
        return calls.length === 1 ? { ok: true, status: 200, text: page(source) } : { ok: false, status: 403, text: '' };
      },
      writeArizonaSourceAttempts: async (...args) => {
        writes += 1;
        if (writes === (failedStatus === 200 ? 2 : 3)) throw Object.assign(new Error('Fixture denied ledger write'), { code: 'EACCES' });
        await writeMetroSourceAttempts(...args);
      },
    });
    assert.equal(calls.length, failedStatus === 200 ? 1 : 2);
    assert.ok(calls.every(url => new URL(url).hostname === 'paradiseliquoraz.com'));
    assert.equal(result.signals.length, 2);
    assert.ok(result.signals.every(signal => signal.observedAt === observedAt && signal.quantity === 2 && signal.canAlertAsInventory));
    assert.equal(result.metadata.attemptStateAvailable, false);
    assert.equal(result.metadata.sourceAttempts[source.id].httpStatus, failedStatus);
    assert.equal(result.metadata.sourceAttempts[source.id].lastAttemptAt, failedStatus === 200 ? '2026-10-24T12:00:00.025Z' : '2026-10-24T12:00:00.050Z');
    assert.deepEqual(result.metadata.attemptLedgerErrors, [{ code: 'EACCES', phase: 'response', sourceId: source.id }]);
    assert.ok(result.roadblocks.some(roadblock => roadblock.status === 'source_attempt_state_unavailable'));
    assert.ok(AZ_CITYHIVE_SOURCES.slice(1).every(source => result.metadata.skippedSourceIds.includes(source.id)));
  } finally { process.chdir(original); }
});

test('one-request Flagstaff stock is retained if its completed-success ledger write fails', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: initialMs });
  const directory = workspace(t);
  const original = process.cwd();
  process.chdir(directory);
  try {
    const stock = { id: 'accepted', observedAt: '2026-10-24T11:59:00.000Z', quantity: 0, availabilityStatus: 'in_stock', sourceAvailabilityVerified: true };
    let writes = 0;
    let callbacks = 0;
    const sibling = { id: 'unrequested-sibling', sourceLabel: 'Unrequested sibling', baseUrl: 'https://sibling.example' };
    const result = await runArizonaSourcesWithDenialBackoff([flagstaff, sibling], async () => {
      callbacks += 1;
      return { signals: [stock], roadblocks: [] };
    }, { directRequestCount: 1, writeAttempts: async (...args) => {
      if (++writes === 2) throw Object.assign(new Error('Fixture denied ledger write'), { code: 'EACCES' });
      await writeMetroSourceAttempts(...args);
    } });
    assert.equal(callbacks, 1);
    assert.equal(result.metadata.requestCount, 1);
    assert.equal(result.metadata.attemptStateAvailable, false);
    assert.deepEqual(result.values[0].value.signals, [stock]);
    assert.ok(result.metadata.skippedSourceIds.includes(sibling.id));
  } finally { process.chdir(original); }
});

test('a completed one-request network failure is not mislabeled as a 200 success', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: initialMs });
  const directory = workspace(t);
  const original = process.cwd();
  process.chdir(directory);
  try {
    const result = await runArizonaSourcesWithDenialBackoff([flagstaff], async () => ({ signals: [], roadblocks: [{ status: 0, error: 'Fixture network failure' }] }), { directRequestCount: 1 });
    assert.equal(result.metadata.sourceAttempts[flagstaff.id].status, 'failed');
    assert.equal(result.metadata.sourceAttempts[flagstaff.id].httpStatus, null);
    assert.equal(result.metadata.sourceAttempts[flagstaff.id].nextAllowedAt, initialAt);
  } finally { process.chdir(original); }
});

test('a detail denial ends remaining options, pages, merchants and seeds while healthy siblings keep their stock guards', (t) => {
  const directory = workspace(t);
  const healthyId = 'liquor-vault-scottsdale';
  const result = sweep(directory, { healthyId, detailDenial: true });
  const paradiseRequests = result.calls.filter(url => new URL(url).hostname === 'paradiseliquoraz.com');
  assert.equal(paradiseRequests.length, 2);
  assert.ok(paradiseRequests[1].includes('/shop/product/'));
  assert.equal(result.calls.filter(url => new URL(url).hostname === 'azliquorvault.com').length, 2);
  assert.equal(result.result.signals.length, 2);
  assert.ok(result.result.signals.every(signal => signal.sourceChain === healthyId && signal.quantity === 2 && signal.observedAt === initialAt && signal.canAlertAsInventory));
  assert.equal(result.ledger.sourceAttempts[AZ_CITYHIVE_SOURCES[0].id].httpStatus, 403);
  assert.ok(!Object.hasOwn(result.ledger.sourceAttempts, 'metro:az:paradise-liquor-phoenix'));
});

test('unverified sentinel rows remain watches, and denied refreshes never import or re-age old stock', (t) => {
  const directory = workspace(t);
  const oldAt = '2026-10-24T01:00:00.000Z';
  const stale = { signals: [{ id: 'old', quantity: 5, observedAt: oldAt, canAlertAsInventory: true }] };
  mkdirSync(path.join(directory, 'out/browser'), { recursive: true });
  const oldCachePath = path.join(directory, 'out/browser/AZ-retailer-inventory.json');
  writeFileSync(oldCachePath, JSON.stringify(stale));
  const watch = sweep(directory, { healthyId: 'liquor-vault-scottsdale', quantity: 100 });
  assert.equal(watch.result.signals.length, 2);
  assert.ok(watch.result.signals.every(signal => signal.quantity === 0 && signal.eventType === 'cityhive_store_catalog_watch' && !signal.canAlertAsInventory));
  const denied = sweep(directory, { at: '2026-10-24T12:01:00.000Z' });
  assert.deepEqual(denied.result.signals, []);
  assert.deepEqual(JSON.parse(readFileSync(oldCachePath, 'utf8')), stale);
});

test('Flagstaff denial is persisted before a later lane and its separate source cannot erase CityHive attempts', (t) => {
  const directory = workspace(t);
  const cityhive = sweep(directory);
  const first = sweep(directory, { flagstaffOnly: true, status: 429 });
  assert.equal(first.calls.length, 1);
  assert.equal(first.result.metadata.requestCount, 1);
  assert.equal(first.ledger.sourceAttempts[flagstaff.id].lastAttemptAt, initialAt);
  assert.equal(Date.parse(first.ledger.sourceAttempts[flagstaff.id].nextAllowedAt), initialMs + METRO_RATE_LIMIT_BACKOFF_MS);
  for (const source of AZ_CITYHIVE_SOURCES) assert.deepEqual(first.ledger.sourceAttempts[source.id], cityhive.ledger.sourceAttempts[source.id]);
  const second = sweep(directory, { flagstaffOnly: true, status: 429, at: '2026-10-24T12:01:00.000Z' });
  assert.deepEqual(second.calls, []);
  assert.equal(second.result.metadata.requestCount, 0);
  assert.deepEqual(second.ledger, first.ledger);
});

for (const ledgerFailure of ['none', 'initial', 'denial', 'success']) test(`full precision runtime keeps XAPI independent and fails retailer requests closed with ${ledgerFailure} ledger failure`, (t) => {
  const directory = workspace(t);
  const at = ledgerFailure === 'none' ? '2026-10-22T17:50:00.000Z' : initialAt;
  const script = `
    import assert from 'node:assert/strict';
    import { readFile } from 'node:fs/promises';
    import { mock } from 'node:test';
    mock.timers.enable({ apis: ['Date'], now: new Date(${JSON.stringify(at)}) });
    const realTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (callback, ms, ...args) => realTimeout(callback, ms >= 500 && ms <= 10000 ? 0 : ms, ...args);
    const { collectPrecisionProbes, AZ_CITYHIVE_SOURCES } = await import(${JSON.stringify(precisionUrl)});
    const { writeMetroSourceAttempts } = await import(${JSON.stringify(new URL('../src/collectors/metro-refresh-state.mjs', import.meta.url).href)});
    const page = ${page.toString()};
    let writes = 0;
    const calls = [];
    async function fixture(url) {
      calls.push(url);
      const parsed = new URL(url);
      if (AZ_CITYHIVE_SOURCES.some(source => new URL(source.baseUrl).hostname === parsed.hostname) || parsed.hostname === 'flagstaffliquor.com') throw new Error('Known denied host was requested');
      if (parsed.hostname === 'mesaliquorstore.com' || parsed.hostname === 'bestliquortempe.com') {
        if (${JSON.stringify(ledgerFailure)} !== 'initial') {
          const ledger = JSON.parse(await readFile(${JSON.stringify(ledgerPath)}, 'utf8'));
          assert.ok(Object.keys(ledger.sourceAttempts).length >= 8);
        }
        if(parsed.pathname==='/contact/') return '<iframe src="https://maps.google.com/maps?q=' + encodeURIComponent(parsed.hostname==='mesaliquorstore.com'?'1930 E Broadway Rd, Mesa, AZ 85204':'3320 S Priest Dr Suite #2, Tempe, AZ 85282') + '"></iframe>';
        return [{ id: 123, name: 'Buffalo Trace Bourbon 750ml', is_in_stock: true, is_purchasable: true, is_on_backorder: false, permalink: parsed.origin + '/product/buffalo-trace/', prices: { price: '3499', currency_minor_unit: 2, currency_code: 'USD' } }];
      }
      if(parsed.hostname==='liquorwheel2.com') return '';
      if (url.includes('/storeresolver/')) return { instore: { stores: [{ locationId: '1491', polarisBannerName: 'safeway', domainName: 'Safeway', distance: 1, address: { line1: '7920 E Chaparral Rd', city: 'Scottsdale', state: 'AZ', zipcode: '85250' } }] } };
      if (url.includes('/search/substitute')) return { response: { docs: [{ id: '189032017', storeId: '1491', name: 'Buffalo Trace Bourbon 750ml', price: 34.99, channelInventory: { instore: '1', instoreItemQty: 3 } }] } };
      if (parsed.hostname === 'redsky.target.com') return { data: { search: { products: [] } } };
      if (parsed.hostname === 'www.smartandfinal.com') return {};
      throw new Error('Unexpected fixture URL: ' + url);
    }
    globalThis.fetch = async (url) => new Response(JSON.stringify(await fixture(url)), { status: 200, headers: { 'content-type': 'application/json' } });
    const result = await collectPrecisionProbes({ id: 'AZ', label: 'Arizona', sources: [] }, { records:[{id:'buffalo-trace',canonical:'Buffalo Trace Bourbon',tier:'allocated',libraryIdentities:[{id:'buffalo-trace',canonicalName:'Buffalo Trace Bourbon',aliases:[],nationalTier:'allocated',isAlertEligible:true}]}], match: () => ({ confidence: 1, record: { id: 'buffalo-trace', canonical: 'Buffalo Trace Bourbon', tier: 1 } }) }, [], {
      sourceRunnerOptions: { schedule: false, maxAttempts: 3 },
      fetchText: async url => {
        const source = AZ_CITYHIVE_SOURCES.find(source => new URL(source.baseUrl).hostname === new URL(url).hostname);
        if (source && (source.id === 'a1-liquor-phoenix' || ['denial', 'success'].includes(${JSON.stringify(ledgerFailure)}))) {
          calls.push(url);
          return { ok: ${ledgerFailure === 'success'}, status: ${ledgerFailure === 'success' ? 200 : 403}, text: ${ledgerFailure === 'success'} ? page(source) : '' };
        }
        const value = await fixture(url); return { ok: true, status: 200, text: typeof value==='string'?value:JSON.stringify(value) };
      },
      writeArizonaSourceAttempts: async (...args) => {
        writes += 1;
        if (${JSON.stringify(ledgerFailure)} !== 'none' && writes === ${ledgerFailure === 'initial' ? 1 : 2}) throw Object.assign(new Error('Fixture denied ledger write'), { code: 'EACCES' });
        await writeMetroSourceAttempts(...args);
      },
      sleepFn: async () => {},
      sleep: async () => {},
    });
    process.stdout.write(JSON.stringify({ calls, result }));
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: directory, env: { ...process.env, PATH: '', Path: '', BOURBON_SIGNAL_QUARANTINED_SOURCES: '', BOURBON_SIGNAL_SOURCE_CHECKPOINT_DIRECTORY: '' }, encoding: 'utf8', windowsHide: true, timeout: 20_000 });
  assert.equal(child.status, 0, child.stderr || child.error?.message);
  const { calls, result } = JSON.parse(child.stdout);
  assert.equal(calls.some(url => new URL(url).hostname === 'mesaliquorstore.com'), ledgerFailure==='none');
  assert.equal(calls.some(url => new URL(url).hostname === 'bestliquortempe.com'), ledgerFailure==='none');
  assert.ok(calls.some(url => url.includes('/search/substitute')));
  assert.equal(result.signals.filter(signal => signal.sourceChain === 'mesa-liquor').length, ledgerFailure==='none'?1:0);
  assert.equal(result.signals.filter(signal => signal.sourceChain === 'best-liquor-tempe').length, ledgerFailure==='none'?1:0);
  assert.equal(result.signals.filter(signal => signal.sourceChain === 'safeway').length, 1);
  assert.ok(result.signals.every(signal => signal.observedAt === at));
  assert.ok(result.roadblocks.every(roadblock => roadblock.sourceRuntimeId === 'precision:az'));
  const riskyRequests = calls.filter(url => AZ_CITYHIVE_SOURCES.some(source => new URL(source.baseUrl).hostname === new URL(url).hostname));
  assert.equal(riskyRequests.length, ledgerFailure === 'initial' ? 0 : 1);
  assert.ok(!calls.some(url => new URL(url).hostname === 'flagstaffliquor.com'));
  assert.equal(result.metadata.cityhive.requestCount, riskyRequests.length);
  assert.equal(result.metadata.cityhive.attemptStateAvailable, ledgerFailure === 'none');
  assert.equal(result.metadata.flagstaff.attemptStateAvailable, ledgerFailure === 'none');
  assert.equal(result.metadata.flagstaff.requestCount, 0);
  assert.equal(result.metadata.xapi.selectedStores.length, 1);
  if (ledgerFailure === 'success') assert.equal(result.signals.filter(signal => signal.sourceChain === AZ_CITYHIVE_SOURCES[0].id).length, 2);
});

test('each denial is durable before the healthy sibling callback runs', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: initialMs });
  const directory = workspace(t);
  const original = process.cwd();
  process.chdir(directory);
  const sources = [{ id: 'denied-fixture', sourceLabel: 'Denied fixture', baseUrl: 'https://denied.example' }, { id: 'healthy-fixture', sourceLabel: 'Healthy fixture', baseUrl: 'https://healthy.example' }];
  try {
    let healthyRan = false;
    const result = await runArizonaSourcesWithDenialBackoff(sources, async (source, { fetchText }) => {
      if (source.id === 'healthy-fixture') {
        const durable = JSON.parse(readFileSync(ledgerPath, 'utf8'));
        assert.equal(durable.sourceAttempts['denied-fixture'].httpStatus, 403);
        healthyRan = true;
      }
      await fetchText(source.baseUrl);
      if (source.id === 'denied-fixture') assert.fail('Denied source callback continued');
    }, { fetchText: async url => ({ ok: url.includes('healthy'), status: url.includes('healthy') ? 200 : 403 }) });
    assert.equal(healthyRan, true);
    assert.equal(result.metadata.requestCount, 2);
  } finally { process.chdir(original); }
});

test('malformed and future AZ ledger attempts cannot suppress valid due sources', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: initialMs });
  const directory = workspace(t);
  const original = process.cwd();
  process.chdir(directory);
  const source = { id: 'metadata-fixture', sourceLabel: 'Metadata fixture', baseUrl: 'https://metadata.example' };
  try {
    mkdirSync(path.dirname(ledgerPath), { recursive: true });
    for (const ledger of [null, [], { schemaVersion: 1, state: 'NY', sourceAttempts: {} },
      { schemaVersion: 1, state: 'AZ', sourceAttempts: { [source.id]: { status: 'access_denied', httpStatus: 403, lastAttemptAt: '2099-01-01T00:00:00.000Z', nextAllowedAt: '2099-01-02T00:00:00.000Z' } } },
      { schemaVersion: 1, state: 'AZ', sourceAttempts: { [source.id]: { status: 'access_denied', httpStatus: 403, lastAttemptAt: initialAt, nextAllowedAt: '2099-01-02T00:00:00.000Z' } } },
    ]) {
      writeFileSync(ledgerPath, JSON.stringify(ledger));
      let requests = 0;
      await runArizonaSourcesWithDenialBackoff([source], async (_source, { fetchText }) => fetchText(source.baseUrl), { fetchText: async () => { requests += 1; return { ok: true, status: 200 }; } });
      assert.equal(requests, 1);
    }
  } finally { process.chdir(original); }
});
