import test from 'node:test';
import assert from 'node:assert/strict';

import { confidenceForSignal } from '../src/confidence-policy.mjs';
import { isArizonaRetailerInventory, isArizonaRetailerSignalIdentity } from '../src/arizona-retailer-policy.mjs';

const valid = {
  state: 'AZ',
  eventType: 'cityhive_store_inventory_result',
  sourceLabel: 'Liquor Vault Scottsdale CityHive store inventory',
  sourceUrl: 'https://azliquorvault.com/shop/?subtype=bourbon&merchant-id=6060f74f93fbc722f35ec763',
  locationPrecision: 'store_level',
  storeId: 'liquor-vault-scottsdale:6060f74f93fbc722f35ec763',
  storeAddress: '7101 E Thunderbird Rd, Scottsdale, AZ 85254',
  quantity: 1,
  availabilityStatus: 'in_stock',
  confidence: 0.82,
  raw: { chain: 'liquor-vault-scottsdale', option: { merchant_id: '6060f74f93fbc722f35ec763' } }
};

test('Arizona retailer inventory requires exact source, merchant, host, geography, and positive quantity', () => {
  assert.equal(isArizonaRetailerSignalIdentity(valid), true);
  assert.equal(isArizonaRetailerInventory(valid), true);
  const normalized = { ...valid, sourceChain: valid.raw.chain, merchantId: valid.raw.option.merchant_id };
  delete normalized.raw;
  assert.equal(isArizonaRetailerInventory(normalized), true);
  assert.equal(isArizonaRetailerInventory({ ...valid, quantity: 0, eventType: 'cityhive_store_catalog_watch' }), false);
  assert.equal(isArizonaRetailerInventory({ ...valid, sourceUrl: 'https://example.com/shop/' }), false);
  assert.equal(isArizonaRetailerInventory({ ...valid, raw: { ...valid.raw, option: { merchant_id: 'other' } } }), false);
  assert.equal(isArizonaRetailerInventory({ ...valid, storeAddress: 'Scottsdale, NV 85254' }), false);
});

test('central confidence policy enables only the exact Arizona retailer inventory lane', () => {
  const accepted = confidenceForSignal(valid);
  assert.equal(accepted.policyMode, 'alert_retailer_store_inventory_caveat');
  assert.equal(accepted.canAlertAsInventory, true);

  const spoofed = confidenceForSignal({ ...valid, sourceLabel: 'Liquor Vault Scottsdale CityHive store inventory spoof' });
  assert.equal(spoofed.policyMode, 'policy_only');
  assert.equal(spoofed.canAlertAsInventory, false);

  for (const forged of [
    { ...valid, sourceUrl: 'https://attacker.example/shop/' },
    { ...valid, raw: { ...valid.raw, chain: 'attacker-chain' } },
    { ...valid, raw: { ...valid.raw, option: { merchant_id: 'attacker-merchant' } } }
  ]) {
    const rejected = confidenceForSignal(forged);
    assert.equal(rejected.policyMode, 'policy_only');
    assert.equal(rejected.canAlertAsInventory, false);
  }

  const sentinel = confidenceForSignal({ ...valid, eventType: 'cityhive_store_catalog_watch', quantity: 0, availabilityStatus: 'catalog_listed' });
  assert.equal(sentinel.policyMode, 'policy_only');
  assert.equal(sentinel.canAlertAsInventory, false);
});

test('Mesa Liquor WooCommerce orderability is alertable without inventing exact quantity', () => {
  const mesa = {
    state: 'AZ', eventType: 'retailer_store_inventory_result', sourceLabel: 'Mesa Liquor WooCommerce store inventory',
    sourceUrl: 'https://mesaliquorstore.com/product/woodford-double-oaked/', sourceChain: 'mesa-liquor', merchantId: 'mesa-liquor-woocommerce',
    locationPrecision: 'store_level', storeId: 'mesa-liquor:7143-e-southern', storeAddress: '7143 E Southern Ave, Mesa, AZ 85209',
    quantity: 0, availabilityStatus: 'in_stock', confidence: 0.82,
    raw: { chain: 'mesa-liquor', product: { id: 123, is_in_stock: true } }
  };
  assert.equal(isArizonaRetailerInventory(mesa), true);
  assert.equal(confidenceForSignal(mesa).canAlertAsInventory, true);
  assert.equal(isArizonaRetailerInventory({ ...mesa, raw: { ...mesa.raw, product: { id: 123, is_in_stock: false } } }), false);
  assert.equal(confidenceForSignal({ ...mesa, sourceUrl: 'https://attacker.example/product/123' }).canAlertAsInventory, false);
});

test('Safeway and Albertsons XAPI identities require matching banner host and store identity', () => {
  const xapi = {
    state: 'AZ', eventType: 'retailer_store_inventory_result', sourceLabel: 'Safeway Arizona XAPI store inventory',
    sourceUrl: 'https://www.safeway.com/shop/product-details.123.html', sourceChain: 'safeway', merchantId: '1491',
    locationPrecision: 'store_level', storeId: 'safeway:1491', storeAddress: '7920 E Chaparral Rd, Scottsdale, AZ 85250',
    quantity: 5, availabilityStatus: 'in_stock', sourceAvailabilityVerified: true, confidence: 0.86
  };
  assert.equal(isArizonaRetailerSignalIdentity(xapi), true);
  assert.equal(isArizonaRetailerInventory(xapi), true);
  assert.equal(confidenceForSignal(xapi).canAlertAsInventory, true);
  assert.equal(isArizonaRetailerSignalIdentity({ ...xapi, sourceUrl: 'https://www.albertsons.com/shop/product-details.123.html' }), false);
  assert.equal(isArizonaRetailerSignalIdentity({ ...xapi, storeId: 'safeway:9999' }), false);
  assert.equal(isArizonaRetailerSignalIdentity({ ...xapi, sourceChain: 'albertsons' }), false);
});
