import test from 'node:test';
import assert from 'node:assert/strict';
import { BourbonBible } from '../src/core/bible.mjs';
import { canonicalizeSignal } from '../src/operational-report.mjs';
import { isFloridaRetailerInventory } from '../src/florida-retailer-policy.mjs';
import { bibleLookup, buildDrops, buildCurrentInventoryAlertsFromDrops } from '../src/export-site-contract.mjs';

// Reduced source signal captured in refresh 39794411704 at 2026-10-22T14:20Z.
// Only observedAt is refreshed when replaying it through time-sensitive policy.
const captured = {
  id: '7d3999bf7fe41ddb', state: 'FL', stateCode: 'FL',
  sourceLabel: 'ABC Fine Wine & Spirits exact-store Searchspring inventory',
  sourceUrl: 'https://www.abcfws.com/green-river-full-proof-bourbon-whiskey/134905',
  sourceChain: 'abc-fine-wine-spirits', merchantId: 'abc-store-5',
  productId: '134905', variantId: '6040707', optionValueId: '6024387',
  childSku: '134905-5', storeNumber: '5', controlStoreId: '5',
  rawName: 'Green River Full Proof Bourbon Whiskey',
  canonicalBottleId: 'bb_36be0a66004a60ba', canonicalName: 'Green River Full Proof Bourbon',
  tier: 'limited', confidence: 1, eventType: 'retailer_store_inventory_result',
  locationPrecision: 'store_level', locationName: 'ABC #005 - Disney West',
  storeName: 'ABC #005 - Disney West', storeId: 'abc-fine-wine-spirits:5',
  storeAddress: '3187 BLACK LAKE ROAD, KISSIMMEE, FL 34747', city: 'KISSIMMEE',
  postalCode: '34747', zip: '34747', lat: 28.343098, lng: -81.60054,
  quantity: 2, quantityIsExact: true, reportedQuantity: 2, price: 49.99,
  availabilityStatus: 'in_stock', sourceAvailabilityVerified: true,
  premisesVerified: true, canAlertAsInventory: true, canAlertAsWatch: true,
  inventorySemantics: 'exact_retailer_reported_quantity', variantAvailable: true,
  raw: {
    chain: 'abc-fine-wine-spirits', merchantId: 'abc-store-5',
    productId: '134905', variantId: '6040707', optionValueId: '6024387',
    childSku: '134905-5', storeNumber: '5', controlStoreId: '5',
    reportedQuantity: 2, variantAvailable: true,
    officialAddress: '3187 BLACK LAKE ROAD', officialCity: 'KISSIMMEE',
    officialZip: '34747', officialLatitude: '28.343098', officialLongitude: '-81.600540',
  },
};
const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));
const lookup = bibleLookup(bible.records);
const source = () => ({ ...structuredClone(captured), observedAt: new Date().toISOString() });
const project = (signal) => buildDrops([signal], lookup, [signal]);

test('captured ABC exact-store proof survives operational snapshot, public drop, and alert projection', () => {
  const raw = source();
  assert.equal(isFloridaRetailerInventory(raw), true);
  const normalized = canonicalizeSignal(raw, bible);
  assert.equal(isFloridaRetailerInventory(normalized), true);
  for (const field of ['optionValueId', 'childSku', 'storeNumber', 'controlStoreId', 'reportedQuantity', 'variantAvailable']) {
    assert.equal(normalized[field], raw[field], field);
  }
  assert.equal(normalized.sourceInventorySemantics, raw.inventorySemantics);
  assert.deepEqual(normalized.raw, raw.raw);
  const drops = project(normalized);
  assert.equal(drops.length, 1);
  assert.equal(isFloridaRetailerInventory(drops[0]), true);
  assert.equal(drops[0].quantity, 2);
  assert.equal(drops[0].quantityIsExact, true);
  assert.equal(drops[0].sourceInventorySemantics, 'exact_retailer_reported_quantity');
  const alerts = buildCurrentInventoryAlertsFromDrops(drops);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].state, 'FL');
});

test('operational projection retains contradictory source proof so forged ABC identities stay rejected', () => {
  const mutations = [
    (row) => { row.raw.optionValueId = '9999999'; },
    (row) => { row.raw.productId = '999999'; },
    (row) => { row.raw.variantId = '9999999'; },
    (row) => { row.raw.childSku = '134905-6'; },
    (row) => { row.raw.controlStoreId = '6'; },
    (row) => { row.raw.officialCity = 'ORLANDO'; },
    (row) => { row.childSku = '134905-6'; },
    (row) => { row.storeNumber = '6'; },
    (row) => { row.reportedQuantity = 3; },
    (row) => { row.sourceUrl = row.sourceUrl.replace('www.abcfws.com', 'attacker.example'); },
    (row) => { row.storeAddress = '999 DIFFERENT ROAD, KISSIMMEE, FL 34747'; },
    (row) => { row.sourceInventorySemantics = 'binary_retailer_orderable_no_exact_count'; },
  ];
  for (const mutate of mutations) {
    const raw = source();
    mutate(raw);
    assert.equal(isFloridaRetailerInventory(raw), false);
    const normalized = canonicalizeSignal(raw, bible);
    assert.equal(isFloridaRetailerInventory(normalized), false);
    assert.deepEqual(project(normalized), []);
    const forgedSnapshot = canonicalizeSignal(source(), bible);
    mutate(forgedSnapshot);
    assert.equal(isFloridaRetailerInventory(forgedSnapshot), false);
    assert.deepEqual(buildCurrentInventoryAlertsFromDrops(project(forgedSnapshot)), []);
  }
});
