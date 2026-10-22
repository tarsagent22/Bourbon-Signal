import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { METRO_RETAILER_SOURCES, parseMetroCityHiveHtml, mergeMetroSourceCacheSignals } from '../src/collectors/metro-retailer-surfaces.mjs';
import { collectMetroCityHiveRows, selectMetroSourcesForRefresh } from '../src/collectors/buffalo-cityhive-discovery.mjs';
import { metroSourceAttempts, mergeMetroSourceAttempts, readMetroSourceAttempts, updateMetroSourceAttempts, METRO_ACCESS_DENIAL_BACKOFF_MS, METRO_ATTEMPT_CLOCK_SKEW_MS } from '../src/collectors/metro-refresh-state.mjs';
import { createSourceAdapter } from '../src/sources/source-adapter.mjs';
import { runSourceAdapters } from '../src/sources/source-runner.mjs';

const deniedSource = METRO_RETAILER_SOURCES.find((source) => source.id === 'michaeltowne-wines');
const healthySource = METRO_RETAILER_SOURCES.find((source) => source.id === 'cellar-53');
const initialAt = '2026-10-24T12:00:00.000Z';
const initialMs = Date.parse(initialAt);
const precisionUrl = new URL('../src/collectors/precision-probes.mjs', import.meta.url).href;
const registryUrl = new URL('../src/collectors/metro-retailer-surfaces.mjs', import.meta.url).href;

function page(source, positive = true) {
  const store = source.stores[0];
  const payload = {
    merchant_configs: [{ merchant: { id: store.merchantId, pickup: true, address: { full_address: store.address } } }],
    products: positive ? [{
      id: 'fixture-product', name: 'Buffalo Trace Bourbon 750ml', basic_category: ['bourbon'], size: { quantity: '750', measure: 'ml' },
      merchants: [{ merchant_id: store.merchantId, full_address: store.address, offer_types: ['pick_up'], product_options: [{
        product_id: 'fixture-product', option_id: 'fixture-option', merchant_id: store.merchantId,
        full_address: store.address, quantity: 2, price: 34.99,
        product_url: `${source.baseUrl}/shop/product/buffalo-trace/fixture-product?option-id=fixture-option`,
        option_display_data: { name: 'Buffalo Trace Bourbon 750ml', size: { quantity: '750', measure: 'ml' }, basic_category: ['bourbon'] },
      }] }],
    }] : [],
  };
  return `<html data-ch-merchant-id="${store.merchantId}"><script type="application/json">${JSON.stringify(payload)}</script></html>`;
}

