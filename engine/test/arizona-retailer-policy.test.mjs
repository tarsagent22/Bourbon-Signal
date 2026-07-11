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
