import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const precisionUrl = new URL('../src/collectors/precision-probes.mjs', import.meta.url).href;
const originalInventoryAt = '2026-10-22T21:50:00.000Z';
const rejectedInventoryAt = '2026-10-21T21:45:00.000Z';
const originalAtcAt = '2026-10-21T22:00:00.000Z';
const keys = ['ilg-events', 'kahns', 'penguin-liquor', 'doordash-frontier'];

function workspace(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'in-denial-runtime-'));
  t.after(() => {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('in-denial-runtime-'));
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

function sweep(directory, at) {
  const script = `
    import { mkdir, writeFile } from 'node:fs/promises';
    import childProcess from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    import { mock } from 'node:test';
    mock.timers.enable({ apis: ['Date'], now: new Date(${JSON.stringify(at)}) });
    const nativeCalls = [];
    // Fail closed even if a regression calls a curl-based retailer collector.
    // Replacing execFile before importing the real collector prevents all
    // native HTTP and records the attempted call for the assertions below.
    childProcess.execFile = (...args) => {
      nativeCalls.push(String(args[0]));
      const callback = args.at(-1);
      queueMicrotask(() => callback(Object.assign(new Error('Fixture forbids native process execution'), { code: 'FIXTURE_EXEC_DISABLED' }), '', ''));
      return {};
    };
    syncBuiltinESMExports();
    const calls = [];
    globalThis.fetch = async value => {
      const url = String(value);
      calls.push(url);
      const host = new URL(url).hostname;
      let html;
      if (host === 'bourbonworld.net') html = '<html><h1>Bourbon World</h1><p>Public retailer catalog</p></html>';
      else if (host === 'www.paylessliquors.info') html = '<html><p>Available at our East Street location</p><ul><li><p>Maker’s Mark Private Selections</p></li></ul><p>Stop by and pick your bottle up today!</p></html>';
      else throw new Error('Fixture forbids unexpected HTTP: ' + url);
      return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
    };
    await mkdir('out/browser', { recursive: true });
    await writeFile('out/browser/IN-atc-package-stores.json', JSON.stringify({ generatedAt: ${JSON.stringify(originalAtcAt)}, stores: [{ permitNumber: 'fixture-permit', name: 'Fixture package store', city: 'Indianapolis', zip: '46220', licenseType: 'package store' }] }));
    await writeFile('out/browser/IN-cityhive-retailer-inventory.json', JSON.stringify({
      generatedAt: '2026-10-22T21:55:00.000Z', roadblocks: [],
      signals: [
        { id: 'original-cityhive', state: 'IN', sourceLabel: "Cap n' Cork CityHive store inventory", sourceUrl: 'https://capncork.com/shop/?subtype=Bourbon', sourceChain: 'cap-n-cork', merchantId: 'fixture-merchant', rawName: 'Buffalo Trace Bourbon', canonicalBottleId: 'buffalo-trace', canonicalName: 'Buffalo Trace Bourbon', eventType: 'cityhive_store_inventory_result', locationPrecision: 'store_level', storeName: 'Cap n Cork fixture', storeId: 'cap-n-cork:fixture-merchant', storeAddress: '123 Main St, Fort Wayne, IN 46802', quantity: 2, canAlertAsInventory: true, canAlertAsWatch: true, observedAt: ${JSON.stringify(originalInventoryAt)}, raw: { chain: 'cap-n-cork' } },
        { id: 'bad-retained-wild-turkey', state: 'IN', sourceLabel: "Cap n' Cork CityHive store inventory", sourceUrl: 'https://capncork.com/shop/?subtype=Bourbon', sourceChain: 'cap-n-cork', merchantId: 'fixture-merchant', rawName: 'Wild Turkey 101 Bourbon 750ml', canonicalBottleId: 'wild-turkey-masters-keep', canonicalName: "Wild Turkey Master's Keep", eventType: 'cityhive_store_inventory_result', locationPrecision: 'store_level', storeName: 'Cap n Cork fixture', storeId: 'cap-n-cork:fixture-merchant', storeAddress: '123 Main St, Fort Wayne, IN 46802', quantity: 3, stale: true, sourceStale: true, canAlertAsInventory: false, canAlertAsWatch: false, observedAt: ${JSON.stringify(rejectedInventoryAt)}, raw: { chain: 'cap-n-cork' } },
      ],
    }));
    const { collectPrecisionProbes } = await import(${JSON.stringify(precisionUrl)});
    const records = [{ id: 'makers-private', canonical: "Maker's Mark Private Selection", tier: 'limited' }, { id: 'buffalo-trace', canonical: 'Buffalo Trace Bourbon', tier: 'allocated' }];
    const bible = { records, scanText: () => [], match: name => { const record = /maker/i.test(name) ? records[0] : /buffalo trace/i.test(name) ? records[1] : null; return record ? { record, confidence: 1 } : null; } };
    const result = await collectPrecisionProbes({ id: 'IN', label: 'Indiana fixture', sources: [] }, bible, [], { sourceRunnerOptions: { schedule: false, maxAttempts: 1 } });
    process.stdout.write(JSON.stringify({ calls, nativeCalls, result }));
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: directory, encoding: 'utf8', windowsHide: true, timeout: 20_000, maxBuffer: 4 * 1024 * 1024,
    env: {
      ...process.env,
      BOURBON_SIGNAL_TARGET_REDSKY_KEY: '',
      BOURBON_SIGNAL_IN_FORCE_ATC_LIVE: '0',
      BOURBON_SIGNAL_IN_FORCE_CITYHIVE_LIVE: '0',
      BOURBON_SIGNAL_IN_CITYHIVE_SOURCE_IDS: '',
      BOURBON_SIGNAL_QUARANTINED_SOURCES: '',
      BOURBON_SIGNAL_SOURCE_CHECKPOINT_DIRECTORY: '',
    },
  });
  assert.equal(child.status, 0, child.stderr || child.error?.message);
  return JSON.parse(child.stdout);
}

function assertHealthyAndSkipped(run, at) {
  assert.deepEqual(run.nativeCalls, [], 'the known denied curl lanes must not even execute a native process');
  assert.deepEqual(new Set(run.calls), new Set(['https://bourbonworld.net/', 'https://www.paylessliquors.info/barrel-selections']));
  assert.equal(run.calls.length, 2);
  const skipped = run.result.roadblocks.filter(row => row.status === 'source_policy_disabled');
  assert.deepEqual(skipped.map(row => row.sourceKey).sort(), [...keys].sort());
  for (const row of skipped) {
    assert.equal(row.sourceRuntimeId, 'precision:in');
    assert.equal(row.attemptCount, 0);
    assert.equal(row.historicalHttpStatus, 403);
    assert.equal(row.evidenceRuntimeFinishedAt, '2026-10-22T19:34:58.190Z');
    assert.equal(row.evidenceClockSemantics, 'aggregate_precision_finish_upper_bound');
    assert.equal(row.denialEvidence.sourceResultStatus, 'not_due');
    assert.equal(row.denialEvidence.sourceAttemptCount, 0);
    assert.equal(row.denialEvidence.reportFinishedAt, '2026-10-22T20:27:28.250Z');
    assert.equal(row.denialEvidence.individualRequestFinishedAt, null);
  }
  assert.ok(run.result.roadblocks.some(row => row.source === 'Bourbon World rare/allocated bottle list' && row.status === 'reachable_no_allocated_items_parsed'), 'a reachable parser-empty lane remains independently callable');
  assert.ok(run.result.roadblocks.some(row => row.source === 'Target Indiana RedSky store fulfillment' && row.status === 'missing_runtime_configuration'));
  const payless = run.result.signals.filter(row => row.sourceLabel === 'Payless Liquors East Street barrel selections');
  assert.equal(payless.length, 1, 'an independent working retailer must survive all four policy skips');
  assert.equal(payless[0].observedAt, at);
  assert.equal(payless[0].canonicalName, "Maker's Mark Private Selection");
  const retained = run.result.signals.find(row => row.id === 'original-cityhive');
  assert.equal(retained.observedAt, originalInventoryAt);
  assert.equal(retained.eventType, 'cityhive_store_inventory_result');
  assert.equal(retained.canonicalBottleId, 'buffalo-trace');
  assert.equal(retained.canonicalName, 'Buffalo Trace Bourbon');
  assert.equal(retained.quantity, 2);
  assert.equal(retained.canAlertAsInventory, true);
  assert.equal(retained.canAlertAsWatch, true);
  const rejected = run.result.signals.find(row => row.id === 'bad-retained-wild-turkey');
  assert.ok(rejected, 'bad retained identity remains available for diagnostic audit');
  assert.equal(rejected.eventType, 'retailer_source_identity_rejected');
  assert.equal(rejected.canonicalBottleId, null);
  assert.equal(rejected.canonicalName, null);
  assert.equal(rejected.canAlertAsInventory, false);
  assert.equal(rejected.canAlertAsWatch, false);
  assert.equal(rejected.observedAt, rejectedInventoryAt, 'identity rejection must not renew the original observation clock');
  assert.equal(rejected.rawName, 'Wild Turkey 101 Bourbon 750ml');
  assert.equal(rejected.raw.sourceIdentityRejection, 'wild_turkey_master_expression_missing');
  assert.equal(rejected.raw.rejectedCanonicalBottleId, 'wild-turkey-masters-keep');
  assert.equal(rejected.raw.rejectedCanonicalName, "Wild Turkey Master's Keep");
  assert.ok(!run.result.signals.some(row => row.id === rejected.id && row.eventType === 'cityhive_store_inventory_result'));
  assert.equal(run.result.signals.find(row => row.eventType === 'licensed_package_store_location').observedAt, originalAtcAt);
  assert.equal(run.result.sourceResults.length, 1);
  assert.equal(run.result.sourceResults[0].sourceId, 'precision:in');
  assert.equal(run.result.sourceResults[0].status, 'success');
  const policy = run.result.metadata.indianaSourcePolicy;
  assert.deepEqual([...policy.skippedSourceKeys].sort(), [...keys].sort());
  assert.equal(policy.disabledRouteAttempts, 0);
  assert.equal(policy.decisions.length, 4);
  for (const decision of policy.decisions) {
    assert.equal(decision.attemptCount, 0);
    assert.deepEqual(decision.denialEvidence, skipped.find(row => row.sourceKey === decision.sourceKey).denialEvidence);
  }
  assert.deepEqual(run.result.sourceResults[0].metadata.indianaSourcePolicy, policy, 'audit metadata survives runtime summary and JSON serialization');
  assert.deepEqual(run.result.metadata.cityHive, { requestCount: 0, skippedPageCount: 0, completedSequenceCount: 0, unknownPayloadCount: 0, cacheReused: true });
  assert.deepEqual(run.result.sourceResults[0].metadata.cityHive, run.result.metadata.cityHive, 'production runtime metadata retains the CityHive request audit');
}

test('real Indiana precision control flow skips all four denied lanes and retains successful independent sources', (t) => {
  const directory = workspace(t);
  const at = '2026-10-22T22:00:00.000Z';
  assertHealthyAndSkipped(sweep(directory, at), at);
});

test('a fresh-process follow-up keeps all four denied routes skipped and preserves original retained observation clocks', (t) => {
  const directory = workspace(t);
  const first = sweep(directory, '2026-10-22T22:00:00.000Z');
  const laterAt = '2026-10-22T22:05:00.000Z';
  const later = sweep(directory, laterAt);
  assertHealthyAndSkipped(later, laterAt);
  assert.deepEqual(later.result.roadblocks.filter(row => row.status === 'source_policy_disabled'), first.result.roadblocks.filter(row => row.status === 'source_policy_disabled'));
});

function cityHiveSweep(directory, mode) {
  const script = `
    import childProcess from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    import { mock } from 'node:test';
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-22T22:00:00.000Z') });
    childProcess.execFile = (...args) => { queueMicrotask(() => args.at(-1)(new Error('Fixture forbids native processes'), '', '')); return {}; };
    syncBuiltinESMExports();
    const mode = ${JSON.stringify(mode)};
    const calls = [];
    const stores = ['merchant-one', 'merchant-two'].map((id, index) => ({ id, display_name: 'Cap n Cork fixture ' + index, address: { full_address: (123 + index) + ' Main St, Fort Wayne, IN 46802', state: 'IN' } }));
    function product(id, merchantId = 'merchant-one') {
      const store = stores.find(row => row.id === merchantId);
      return { id, name: 'Buffalo Trace Bourbon 750ml', basic_category: ['bourbon'], merchants: [{ product_options: [{ product_id: id, option_id: 'option-' + id, merchant_id: merchantId, merchant_name: store.display_name, full_address: store.address.full_address, quantity: 2, price: 34.99, option_display_data: { name: 'Buffalo Trace Bourbon 750ml' }, option_params: { size: { quantity: 750, measure: 'ml' } }, product_url: 'https://capncork.com/shop/product/' + id }] }] };
    }
    const first = ['first-a', 'first-b', 'first-c'].map(id => product(id));
    function html(products, withStores = true) {
      const payload = { products, merchant_configs: withStores ? stores.map(merchant => ({ merchant })) : [] };
      return '<script>JSON.parse(decodeURIComponent("' + encodeURIComponent(JSON.stringify(payload)) + '"))</script>';
    }
    globalThis.fetch = async value => {
      const url = String(value);
      calls.push(url);
      const parsed = new URL(url);
      if (parsed.hostname !== 'capncork.com') throw new Error('Unregistered fixture request: ' + url);
      const merchantId = parsed.searchParams.get('merchant-id');
      let body;
      if (merchantId) body = html([product('merchant-product-' + merchantId, merchantId)]);
      else if (parsed.pathname !== '/shop/') body = html([], false);
      else if (mode === 'unknown') body = '<html><h1>Unknown HTTP 200 shell</h1></html>';
      else if (mode === 'empty') body = html([]);
      else if (mode === 'tail-change') body = html([...first, product(parsed.searchParams.has('skip') ? 'tail-b' : 'tail-a')]);
      else body = html([...first, product('tail-a')]);
      return new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
    };
    const { collectIndianaCityHive } = await import(${JSON.stringify(precisionUrl)});
    const record = { id: 'buffalo-trace', canonical: 'Buffalo Trace Bourbon', tier: 'allocated' };
    const result = await collectIndianaCityHive({ id: 'IN' }, { match: () => ({ record, confidence: 1 }), records: [record] }, '2026-10-22T22:00:00.000Z');
    process.stdout.write(JSON.stringify({ calls, result }));
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: directory, encoding: 'utf8', windowsHide: true, timeout: 20_000, maxBuffer: 4 * 1024 * 1024,
    env: {
      ...process.env,
      BOURBON_SIGNAL_IN_FORCE_CITYHIVE_LIVE: '1',
      BOURBON_SIGNAL_IN_CITYHIVE_SOURCE_IDS: 'cap-n-cork',
      BOURBON_SIGNAL_IN_CITYHIVE_MAX_PAGES: '8',
      BOURBON_SIGNAL_IN_CITYHIVE_PER_STORE_MAX_PAGES: '1',
      BOURBON_SIGNAL_IN_CITYHIVE_PAGE_DELAY_MS: '0',
      BOURBON_SIGNAL_IN_CITYHIVE_SOURCE_DELAY_MS: '0',
    },
  });
  assert.equal(child.status, 0, child.stderr || child.error?.message);
  return JSON.parse(child.stdout);
}

