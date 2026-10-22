import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectFloridaAbcExpansion,
  FLORIDA_ABC_DIRECTORY_QUERIES,
  FLORIDA_ABC_DIRECTORY_URLS,
  FLORIDA_ABC_SEARCHSPRING_MAX_PAGES,
  FLORIDA_ABC_SEARCHSPRING_URL,
  FLORIDA_ABC_STORES,
} from '../src/collectors/florida-15-20-expansion.mjs';
import { isFloridaRetailerInventory } from '../src/florida-retailer-policy.mjs';

const observedAt = new Date().toISOString();
const matchBottle = name => ({ record: { id: name, canonical: name, tier: 'high_signal' }, match: { confidence: 0.96 } });

function product(sku, stores = FLORIDA_ABC_STORES) {
  return {
    name: `Maker's Mark Bourbon 750ml ${sku}`, sku, url: `/makers-mark-bourbon/${sku}`, ss_in_stock: '1',
    ss_location_availability: stores.map(store => Number(store.storeNumber)),
    ss_locations: JSON.stringify(Object.fromEntries(stores.map(store => [store.storeNumber, {
      value: store.name, child_sku: `${sku}-${store.storeNumber}`, inventory_level: 2,
      id: 6000 + Number(store.storeNumber), option_value_id: 7000 + Number(store.storeNumber), calculated_price: 34.99,
    }]))),
  };
}

function pagePayload(page, { results = [product(String(page))], totalPages = 2, ...pagination } = {}) {
  return { results, pagination: { currentPage: page, totalPages, totalResults: totalPages * 100, perPage: 100, ...pagination } };
}

async function collect(pages) {
  const calls = [];
  const responses = new Map(FLORIDA_ABC_DIRECTORY_QUERIES.map((query, index) => [FLORIDA_ABC_DIRECTORY_URLS[index], {
    retailLocations: FLORIDA_ABC_STORES.slice(index * 40, (index + 1) * 40).map(store => ({
      store_code: Number(store.storeNumber), name: store.name, address: store.officialAddress,
      city: store.city, state: store.state, zip: store.zip,
      latitude: store.officialLatitude, longitude: store.officialLongitude, is_active: true,
    })),
  }]));
  const result = await collectFloridaAbcExpansion({
    observedAt, matchBottle,
    fetchText: async (url, options) => {
      calls.push({ url, options });
      if (responses.has(url)) return { ok: true, status: 200, text: JSON.stringify(responses.get(url)) };
      const page = Number(new URL(url).searchParams.get('page') || 1);
      const payload = pages(page);
      if (payload?.status) return { ok: false, ...payload };
      assert.ok(payload, `unexpected page ${page}`);
      return { ok: true, status: 200, text: JSON.stringify(payload) };
    },
  });
  return { ...result, calls, pageCalls: calls.filter(call => call.url.startsWith(FLORIDA_ABC_SEARCHSPRING_URL)) };
}

test('ABC continuation adds exact-store products and accepts a final page covering a store subset', async () => {
  const result = await collect(page => pagePayload(page, { results: page === 1 ? [product('1')] : [product('2', FLORIDA_ABC_STORES.slice(0, 3))] }));
  assert.equal(result.signals.length, 129);
  assert.equal(result.roadblocks.length, 0);
  assert.ok(result.signals.every(isFloridaRetailerInventory));
  assert.equal(new Set(result.signals.map(row => row.id)).size, 129);
  assert.equal(new Set(result.signals.map(row => row.storeId)).size, 126);
  assert.equal(result.pageCalls.length, 2);
  assert.ok(result.pageCalls.every(call => call.options.maxBytes === 4 * 1024 * 1024 && call.options.redirect === 'manual'));
});

test('ABC pagination is capped at three canonical source requests and duplicate products do not inflate inventory', async () => {
  const result = await collect(page => pagePayload(page, { totalPages: 20, results: [product('same')] }));
  assert.equal(result.pageCalls.length, FLORIDA_ABC_SEARCHSPRING_MAX_PAGES);
  assert.equal(result.signals.length, 126);
  assert.deepEqual(result.pageCalls.map(call => Number(new URL(call.url).searchParams.get('page') || 1)), [1, 2, 3]);
});

test('ABC access denial stops immediately and retains earlier policy-qualified inventory', async () => {
  const result = await collect(page => page === 1 ? pagePayload(1) : { status: 429, retryAfterSeconds: 60 });
  assert.equal(result.pageCalls.length, 2);
  assert.equal(result.signals.length, 126);
  assert.equal(result.roadblocks.length, 1);
  assert.equal(result.roadblocks[0].status, 429);
});

test('ABC invalid continuation identity or pagination cannot contribute inventory', async () => {
  for (const invalid of [
    pagePayload(2, { currentPage: 1 }),
    pagePayload(2, { totalResults: 300 }),
    pagePayload(2, { results: [product('2', [{ ...FLORIDA_ABC_STORES[0], name: 'Forged store' }])] }),
    pagePayload(2, { results: Array.from({ length: 101 }, () => product('2')) }),
  ]) {
    const result = await collect(page => page === 1 ? pagePayload(1) : invalid);
    assert.equal(result.pageCalls.length, 2);
    assert.equal(result.signals.length, 126);
    assert.equal(result.roadblocks.length, 1);
    assert.ok(result.signals.every(row => row.productId === '1'));
  }
});

test('ABC unpaginated first-page payload does not guess additional URLs', async () => {
  const result = await collect(() => ({ results: [product('1')] }));
  assert.equal(result.signals.length, 126);
  assert.equal(result.pageCalls.length, 1);
  assert.equal(result.roadblocks.length, 0);
});
