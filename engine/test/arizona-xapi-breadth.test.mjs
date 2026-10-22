import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARIZONA_XAPI_BASELINE_STORE_IDS,
  arizonaXapiRequestPlan,
  isArizonaXapiStore,
  mergeArizonaXapiStores,
  parseArizonaXapiInventory,
  selectArizonaXapiStores,
} from '../src/collectors/arizona-xapi.mjs';
import { collectArizonaAlbertsons } from '../src/collectors/precision-probes.mjs';

const nowMs = Date.parse('2026-10-22T17:42:40.520Z');
const observedAt = new Date(nowMs).toISOString();
function store(locationId, city = 'Phoenix', distance = 1, overrides = {}) {
  return { locationId: String(locationId), polarisBannerName: 'safeway', domainName: 'Safeway', distance, address: { line1: `${locationId} Main St`, city, state: 'AZ', zipcode: '85001' }, ...overrides };
}
const baseline = ARIZONA_XAPI_BASELINE_STORE_IDS.map((id, index) => store(id, index < 12 ? 'Phoenix' : 'Tucson', 20 + index));
const additions = [
  store('1604', 'Chandler', 1.67), store('1605', 'Chandler', 3.05),
  store('1225', 'Flagstaff', null), store('2028', 'Flagstaff', 13.06),
  store('1534', 'Gilbert', 6.97), store('1207', 'Sedona', null),
  store('1639', 'Williams', 25.64), store('2052', 'Cottonwood', 45.96),
  store('9888', 'Phoenix', 0), store('9889', 'Phoenix', 0.1),
];

test('geographical additions preserve all existing24 premises and favor unrepresented cities', () => {
  const selected = selectArizonaXapiStores([...baseline, ...additions]);
  assert.equal(selected.length, 32);
  assert.deepEqual(selected.slice(0, 24).map((row) => row.locationId).sort(), [...ARIZONA_XAPI_BASELINE_STORE_IDS].sort());
  assert.deepEqual(new Set(selected.slice(24).map((row) => row.address.city)), new Set(['Chandler', 'Flagstaff', 'Gilbert', 'Sedona', 'Williams', 'Cottonwood']));
  assert.ok(selected.some((row) => row.locationId === '1225'));
  assert.ok(selected.some((row) => row.locationId === '1207'));
  assert.ok(!selected.some((row) => row.locationId === '9888'));
  assert.deepEqual(selectArizonaXapiStores([...additions, ...baseline].reverse()).map((row) => row.locationId), selected.map((row) => row.locationId));
});

test('missingdistance, zero distance and duplicate resolver lanes produce stable exactAZ identities', () => {
  const a = store('1604', 'Chandler', 0);
  const b = store('1225', 'Flagstaff', null);
  assert.equal(selectArizonaXapiStores([b, a], { maxStores: 1 })[0].locationId, '1604');
  const stores = new Map(), conflicts = new Set();
  mergeArizonaXapiStores(stores, { instore: { stores: [a, b] }, pickup: { stores: [{ ...a, distance: 4 }] } }, conflicts);
  assert.equal(stores.size, 2);
  assert.equal(stores.get('1604').distance, 0);
  assert.deepEqual([...stores.get('1604').lanes], ['instore', 'pickup']);
  mergeArizonaXapiStores(stores, { instore: { stores: [{ ...a, address: { ...a.address, line1: '999 Different Ave' } }] } }, conflicts);
  mergeArizonaXapiStores(stores, { instore: { stores: [a] } }, conflicts);
  assert.ok(conflicts.has('1604'));
  assert.ok(!stores.has('1604'));
  for (const invalid of [null, {}, { ...a, locationId: 'wrong' }, { ...a, polarisBannerName: 'vons' }, { ...a, polarisBannerName: 'albertsons' }, { ...a, address: { ...a.address, state: 'NV' } }, { ...a, address: { ...a.address, country: 'CA' } }, { ...a, address: { ...a.address, zipcode: 'unknown' } }, { ...a, address: { ...a.address, city: '' } }, { ...a, address: { ...a.address, line1: '' } }]) {
    assert.equal(isArizonaXapiStore(invalid), false);
    assert.deepEqual(selectArizonaXapiStores([invalid]), []);
  }
  assert.deepEqual(selectArizonaXapiStores([a, { ...a, address: { ...a.address, line1: '999 Different Ave' } }]), []);
});

