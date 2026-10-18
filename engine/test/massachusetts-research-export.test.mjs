import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { executeStateFixtures, validateStateFixtures } from '../src/verify-state-fixtures.mjs';
import { isMassachusettsResearchInventory } from '../src/massachusetts-research-policy.mjs';
import { MA_JULIOS_SOURCE as store } from '../src/collectors/massachusetts-retailer-surfaces.mjs';
import { isActiveCustomerStateRow } from '../src/export-site-contract.mjs';

test('MA executable golden fixtures cover actual collector-to-export projection', async () => {
  const payload = JSON.parse(await readFile(new URL('../data/state-fixtures/MA.json', import.meta.url)));
  assert.deepEqual(validateStateFixtures(payload), { ok: true, failures: [] });
  const execution = await executeStateFixtures(payload, { bibleFile: new URL('../out/bourbon-bible.json', import.meta.url) });
  assert.deepEqual(execution, { ok: true, failures: [] });
  assert.equal(isActiveCustomerStateRow({ state: 'MA' }), false);
});

test('MA research export rejects tampered identity, stale evidence, quantities and delivery flags', () => {
  const row = { state: 'MA', eventType: 'cityhive_store_inventory_result', sourceChain: store.id,
    merchantId: store.merchantId, storeId: store.storeId, storeAddress: store.address,
    city: store.city, county: store.county, locationPrecision: 'store_level',
    sourceRuntimeId: 'precision:ma:julios-westborough:0', confidence: 1, canonicalBottleId: 'b1',
    rawName: 'WILD TURKEY RARE BREED', sourceAvailabilityVerified: true, availabilityStatus: 'orderable',
    inventorySemantics: 'binary_retailer_orderable_no_exact_count', quantity: 0, quantityIsExact: false,
    canAlertAsInventory: true, canAlertAsWatch: false, stale: false, sourceStale: false,
    raw: { shadowOnly: true, premisesVerified: true, pickupOfferVerified: true, sourceMatchStatus: 'exact_bible_match' },
    price: 54.99, alertable: false, eligibleForOnSite: false, eligibleForDelivery: false,
    eligibleForEmail: false, eligibleForSms: false, observedAt: new Date().toISOString(),
    productId: 'p1', variantId: 'v1', sourceUrl: `${store.baseUrl}/shop/product/rare-breed/p1?option-id=v1` };
  assert.equal(isMassachusettsResearchInventory(row), true);
  for (const change of [{ quantity: 2 }, { quantityIsExact: true }, { eligibleForOnSite: true },
    { eligibleForDelivery: true }, { confidence: .9 }, { merchantId: 'wrong' }, { storeId: 'wrong' },
    { stale: true }, { observedAt: '2099-01-01T00:00:00Z' }, { sourceUrl: row.sourceUrl + '&option-id=v2' },
    { sourceUrl: row.sourceUrl.replace('https:', 'http:') }, { raw: { ...row.raw, shadowOnly: false } }]) {
    assert.equal(isMassachusettsResearchInventory({ ...row, ...change }), false, JSON.stringify(change));
  }
});