test('recognized empty and whole-payload repeats stop remaining category pages while queued merchant pages still produce stock', (t) => {
  for (const mode of ['repeat', 'empty']) {
    const run = cityHiveSweep(workspace(t), mode);
    const expectedRequests = mode === 'repeat' ? 6 : 5;
    assert.equal(run.calls.length, expectedRequests);
    assert.equal(run.result.metadata.requestCount, expectedRequests);
    assert.equal(run.result.metadata.skippedPageCount, 26 - expectedRequests);
    assert.equal(run.result.metadata.completedSequenceCount, 3);
    assert.equal(run.result.metadata.unknownPayloadCount, 0);
    assert.deepEqual(run.result.metadata.completedSourceIds, ['cap-n-cork']);
    for (const merchantId of ['merchant-one', 'merchant-two']) {
      assert.ok(run.calls.some(url => new URL(url).searchParams.get('merchant-id') === merchantId));
      assert.ok(run.result.signals.some(row => row.raw?.option?.product_id === 'merchant-product-' + merchantId && row.quantity === 2));
    }
    assert.ok(run.calls.some(url => new URL(url).pathname === '/pages/friday-night-flyer'), 'other seeds remain independently eligible');
    assert.ok(run.calls.some(url => new URL(url).pathname === '/events'));
  }
});

