import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNevadaAlbertsonsXapi, NEVADA_RETAILER_SOURCES, mergeNevadaSourceCacheSignals } from '../src/collectors/nevada-retailer-surfaces.mjs';
import { isNevadaRetailerInventory } from '../src/nevada-retailer-policy.mjs';
const merchantId = '662';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/nevada-xapi/2026-10-25-store662-public.json', import.meta.url), 'utf8'));
const source = NEVADA_RETAILER_SOURCES.find(row => row.id === 'albertsons-las-vegas-662');
const product = (patch = {}) => ({ id: '123456', pid: '123456', storeId: merchantId, name: 'Eagle Rare 10 Year Bourbon 750ml', channelInventory: { instore: '1', instoreItemQty: 4 }, ...patch });
const parse = (row, options = { merchantId }) => parseNevadaAlbertsonsXapi({ response: { docs: [row] } }, options);

test('frozen source context and exact returned store are mandatory, including no coercible store objects', () => {
  for (const storeId of [undefined, null, '', '9999', 662, [merchantId], { toString: () => merchantId }]) assert.deepEqual(parse(product({ storeId })), []);
  for (const options of [{}, { merchantId: '9999' }, { merchantId: 662 }, { merchantId: true }, { merchantId: [merchantId] }]) assert.deepEqual(parse(product(), options), []);
  assert.deepEqual(parseNevadaAlbertsonsXapi({ response: { docs: [product()] } }), []);
  assert.equal(parse(product()).length, 1);
});

test('provided stock counts reject bool/array/object/zero/negative/fraction/unsafe/hex/scientific/null', () => {
  for (const count of [true, false, [1], ['4'], {}, null, undefined, '', ' ', 0, '0', -1, '-1', 1.5, '1.5', Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '0x10', '1e2', '+4', '04']) {
    const row = product({ channelInventory: { instore: '1', instoreItemQty: count } });
    assert.deepEqual(parse(row), [], String(count));
  }
});

test('only genuinely absent count remains binary and exact/sentinel semantics stay unchanged', () => {
  for (const [count, quantity, semantics] of [[4, 4, 'exact_retailer_quantity'], [' 4 ', 4, 'exact_retailer_quantity'], [99, 99, 'exact_retailer_quantity'], [100, 0, 'binary_retailer_orderable_no_exact_count'], ['194', 0, 'binary_retailer_orderable_no_exact_count']]) {
    const rows = parse(product({ channelInventory: { instore: 1, instoreItemQty: count } }));
    assert.equal(rows.length, 1); assert.equal(rows[0].quantity, quantity); assert.equal(rows[0].inventorySemantics, semantics);
  }
  const rows = parse(product({ channelInventory: { instore: '1' } }));
  assert.equal(rows.length, 1); assert.equal(rows[0].quantity, 0); assert.equal(rows[0].reportedQuantity, null);
  assert.equal(rows[0].inventorySemantics, 'binary_retailer_orderable_no_exact_count');
});

test('quantity alias remains supported but contradictory or invalid aliases fail closed', () => {
  assert.equal(parse(product({ channelInventory: { inStore: '1', inStoreItemQty: '7' } }))[0].quantity, 7);
  assert.equal(parse(product({ channelInventory: { instore: '1', inStore: 1, instoreItemQty: 7, inStoreItemQty: '7' } }))[0].quantity, 7);
  for (const inventory of [{ instore: '1', instoreItemQty: 7, inStoreItemQty: 0 }, { instore: '1', instoreItemQty: null, inStoreItemQty: 7 }, { instore: '1', instoreItemQty: 7, inStoreItemQty: 8 }]) assert.deepEqual(parse(product({ channelInventory: inventory })), []);
});

test('in-store flag must be primitive positive, with no delivery substitution or conflicting flag', () => {
  for (const inventory of [{}, { delivery: '1', instoreItemQty: 4 }, { instore: true, instoreItemQty: 4 }, { instore: [1], instoreItemQty: 4 }, { instore: '0', instoreItemQty: 4 }, { instore: '1', inStore: '0', instoreItemQty: 4 }]) assert.deepEqual(parse(product({ channelInventory: inventory })), []);
});

