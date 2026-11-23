import assert from 'node:assert/strict';
import test from 'node:test';
import { BourbonBible } from '../src/core/bible.mjs';
import { bibleLookup, buildDrops } from '../src/export-site-contract.mjs';
import { canonicalizeSignal } from '../src/operational-report.mjs';
import { selectTennesseeCityHiveSourceCohort } from '../src/collectors/tennessee-cityhive-policy.mjs';
import { tennesseeStoresForSource } from '../src/collectors/tennessee-retailer-surfaces.mjs';
import {
  collectTennesseeRegionalGrabbl,
  TENNESSEE_REGIONAL_GRABBL_SOURCES,
  tennesseeGrabblProductRows,
  verifiedGrabblPremise,
} from '../src/collectors/tennessee-regional-grabbl.mjs';
import { filterPublishableTennesseeInventory } from '../src/tennessee-verification-policy.mjs';

test('the statewide rotation reserves space for all regions and rotates to the oldest attempt', () => {
  const sources = ['knox-one', 'knox-two', 'west-one', 'west-two', 'middle', 'east', 'rare', 'other'].map(id => ({ id }));
  const options = { cohortSize: 6, knoxvilleSourceIds: ['knox-one', 'knox-two'], knoxvilleSlots: 2,
    regionalSourceGroups: [['west-one', 'west-two'], ['east'], ['middle', 'rare']],
    prioritySourceIds: ['rare'], prioritySlots: 2,
    cache: { sourceAttemptAt: { 'west-one': '2026-11-20T23:00:00Z' } },
  };
  const cohort = selectTennesseeCityHiveSourceCohort(sources, options);
  assert.deepEqual(cohort.map(({ id }) => id), ['knox-one', 'knox-two', 'west-two', 'east', 'middle', 'rare']);
  const requested = selectTennesseeCityHiveSourceCohort(sources, { ...options, requestedSourceIds: ['west-one'] });
  assert.deepEqual(requested.map(({ id }) => id), ['west-one']);
});

const [source] = TENNESSEE_REGIONAL_GRABBL_SOURCES;
const [store] = tennesseeStoresForSource(source.id);
const branch = { storeId: store.merchantId, addressLine1: source.address, addressLine2: source.suite,
  city: 'Lebanon ', state: 'TN', postalCode: '37090', latitude: '36.19', longitude: '-86.40' };
const premise = { whiteLabelAppId: source.appId, stores: [branch] };
const offer = { storeId: store.merchantId, storeProductId: '6c9dfe79-b509-4521-a4db-f1698054b301', isInStock: true, productPrice: 79.99 };
const product = { productId: 'afab7c91-7e85-46e9-8a04-92a13742eb96', productName: 'Elijah Craig Barrel Proof', size: '750 ml', storeProduct: [offer] };
const record = { id: 'ecbp', canonical: 'Elijah Craig Barrel Proof', tier: 'allocated', normalizedKey: 'elijah craig barrel proof' };
const bible = new BourbonBible([record]);
const observedAt = new Date().toISOString();

test('Grabbl proves the exact app, current store, size and binary stock through publication', () => {
  const coords = verifiedGrabblPremise(premise, source, store);
  assert.deepEqual(coords, { lat: 36.19, lng: -86.4 });
  assert.equal(verifiedGrabblPremise({ ...premise, stores: [{ ...branch, addressLine2: '105' }] }, source, store), null);
  assert.equal(verifiedGrabblPremise({ ...premise, whiteLabelAppId: 'different' }, source, store), null);
  assert.equal(verifiedGrabblPremise({ ...premise, stores: [branch, branch] }, source, store), null);
  const parse = (row) => tennesseeGrabblProductRows([row], store, coords, bible, observedAt);
  for (const rejected of [
    { ...product, size: '375 ml' },
    { ...product, storeProduct: [{ ...offer, storeId: 'different' }] },
    { ...product, storeProduct: [{ ...offer, isInStock: false, quantity: 3 }] },
    { ...product, storeProduct: [{ ...offer, isInStock: 'true' }] },
    { ...product, storeProduct: [offer, { ...offer, isInStock: false }] },
  ]) assert.deepEqual(parse(rejected), []);
  const normalized = parse(product).map((row) => canonicalizeSignal(row, bible));
  const drops = filterPublishableTennesseeInventory(buildDrops(normalized, bibleLookup([record]), normalized));
  assert.equal(drops.length, 1);
  assert.equal(drops[0].storeAddress, store.address);
  assert.equal(drops[0].quantity, 0);
  assert.equal(drops[0].quantityIsExact, false);
  assert.equal(drops[0].reportedQuantity, 1);
});

test('a Grabbl denial stops sibling requests without erasing already verified rows', async () => {
  const requests = [];
  const result = await collectTennesseeRegionalGrabbl(bible, {
    observedAt, sleep: async () => {},
    fetchText: async (url, options) => {
      requests.push(url);
      assert.equal(options.maxRedirects, 0);
      assert.equal(options.headers['x-app-id'], source.appId);
      if (requests.length === 1) return { ok: true, url, status: 200, text: JSON.stringify({ data: premise }) };
      if (requests.length === 2) return { ok: true, url, status: 200, text: JSON.stringify({ data: { data: [product] } }) };
      return { ok: false, url, status: 429 };
    },
  });
  assert.equal(requests.length, 3);
  assert.equal(result.signals.length, 1);
  assert.equal(result.roadblocks[0].status, 429);
});