function workspace(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'metro-denial-fixture-'));
  t.after(() => {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('metro-denial-fixture-'));
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

// Each call is a fresh Node process: the cache JSON is the only shared state.
function sweep(directory, { at = initialAt, status = 403, onlyDenied = false, forceLive = false, healthyPositive = false } = {}) {
  const script = `
    import { readFile } from 'node:fs/promises';
    import { mock } from 'node:test';
    mock.timers.enable({ apis: ['Date'], now: new Date(${JSON.stringify(at)}) });
    const { METRO_RETAILER_SOURCES } = await import(${JSON.stringify(registryUrl)});
    const { collectPrecisionProbes } = await import(${JSON.stringify(precisionUrl)});
    const sources = ${JSON.stringify(onlyDenied ? [deniedSource.id] : [deniedSource.id, healthySource.id])}.map(id => METRO_RETAILER_SOURCES.find(source => source.id === id));
    const page = ${page.toString()};
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(url);
      const source = sources.find(candidate => new URL(url).hostname === candidate.host);
      if (!source) throw new Error('Fixture rejected an unregistered request: ' + url);
      const denied = source.id === ${JSON.stringify(deniedSource.id)} && ${Number(status)};
      return new Response(denied ? '' : page(source, source.id !== ${JSON.stringify(healthySource.id)} || ${Boolean(healthyPositive)}), { status: denied || 200 });
    };
    const bible = { match: () => ({ confidence: 1, record: { id: 'buffalo-trace', canonical: 'Buffalo Trace Bourbon', tier: 1 } }) };
    const result = await collectPrecisionProbes({ id: 'NY', label: 'New York', sources: sources.map(source => ({ label: source.sourceLabel })) }, bible, [], { sourceRunnerOptions: { schedule: false, maxAttempts: 3 } });
    let cache = null;
    try { cache = JSON.parse(await readFile('out/browser/NY-metro-retailer-inventory.json', 'utf8')); } catch {}
    const ledger = JSON.parse(await readFile('out/optimization/metro-source-attempts/NY.json', 'utf8'));
    process.stdout.write(JSON.stringify({ calls, cache, ledger, signals: result.signals, metadata: result.metadata }));
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: directory,
    env: {
      ...process.env,
      BOURBON_SIGNAL_SOURCE_CHECKPOINT_DIRECTORY: '',
      BOURBON_SIGNAL_QUARANTINED_SOURCES: '',
      BOURBON_SIGNAL_METRO_SOURCE_ATTEMPTS: '3',
      BOURBON_SIGNAL_METRO_SOURCE_DELAY_MS: '250',
      BOURBON_SIGNAL_NY_FORCE_METRO_LIVE: forceLive ? '1' : '0',
    },
    encoding: 'utf8', windowsHide: true, timeout: 20_000, maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(child.status, 0, child.stderr || child.error?.message);
  return JSON.parse(child.stdout);
}

test('403 source attempts survive an empty cache and fresh processes, while a healthy sibling resumes normally', (t) => {
  const directory = workspace(t);
  const first = sweep(directory);
  assert.equal(first.calls.filter((url) => new URL(url).hostname === deniedSource.host).length, 1);
  assert.equal(first.calls.filter((url) => new URL(url).hostname === healthySource.host).length, 1);
  assert.equal(first.cache.signals.length, 0);
  assert.equal(first.cache.sourceAttempts[deniedSource.id].status, 'access_denied');
  assert.equal(first.cache.sourceAttempts[deniedSource.id].httpStatus, 403);
  assert.equal(first.cache.sourceAttempts[healthySource.id].status, 'success');
  assert.deepEqual(first.ledger.sourceAttempts, first.cache.sourceAttempts);
  assert.equal(Date.parse(first.cache.sourceAttempts[deniedSource.id].nextAllowedAt), initialMs + METRO_ACCESS_DENIAL_BACKOFF_MS);

  const restarted = sweep(directory, { at: '2026-10-24T12:01:00.000Z' });
  assert.deepEqual(restarted.calls, []);
  assert.deepEqual(restarted.cache.sourceAttempts, first.cache.sourceAttempts);
  const targeted = sweep(directory, { at: '2026-10-24T12:02:00.000Z', onlyDenied: true, forceLive: true });
  assert.deepEqual(targeted.calls, []);
  assert.deepEqual(targeted.ledger.sourceAttempts[healthySource.id], first.ledger.sourceAttempts[healthySource.id]);
  const siblingsDue = sweep(directory, { at: '2026-10-24T16:00:00.000Z' });
  assert.equal(siblingsDue.calls.length, 1);
  assert.equal(new URL(siblingsDue.calls[0]).hostname, healthySource.host);
  assert.deepEqual(siblingsDue.cache.sourceAttempts[deniedSource.id], first.cache.sourceAttempts[deniedSource.id]);

  const forced = sweep(directory, { at: '2026-10-24T16:01:00.000Z', forceLive: true });
  assert.ok(forced.calls.every((url) => new URL(url).hostname === healthySource.host));
  const resumed = sweep(directory, { at: '2026-10-25T12:00:00.000Z', status: 0 });
  assert.equal(resumed.calls.filter((url) => new URL(url).hostname === deniedSource.host).length, 3);
  assert.equal(resumed.cache.sourceAttempts[deniedSource.id].status, 'success');
  assert.ok(resumed.signals.some((signal) => signal.sourceChain === deniedSource.id));
});

test('an all-denied sweep persists its attempt even without a successful source or positive row', (t) => {
  const directory = workspace(t);
  const first = sweep(directory, { onlyDenied: true });
  assert.equal(first.calls.length, 1);
  assert.equal(first.cache.signals.length, 0);
  assert.equal(first.cache.sourceAttempts[deniedSource.id].lastAttemptAt, initialAt);
  const restarted = sweep(directory, { onlyDenied: true, at: '2026-10-24T12:01:00.000Z', forceLive: true });
  assert.deepEqual(restarted.calls, []);
  // A failed nationwide publication must not require restoring its inventory
  // artifact in order to retain the separately saved attempt ledger.
  rmSync(path.join(directory, 'out/browser/NY-metro-retailer-inventory.json'));
  const ledgerOnly = sweep(directory, { onlyDenied: true, at: '2026-10-24T12:02:00.000Z', forceLive: true });
  assert.deepEqual(ledgerOnly.calls, []);
  assert.equal(ledgerOnly.cache, null);
  assert.deepEqual(ledgerOnly.ledger.sourceAttempts, first.ledger.sourceAttempts);
});

test('cache-only sweeps retain actual inventory observation times across process restart', (t) => {
  const directory = workspace(t);
  const first = sweep(directory, { healthyPositive: true });
  assert.equal(first.signals.length, 1);
  const restarted = sweep(directory, { at: '2026-10-24T12:01:00.000Z' });
  assert.equal(restarted.signals.length, 1);
  assert.equal(restarted.signals[0].observedAt, initialAt);
  assert.equal(restarted.signals[0].id, first.signals[0].id);
  assert.deepEqual(restarted.calls, []);
});

for (const status of [401, 403, 429]) {
  test(`required HTTP ${status} stops after one request and carries its denial through runtime serialization and selection`, async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: initialMs });
    let requests = 0;
    const adapter = createSourceAdapter({
      id: `metro:ny:${deniedSource.id}`, url: deniedSource.productsUrl,
      execute: () => collectMetroCityHiveRows(deniedSource, {
        fetchText: async (url) => { requests += 1; return { ok: false, status, url, text: '' }; },
        parseHtml: parseMetroCityHiveHtml,
      }),
    });
    const run = await runSourceAdapters([adapter], {}, { schedule: false, maxAttempts: 3, now: () => initialAt });
    assert.equal(requests, 1);
    assert.equal(run.results[0].attemptCount, 1);
    assert.equal(run.results[0].error.status, status);
    assert.equal(run.results[0].error.transient, false);
    const sourceAttempts = JSON.parse(JSON.stringify(updateMetroSourceAttempts({}, [deniedSource], run.results)));
    assert.deepEqual(selectMetroSourcesForRefresh([deniedSource], [], { nowMs: initialMs + 60_000, forceLive: true, sourceAttempts }), []);
  });

  test(`optional HTTP ${status} parks the source without re-aging retained inventory`, async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: initialMs });
    let requests = 0;
    const discovery = await collectMetroCityHiveRows(deniedSource, {
      fetchText: async (url) => (++requests === 1 ? { ok: true, status: 200, url, text: page(deniedSource) } : { ok: false, status, url, text: '' }),
      parseHtml: parseMetroCityHiveHtml,
    });
    assert.equal(requests, 2);
    const sourceAttempts = updateMetroSourceAttempts({}, [deniedSource], [{
      sourceId: `metro:ny:${deniedSource.id}`, ok: true, status: 'success', attemptCount: 1, finishedAt: initialAt,
      value: { metadata: { discovery: discovery.metadata } },
    }]);
    assert.equal(sourceAttempts[deniedSource.id].httpStatus, status);
    assert.deepEqual(selectMetroSourcesForRefresh([deniedSource], [], { nowMs: initialMs + 60_000, sourceAttempts, forceLive: true }), []);
    const originalAt = '2026-10-24T11:00:00.000Z';
    const retained = mergeMetroSourceCacheSignals([], [{ id: 'prior', sourceChain: deniedSource.id, observedAt: originalAt }], new Set(), new Map([[deniedSource.id, discovery.metadata]]));
    assert.equal(retained[0].observedAt, originalAt);
  });
}

test('legacy denial roadblocks remain parked when upgrading an empty metro cache', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: initialMs });
  const attempts = metroSourceAttempts({ generatedAt: initialAt, signals: [], roadblocks: [{ source: deniedSource.sourceLabel, status: 'permanent_error', error: 'Required page HTTP 403' }] }, [deniedSource]);
  assert.equal(attempts[deniedSource.id].httpStatus, 403);
  assert.deepEqual(selectMetroSourcesForRefresh([deniedSource], [], { nowMs: initialMs + 60_000, sourceAttempts: attempts, forceLive: true }), []);
});

test('attempt merge validates registry identities and gives the latest ledger attempt priority over cache or bootstrap', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: initialMs + 24 * 60 * 60_000 });
  const denied = { lastAttemptAt: initialAt, nextAllowedAt: '2026-10-25T12:00:00.000Z', status: 'access_denied', httpStatus: 403 };
  const success = { lastAttemptAt: '2026-10-25T12:00:00.000Z', nextAllowedAt: '2026-10-25T16:00:00.000Z', status: 'success', httpStatus: null };
  const attempts = mergeMetroSourceAttempts([deniedSource],
    { sourceAttempts: { [deniedSource.id]: denied, forged: denied } },
    { sourceAttempts: { [deniedSource.id]: success } },
    { sourceAttempts: { [deniedSource.id]: denied } },
  );
  assert.deepEqual(attempts, { [deniedSource.id]: success });
  assert.deepEqual(metroSourceAttempts({ sourceAttempts: { [deniedSource.id]: { ...denied, nextAllowedAt: '2099-01-01T00:00:00.000Z' } } }, [deniedSource]), {});
  assert.deepEqual(updateMetroSourceAttempts({ sourceAttempts: { [deniedSource.id]: denied } }, [deniedSource], [{ sourceId: `metro:ny:${deniedSource.id}`, status: 'circuit_open', attemptCount: 0, finishedAt: '2026-10-24T13:00:00.000Z' }]), { [deniedSource.id]: denied });
  assert.deepEqual(updateMetroSourceAttempts({ sourceAttempts: { [deniedSource.id]: denied } }, [deniedSource], [{ sourceId: `metro:ny:${deniedSource.id}`, status: 'collapsed', ok: false, attemptCount: 1, startedAt: '2026-10-24T11:59:00.000Z', finishedAt: '2026-10-24T12:00:00.001Z', error: { kind: 'collapsed', status: null } }]), { [deniedSource.id]: denied });
});

test('future ledger and legacy attempt clocks cannot suppress sources until a distant year', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: initialMs });
  const sourceAttempts = { [deniedSource.id]: { lastAttemptAt: '2099-01-01T00:00:00.000Z', nextAllowedAt: '2099-01-02T00:00:00.000Z', status: 'access_denied', httpStatus: 403 } };
  const normalized = metroSourceAttempts({ sourceAttempts }, [deniedSource]);
  assert.deepEqual(normalized, {});
  assert.deepEqual(selectMetroSourcesForRefresh([deniedSource], [], { nowMs: initialMs, sourceAttempts: normalized }), [deniedSource]);
  assert.deepEqual(metroSourceAttempts({ generatedAt: '2099-01-01T00:00:00.000Z', roadblocks: [{ source: deniedSource.sourceLabel, status: 403 }] }, [deniedSource]), {});
  const slightSkew = new Date(initialMs + METRO_ATTEMPT_CLOCK_SKEW_MS).toISOString();
  const accepted = metroSourceAttempts({ sourceAttempts: { [deniedSource.id]: { lastAttemptAt: slightSkew, nextAllowedAt: new Date(Date.parse(slightSkew) + METRO_ACCESS_DENIAL_BACKOFF_MS).toISOString(), status: 'access_denied', httpStatus: 403 } } }, [deniedSource]);
  assert.equal(accepted[deniedSource.id].lastAttemptAt, slightSkew);
});

test('malformed ledger/cache roots and non-array roadblocks do not crash metro selection', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: initialMs });
  for (const cache of [null, false, 7, 'bad', [], {}, { roadblocks: {} }, { roadblocks: 'bad' }, { roadblocks: [null, false, 7, {}] }, { sourceAttempts: 7, roadblocks: {} }]) {
    assert.deepEqual(metroSourceAttempts(cache, [deniedSource]), {});
  }
  const directory = workspace(t);
  const previousDirectory = process.cwd();
  process.chdir(directory);
  try {
    mkdirSync('out/optimization/metro-source-attempts', { recursive: true });
    for (const value of [null, false, 7, 'bad', [], { schemaVersion: 1, state: 'NY', roadblocks: {} }]) {
      writeFileSync('out/optimization/metro-source-attempts/NY.json', JSON.stringify(value));
      const attempts = await readMetroSourceAttempts('NY', [deniedSource], { roadblocks: {} });
      assert.ok(attempts && typeof attempts === 'object');
    }
  } finally { process.chdir(previousDirectory); }
});

for (const httpStatus of [401, 403, 429]) test(`HTTP ${httpStatus} controls denial backoff even when persisted status says success`, (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: initialMs + 30 * 60_000 });
  const raw = { [deniedSource.id]: { lastAttemptAt: initialAt, nextAllowedAt: new Date(initialMs + 60_000).toISOString(), status: 'success', httpStatus } };
  const normalized = metroSourceAttempts({ sourceAttempts: raw }, [deniedSource]);
  assert.equal(normalized[deniedSource.id].status, httpStatus === 429 ? 'rate_limited' : 'access_denied');
  assert.equal(normalized[deniedSource.id].lastAttemptAt, initialAt);
  assert.equal(Date.parse(normalized[deniedSource.id].nextAllowedAt), initialMs + (httpStatus === 429 ? 4 : 24) * 60 * 60_000);
  assert.deepEqual(selectMetroSourcesForRefresh([deniedSource], [], { nowMs: initialMs + 60_000, sourceAttempts: normalized, forceLive: true }), []);
  assert.deepEqual(selectMetroSourcesForRefresh([deniedSource], [], { nowMs: initialMs, sourceAttempts: raw, forceLive: true }), []);
});