test('actual captured662 BT/Bulleit fields preserve product identity and positive counts', () => {
  assert.equal(fixture.sourceCapture.sha256, 'd957a2660e2c37b20aec0686ee19cd8fa7e083616eab5efe8df1cd87759661f8');
  assert.equal(fixture.sourceCapture.totalResponseDocs, 99);
  const rows = parseNevadaAlbertsonsXapi(fixture, { merchantId });
  assert.deepEqual(rows.map(row => [row.productId, row.variantId, row.quantity]), [['960051942', '960051942', 24], ['189032017', '189032017', 8]]);
  assert.ok(rows.every(row => row.inventorySemantics === 'exact_retailer_quantity'));
  assert.deepEqual(parseNevadaAlbertsonsXapi(fixture, { merchantId: '4024' }), []);
  assert.deepEqual(parseNevadaAlbertsonsXapi(fixture, { merchantId: '1059' }), []);
});

test('existing size/pack/alcohol guards still reject unsafe input after adding store context', () => {
  for (const name of ['Eagle Rare Bourbon 375ml', 'Eagle Rare Bourbon 50ml', 'Eagle Rare Bourbon gift set 750ml', 'Eagle Rare Bourbon 3-pack 750ml']) assert.deepEqual(parse(product({ name })), []);
  assert.deepEqual(parse(product({ restrictedValue: 'true', containsAlcohol: false })), []);
  assert.deepEqual(parseNevadaAlbertsonsXapi('{bad', { merchantId }), []);
});

test('only accepted store-bound row can reach the frozen public identity policy in the offline assembly', () => {
  const rows = parse(product()); const row = rows[0];
  const stamped = { state: 'NV', stateCode: 'NV', sourceChain: source.id, sourceLabel: source.sourceLabel,
    sourceUrl: `https://${source.host}/shop/product-details.${row.handle}.html`, merchantId,
    storeId: source.store.id, storeAddress: source.store.address, city: source.store.city,
    productId: row.productId, variantId: row.variantId, eventType: 'retailer_store_inventory_result',
    locationPrecision: 'store_level', sourceAvailabilityVerified: true, quantity: row.quantity,
    inventorySemantics: row.inventorySemantics, raw: { fulfillmentPolicyVerified: true } };
  assert.equal(isNevadaRetailerInventory(stamped), true);
  assert.deepEqual(parse(product({ storeId: '9999' })), []);
});

// Actual saved collectNevada function body, offline I/O only. The signal mapper
// isolates canonical/presentation work outside this parser task; it never grants
// source eligibility. The parser, source definition and cache merge are real.
async function actualCollector(payload) {
  const code = readFileSync(new URL('../src/collectors/precision-probes.mjs', import.meta.url), 'utf8');
  const begin = code.indexOf('async function collectNevada('), end = code.indexOf('async function collectKentucky(', begin);
  assert.ok(begin > 0 && end > begin); let requests = 0, cacheWrites = 0;
  const dependencies = { NEVADA_RETAILER_SOURCES: [source], readNevadaRetailerCache: async () => null,
    process: { env: {} }, NEVADA_RETAILER_ARTIFACT_PATH: 'synthetic-cache-not-written',
    cachedNevadaSignals: () => [], textFetch: async () => { requests++; return { ok: true, status: 200, text: JSON.stringify(payload) }; },
    AZ_ALBERTSONS_SEARCH_KEY: 'offline-synthetic-token', sleep: async () => {}, NEVADA_RETAILER_SOURCE_DELAY_MS: 900,
    parseNevadaAlbertsonsXapi, mergeNevadaSourceCacheSignals,
    writeNevadaRetailerCache: async () => { cacheWrites++; },
    nevadaRetailerSignal: (_config, configured, row) => ({ ...row, id: row.productId, eventType: 'retailer_store_inventory_result', sourceChain: configured.id }) };
  const fn = new Function(...Object.keys(dependencies), code.slice(begin, end) + '\nreturn collectNevada;')(...Object.values(dependencies));
  const result = await fn({ id: 'NV' }, null); return { result, requests, cacheWrites };
}
test('actual collector passes source merchantId to actual parser; foreign captured store never becomes a source signal', async () => {
  const good = await actualCollector(fixture); assert.equal(good.requests, 1); assert.equal(good.result.signals.length, 2);
  const changed = structuredClone(fixture); for (const doc of changed.response.docs) doc.storeId = '4024';
  const bad = await actualCollector(changed); assert.equal(bad.requests, 1); assert.equal(bad.result.signals.length, 0); assert.equal(bad.cacheWrites, 0);
  assert.ok(bad.result.roadblocks.some(row => row.status === 'reachable_no_safe_inventory_rows'));
});
