import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { FL_CITYHIVE_SOURCES } from '../src/collectors/precision-probes.mjs';
import { confidenceForSignal } from '../src/confidence-policy.mjs';
import { buildCurrentInventoryAlertsFromDrops, publicSignal } from '../src/export-site-contract.mjs';
import { isFloridaRetailerInventory, isFloridaRetailerSignalIdentity } from '../src/florida-retailer-policy.mjs';
import { ALL_STATE_SOURCES } from '../src/state-sources.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/florida-airport-liquor-cityhive-option.json', import.meta.url), 'utf8'));
const source = FL_CITYHIVE_SOURCES.find((entry) => entry.id === 'airport-liquor-orlando');
const merchantId = fixture.option.merchant_id;
const storeId = `airport-liquor-orlando:${merchantId}`;

function signal(overrides = {}) {
  return {
    state: 'FL',
    stateCode: 'FL',
    eventType: 'cityhive_store_inventory_result',
    sourceLabel: 'Airport Liquor Orlando CityHive store inventory',
    sourceUrl: fixture.option.product_url,
    sourceChain: 'airport-liquor-orlando',
    merchantId,
    productId: fixture.option.product_id,
    variantId: fixture.option.option_id,
    rawName: fixture.product.name,
    canonicalBottleId: 'buffalo-trace-bourbon',
    canonicalName: 'Buffalo Trace Bourbon',
    tier: 'allocated',
    confidence: 0.96,
    locationPrecision: 'store_level',
    locationName: 'Airport Liquor Orlando',
    storeName: 'Airport Liquor Orlando',
    storeId,
    storeAddress: fixture.option.full_address,
    city: 'Orlando',
    postalCode: '32822',
    zip: '32822',
    quantity: fixture.option.quantity,
    quantityIsExact: true,
    reportedQuantity: fixture.option.quantity,
    availabilityStatus: 'in_stock',
    sourceAvailabilityVerified: true,
    canAlertAsInventory: true,
    canAlertAsWatch: true,
    observedAt: new Date().toISOString(),
    inventorySemantics: 'exact_retailer_reported_quantity',
    raw: {
      chain: 'airport-liquor-orlando',
      merchantId,
      reportedQuantity: fixture.option.quantity,
      product: fixture.product,
      option: fixture.option,
    },
    ...overrides,
  };
}

test('Airport Liquor Orlando is a strict reviewed exact-store CityHive source', () => {
  assert.ok(source);
  assert.equal(source.baseUrl, 'https://airportliquororlando.com');
  assert.equal(source.strictInventoryContract, true);
  assert.deepEqual(source.merchants.get(merchantId), {
    id: merchantId,
    name: 'Airport Liquor Orlando',
    address: '5749 T G Lee Blvd, Orlando, FL 32822, USA',
    city: 'Orlando',
    zip: '32822',
  });
  assert.ok(ALL_STATE_SOURCES.find((state) => state.id === 'FL').sources.some((entry) => entry.label === source.sourceLabel));
});

test('Airport Liquor inventory requires exact merchant, address, product, variant, URL, and quantity evidence', () => {
  assert.equal(isFloridaRetailerSignalIdentity(signal()), true);
  assert.equal(isFloridaRetailerInventory(signal()), true);
  for (const rejected of [
    signal({ merchantId: 'aaaaaaaaaaaaaaaaaaaaaaaa' }),
    signal({ storeAddress: '5750 T G Lee Blvd, Orlando, FL 32822, USA' }),
    signal({ productId: 'forged-product' }),
    signal({ variantId: 'forged-option' }),
    signal({ sourceUrl: 'https://marketplace.example/product/buffalo-trace' }),
    signal({ quantity: 7 }),
  ]) assert.equal(isFloridaRetailerSignalIdentity(rejected), false);
  assert.equal(isFloridaRetailerInventory(signal({ availabilityStatus: 'stale', sourceAvailabilityVerified: false, canAlertAsInventory: false })), false);
});

test('Airport Liquor malformed and stale fallback evidence fails closed', () => {
  assert.equal(isFloridaRetailerSignalIdentity(signal({ raw: { ...signal().raw, option: { ...fixture.option, full_address: null } } })), false);
  assert.equal(isFloridaRetailerSignalIdentity(signal({ raw: { ...signal().raw, option: { ...fixture.option, quantity: 'not-a-number' } } })), false);
  assert.equal(isFloridaRetailerInventory(signal({ stale: true, sourceStale: true, sourceAvailabilityVerified: false, canAlertAsInventory: false })), false);
});

test('Airport Liquor exact-store proof survives confidence and customer export projection', () => {
  const accepted = confidenceForSignal(signal());
  assert.equal(accepted.canAlertAsInventory, true);
  const bibleRecord = { id: 'buffalo-trace-bourbon', canonical: 'Buffalo Trace Bourbon', tier: 'allocated', aliases: [] };
  const bible = { byId: new Map([[bibleRecord.id, bibleRecord]]), byName: new Map(), byExactName: new Map() };
  const drop = publicSignal(signal(), bible);
  assert.equal(isFloridaRetailerInventory(drop), true);
  assert.equal(buildCurrentInventoryAlertsFromDrops([drop]).length, 1);
});