test('default32 bourbon plus rotating16 rare requests stay within48 and honor explicit overrides', () => {
  const all = [...baseline, ...additions, ...Array.from({ length: 55 }, (_, i) => store(8000 + i, `City${i}`, i))];
  const terms = ['bourbon', 'weller', 'buffalo trace'];
  const plan = arizonaXapiRequestPlan(all, { terms, nowMs });
  assert.equal(plan.length, 32);
  assert.ok(plan.some((row) => row.store.locationId === '1604'));
  assert.ok(plan.some((row) => row.store.locationId === '1225'));
  assert.equal(plan.flatMap((row) => row.terms).length, 48);
  assert.equal(plan.filter((row) => row.terms.length === 2).length, 16);
  const today = plan.filter((row) => row.terms.length === 2).map((row) => row.store.locationId);
  const tomorrow = arizonaXapiRequestPlan(all, { terms, nowMs: nowMs + 86_400_000 }).filter((row) => row.terms.length === 2).map((row) => row.store.locationId);
  assert.equal(new Set([...today, ...tomorrow]).size, 32);
  assert.equal(arizonaXapiRequestPlan(all, { maxStores: 10, terms, nowMs }).length, 10);
  const high = arizonaXapiRequestPlan(all, { maxStores: 80, terms, nowMs });
  assert.equal(high.length, 48);
  assert.equal(high.flatMap((row) => row.terms).length, 48);
});

test('each store visits all four rare terms across even and odd rotating cohorts within the daily budget', () => {
  const rareTerms = ["blanton's", 'weller', 'buffalo trace', 'e.h. taylor'];
  for (const count of [32, 31, 20]) {
    const all = Array.from({ length: count }, (_, index) => store(5000 + index, `City${index}`, index));
    const visited = new Map(all.map((row) => [row.locationId, []]));
    for (let day = 0; day < 8; day += 1) {
      const plan = arizonaXapiRequestPlan(all, { maxStores: count, terms: ['bourbon', ...rareTerms], nowMs: nowMs + day * 86_400_000 });
      assert.equal(plan.length, count);
      assert.ok(plan.flatMap((row) => row.terms).length <= 48);
      assert.equal(plan.filter((row) => row.terms.length === 2).length, 16);
      for (const row of plan) if (row.terms[1]) visited.get(row.store.locationId).push(row.terms[1]);
    }
    for (const [id, terms] of visited) assert.deepEqual(new Set(terms), new Set(rareTerms), `${count}-store cohort omitted a term for ${id}`);
    const visits = [...visited.values()].map((terms) => terms.length);
    assert.ok(Math.max(...visits) - Math.min(...visits) <= 1);
    if (count === 32) assert.ok(visits.every((value) => value === 4));
  }
});

test('collector enforces80override search ceiling and reports exact selected premises and every request', async () => {
  const all = [...baseline, ...Array.from({ length: 60 }, (_, i) => store(8000 + i, `City${i}`, i))];
  const urls = [];
  const result = await collectArizonaAlbertsons({ id: 'AZ' }, { match: () => null }, observedAt, {
    zips: ['85224'], maxStores: 80, nowMs, sleep: async () => {},
    fetchText: async (url) => {
      urls.push(url);
      return { ok: true, status: 200, text: JSON.stringify(url.includes('storeresolver') ? { instore: { stores: all } } : { response: { docs: [] } }) };
    },
  });
  assert.equal(urls.length, 49);
  assert.equal(result.metadata.selectedStores.length, 48);
  assert.equal(result.metadata.baselineStores.length, 24);
  assert.equal(result.metadata.bourbonSearchCount, 48);
  assert.equal(result.metadata.rareSearchCount, 0);
  assert.equal(result.metadata.totalSearchCount, 48);
  assert.equal(result.metadata.maxSearchCount, 48);
  assert.equal(result.metadata.requests.length, 49);
  assert.ok(result.metadata.selectedStores.every((row) => row.city && /, AZ \d{5}/.test(row.address)));
});

