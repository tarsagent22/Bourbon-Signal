import test from 'node:test';
import assert from 'node:assert/strict';
import { confidenceForSignal } from '../src/confidence-policy.mjs';
import { isTexasRetailerInventory, isTexasRetailerSignalIdentity } from '../src/texas-retailer-policy.mjs';
import { legacyPrecisionRuntimeOptions, texasCityHiveRequestLimits } from '../src/collectors/precision-probes.mjs';

test('Texas CityHive defaults keep Twin Liquors below the rate-limited request matrix', () => {
  assert.deepEqual(texasCityHiveRequestLimits({}), { maxPages: 1, twinMaxMerchants: 4 });
  assert.deepEqual(texasCityHiveRequestLimits({
    BOURBON_SIGNAL_TX_CITYHIVE_MAX_PAGES: '2',
    BOURBON_SIGNAL_TX_TWIN_MAX_MERCHANTS: '8',
  }), { maxPages: 2, twinMaxMerchants: 8 });
  assert.equal(legacyPrecisionRuntimeOptions('TX', {}, {}).timeoutMs, 300_000);
});

const twin = {
  state: 'TX', stateCode: 'TX', eventType: 'cityhive_store_inventory_result',
  sourceLabel: 'Twin Liquors CityHive store inventory',
  sourceUrl: 'https://twinliquors.com/shop/product/test-bourbon',
  sourceChain: 'twin-liquors', merchantId: '0123456789abcdef01234567',
  productId: 'product-1', optionId: 'option-1',
  storeId: 'twin-liquors:0123456789abcdef01234567',
  storeAddress: '100 Main St, Austin, TX 78701', city: 'Austin',
  locationPrecision: 'store_level', quantity: 2, availabilityStatus: 'in_stock',
  sourceAvailabilityVerified: true, confidence: 0.82,
};

test('Texas Twin inventory requires exact source, host, chain, merchant, store, product, option, and geography', () => {
  assert.equal(isTexasRetailerSignalIdentity(twin), true);
  assert.equal(isTexasRetailerInventory(twin), true);
  assert.equal(isTexasRetailerSignalIdentity({ ...twin, sourceUrl: 'https://attacker.example/test' }), false);
  assert.equal(isTexasRetailerSignalIdentity({ ...twin, storeId: 'twin-liquors:other' }), false);
  assert.equal(isTexasRetailerSignalIdentity({ ...twin, productId: null }), false);
  assert.equal(isTexasRetailerInventory({ ...twin, storeAddress: '100 Main St, Durant, OK 74701' }), false);
});

test('Texas verified binary availability is inventory but catalog and absent stock are not', () => {
  const binary = { ...twin, quantity: 0, raw: { reportedQuantity: 100 } };
  assert.equal(isTexasRetailerInventory(binary), true);
  assert.equal(confidenceForSignal(binary).canAlertAsInventory, true);
  assert.equal(isTexasRetailerInventory({ ...binary, sourceAvailabilityVerified: false }), false);
  assert.equal(isTexasRetailerInventory({ ...binary, eventType: 'retailer_product_catalog_signal' }), false);
});

test('Texas identity is fail-closed to registered retailers', () => {
  assert.equal(isTexasRetailerSignalIdentity({ ...twin, sourceLabel: 'Twin Liquors CityHive store inventory spoof' }), false);
  assert.equal(confidenceForSignal({ ...twin, sourceLabel: 'Twin Liquors CityHive store inventory spoof' }).canAlertAsInventory, false);
});