test('pages sharing the first three products still retain a changed tail before a full-payload repeat ends pagination', (t) => {
  const run = cityHiveSweep(workspace(t), 'tail-change');
  assert.equal(run.calls.length, 7);
  assert.equal(run.result.metadata.requestCount, 7);
  assert.equal(run.result.metadata.skippedPageCount, 19);
  assert.ok(run.result.signals.some(row => row.raw?.option?.product_id === 'tail-a'));
  assert.ok(run.result.signals.some(row => row.raw?.option?.product_id === 'tail-b'));
  const defaultPages = run.calls.filter(url => new URL(url).pathname === '/shop/' && !new URL(url).searchParams.has('merchant-id'));
  assert.deepEqual(defaultPages.map(url => new URL(url).searchParams.get('skip')), [null, '18', '36']);
});

test('an unknown HTTP 200 shell is reported as unrecognized and never counts as an authoritative completed source', (t) => {
  const run = cityHiveSweep(workspace(t), 'unknown');
  assert.equal(run.calls.length, 3);
  assert.equal(run.result.metadata.requestCount, 3);
  assert.equal(run.result.metadata.unknownPayloadCount, 1);
  assert.deepEqual(run.result.metadata.completedSourceIds, []);
  assert.ok(run.result.roadblocks.some(row => row.status === 'unrecognized_inventory_payload'));
  assert.deepEqual(run.result.signals, []);
});