test('collector stops a denied host without retrying remaining resolver or inventory routes', async () => {
  const urls = [];
  const result = await collectArizonaAlbertsons({ id: 'AZ' }, { match: () => null }, observedAt, {
    zips: ['85224', '86001'], maxStores: 32, nowMs, sleep: async () => {},
    fetchText: async (url) => { urls.push(url); return { ok: false, status: 403, text: '{}' }; },
  });
  assert.equal(urls.length, 1);
  assert.equal(result.metadata.totalSearchCount, 0);
  assert.equal(result.metadata.requests[0].status, 403);
});

test('inventory denial stops only that banner host while preserving reachable sibling stock', async () => {
  const albertsons = store('2997', 'Chandler', 2, { polarisBannerName: 'albertsons', domainName: 'Albertsons' });
  const urls = [];
  const result = await collectArizonaAlbertsons({ id: 'AZ' }, { match: () => null }, observedAt, {
    zips: ['85224'], maxStores: 3, nowMs, sleep: async () => {},
    fetchText: async (url) => {
      urls.push(url);
      if (url.includes('storeresolver')) return { ok: true, status: 200, text: JSON.stringify({ instore: { stores: [store('1604', 'Chandler'), store('1225', 'Flagstaff'), albertsons] } }) };
      return new URL(url).host === 'www.safeway.com'
        ? { ok: false, status: 429, text: '{}' }
        : { ok: true, status: 200, text: JSON.stringify({ response: { docs: [] } }) };
    },
  });
  assert.equal(urls.filter((url) => url.includes('search/substitute') && new URL(url).host === 'www.safeway.com').length, 1);
  assert.equal(urls.filter((url) => new URL(url).host === 'www.albertsons.com').length, 2);
  assert.equal(result.metadata.requests.filter((row) => row.status === 429).length, 1);
  assert.equal(result.metadata.totalSearchCount, 3);
});

test('inventory requires exact store, AZ premises, safe format and positive stock; binary stock retains unknown quantity', () => {
  const sourceStore = store('1604', 'Chandler');
  const product = { id: '189032017', storeId: '1604', name: 'Bulleit Bourbon Whiskey - 750 Ml', price: 27.99, channelInventory: { instore: '1', instoreItemQty: 5 } };
  const bible = { match: () => ({ confidence: 1, record: { id: 'bulleit', canonical: 'Bulleit Bourbon', tier: 'standard' } }) };
  const parse = (row = product, selectedStore = sourceStore) => parseArizonaXapiInventory({ response: { docs: [row, row] } }, selectedStore, bible, { observedAt });
  assert.equal(parse().length, 1);
  assert.equal(parse()[0].quantity, 5);
  assert.equal(parse()[0].observedAt, observedAt);
  assert.equal(parse({ ...product, channelInventory: { instore: '1' } })[0].quantity, 0);
  for (const row of [null, {}, { ...product, storeId: '1225' }, { ...product, id: '' }, { ...product, name: 'Bulleit Bourbon Whiskey - 50 Ml' }, { ...product, channelInventory: { instore: '0', instoreItemQty: 5 } }, { ...product, channelInventory: { instore: '1', instoreItemQty: 0 } }, { ...product, channelInventory: { instore: '1', instoreItemQty: -1 } }, { ...product, channelInventory: { instore: '1', instoreItemQty: 'unknown' } }]) assert.deepEqual(parse(row), []);
  assert.deepEqual(parse(product, { ...sourceStore, address: { ...sourceStore.address, state: 'NV' } }), []);
  assert.deepEqual(parseArizonaXapiInventory({ response: { docs: {} } }, sourceStore, bible, { observedAt }), []);
  assert.deepEqual(parseArizonaXapiInventory({ response: { docs: [product] } }, sourceStore, bible, { observedAt: 'invalid' }), []);
});
