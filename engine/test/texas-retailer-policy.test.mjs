import test from 'node:test';
import assert from 'node:assert/strict';
import { confidenceForSignal } from '../src/confidence-policy.mjs';
import { isTexasRetailerInventory, isTexasRetailerSignalIdentity } from '../src/texas-retailer-policy.mjs';
import { legacyPrecisionRuntimeOptions, texasCityHiveRequestLimits, texasTwinMerchantCohort } from '../src/collectors/precision-probes.mjs';

test('Texas CityHive defaults keep Twin Liquors below the rate-limited request matrix', () => {
  assert.deepEqual(texasCityHiveRequestLimits({}), { maxPages: 1, twinMaxMerchants: 4 });
  assert.deepEqual(texasCityHiveRequestLimits({
    BOURBON_SIGNAL_TX_CITYHIVE_MAX_PAGES: '2',
    BOURBON_SIGNAL_TX_TWIN_MAX_MERCHANTS: '8',
  }), { maxPages: 2, twinMaxMerchants: 8 });
  assert.deepEqual(
    Object.fromEntries(Object.entries(legacyPrecisionRuntimeOptions('TX', {}, {})).filter(([key]) => key.endsWith('CadenceMs'))),
    { baseCadenceMs: 1_800_000, minCadenceMs: 1_800_000, maxCadenceMs: 1_800_000 },
  );
  assert.equal(legacyPrecisionRuntimeOptions('TX', {}, {}).timeoutMs, 300_000);
});

test('Texas rotates a bounded Twin Liquors cohort across every configured merchant', () => {
  const epoch = Date.parse('2026-08-15T00:00:00Z');
  const cohorts = Array.from({ length: 7 }, (_, slot) => texasTwinMerchantCohort(
    new Date(epoch + slot * 30 * 60_000).toISOString(),
    {},
  ));
  assert.ok(cohorts.every((cohort) => cohort.length === 4));
  assert.equal(new Set(cohorts.flat()).size, 28);
  assert.notDeepEqual(cohorts[0], cohorts[1]);
  assert.deepEqual(
    texasTwinMerchantCohort('2026-08-15T00:05:00Z', {}),
    texasTwinMerchantCohort('2026-08-15T00:25:00Z', {}),
  );
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

test('Texas Zipps identity accepts only the configured first-party shop host', () => {
  const zipps = {
    ...twin,
    sourceLabel: 'Zipps Liquor CityHive store inventory',
    sourceUrl: 'https://shop.zippsliquor.com/shop/product/test-bourbon',
    sourceChain: 'zipps-liquor',
    storeId: `zipps-liquor:${twin.merchantId}`,
  };
  assert.equal(isTexasRetailerSignalIdentity(zipps), true);
  assert.equal(isTexasRetailerInventory(zipps), true);
  assert.equal(isTexasRetailerSignalIdentity({ ...zipps, sourceUrl: 'https://zippsliquor.com/shop/product/test-bourbon' }), false);
  assert.equal(isTexasRetailerSignalIdentity({ ...zipps, sourceUrl: 'https://shop.zippsliquor.com.evil.example/shop/product/test-bourbon' }), false);
});
