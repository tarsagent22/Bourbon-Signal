import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BourbonBible } from '../src/core/bible.mjs';
import { NM_BASE_COHORT, NM_REVIEWED_COHORTS } from '../src/collectors/new-mexico-grocery-premises.mjs';
import {
  collectGroceryExpansion, groceryExpansionPremiseMatches, parseGroceryExpansionInventory,
} from '../src/collectors/grocery-xapi-expansion.mjs';
import { isGroceryExpansionOnSiteSignal } from '../src/grocery-xapi-policy.mjs';
import fixture from './fixtures/new-mexico-grocery-expansion/regional.json' with { type: 'json' };

const bible = new BourbonBible(fixture.records);
const { regional, roswell } = NM_REVIEWED_COHORTS;
const observedAt = fixture.observedAt;

test('the regional collector adds eight distinct premises and uses at most 64 requests', () => {
  assert.deepEqual(regional.sources.slice(0, 18), roswell.sources);
  assert.deepEqual(roswell.sources.slice(0, 16), NM_BASE_COHORT.sources);
  assert.equal(new Set(regional.sources.map(store => store.storeId)).size, 24);
  assert.equal(new Set(regional.sources.map(store => store.address)).size, 24);
  assert.equal(new Set(regional.zips).size, 8);
  assert.deepEqual([NM_BASE_COHORT.requestLimit, roswell.requestLimit, regional.requestLimit], [43, 48, 64]);
});

for (const { store, product, expected } of fixture.cases) {
  test(store.address.city + ' binds the captured offer to its exact in-store address', () => {
    const source = regional.sources.find(item => item.merchantId === store.locationId);
    assert.equal(source.premiseUrl, store.localPage);
    assert.equal(groceryExpansionPremiseMatches(source, store), true);
    assert.equal(groceryExpansionPremiseMatches(source, { ...store, address: fixture.cases.find(c => c.store !== store).store.address }), false);
    const parse = (item, shadowCohort) => parseGroceryExpansionInventory(
      { response: { docs: [item] } }, source, bible, { observedAt, shadowCohort });
    const [row] = parse(product, 'regional');
    assert.equal(row.canonicalName, expected);
    assert.equal(row.storeAddress, source.address);
    assert.equal(row.price, product.price);
    assert.equal(row.quantityIsExact, false);
    assert.equal(row.canAlertAsInventory, false);
    assert.equal(row.canAlertAsWatch, false);
    assert.equal(row.raw.shadowOnly, true);
    assert.equal(isGroceryExpansionOnSiteSignal(row), false);
    assert.deepEqual(parse(product, 'roswell'), []);
    assert.deepEqual(parse({ ...product, storeId: '0' }, 'regional'), []);
    assert.deepEqual(parse({ ...product, channelInventory: { instore: '0', shipping: '1' } }, 'regional'), []);
  });
}

test('incomplete regional resolver data cannot trigger inventory reads for missing premises', async () => {
  const cursorDir = await mkdtemp(path.join(tmpdir(), 'nm-regional-'));
  try {
    const { store, product } = fixture.cases[0];
    const fetchText = async url => {
      const request = new URL(url);
      if (request.pathname.includes('/storeresolver/')) {
        return { ok: true, status: 200, text: JSON.stringify({ instore: { stores: [store] } }) };
      }
      assert.equal(request.searchParams.get('storeid'), store.locationId);
      return { ok: true, status: 200, text: JSON.stringify({ response: { docs: [product] } }) };
    };
    const options = { shadowCohort: 'regional', fetchText, cursorDir, observedAt, sleep: async () => {} };
    const { metadata, signals } = await collectGroceryExpansion({ id: 'NM' }, bible, options);
    assert.equal(metadata.complete, false);
    assert.equal(metadata.maxRequestCount, 64);
    assert.equal(metadata.selectedStores.length, 24);
    assert.deepEqual(metadata.verifiedPremises, [signals[0].storeId]);
    assert.equal(signals.length, 1);
    await assert.rejects(collectGroceryExpansion({ id: 'WA' }, bible, options), /requires New Mexico/);
    await assert.rejects(collectGroceryExpansion({ id: 'NM' }, bible, { ...options, shadowCohort: 'unknown' }), /Unknown/);
  } finally {
    await rm(cursorDir, { recursive: true, force: true });
  }
});
