import test from 'node:test';
import assert from 'node:assert/strict';

import { confidenceForSignal } from '../src/confidence-policy.mjs';
import { isFloridaRetailerInventory, isFloridaRetailerSignalIdentity } from '../src/florida-retailer-policy.mjs';
import { getStateLifecycle } from '../src/state-lifecycle.mjs';

const mdp = {
  state: 'FL',
  eventType: 'retailer_store_inventory_result',
  sourceLabel: 'MDP Liquor Kissimmee Shopify store inventory',
  sourceUrl: 'https://mdpliquorfl.com/products/test-bourbon',
  sourceChain: 'mdp-liquor-kissimmee',
  merchantId: 'mdp-liquor-kissimmee-shopify',
  locationPrecision: 'store_level',
  storeId: 'mdp-liquor-kissimmee:4636-w-irlo-bronson',
  storeAddress: '4636 W Irlo Bronson Memorial Hwy, Kissimmee, FL 34746',
  quantity: 0,
  availabilityStatus: 'in_stock',
  sourceAvailabilityVerified: true,
  confidence: 0.82,
  raw: { chain: 'mdp-liquor-kissimmee', merchantId: 'mdp-liquor-kissimmee-shopify', variant: { available: true } },
};

test('Florida MDP Shopify inventory requires exact source, merchant, host, store, and geography', () => {
  assert.equal(isFloridaRetailerSignalIdentity(mdp), true);
  assert.equal(isFloridaRetailerInventory(mdp), true);
  assert.equal(isFloridaRetailerSignalIdentity({ ...mdp, sourceUrl: 'https://attacker.example/products/test' }), false);
  assert.equal(isFloridaRetailerSignalIdentity({ ...mdp, merchantId: 'other' }), false);
  assert.equal(isFloridaRetailerInventory({ ...mdp, storeAddress: 'Kissimmee, GA 34746' }), false);
  assert.equal(isFloridaRetailerInventory({ ...mdp, sourceAvailabilityVerified: false, raw: { ...mdp.raw, variant: { available: false } } }), false);
});

test('Florida Target identity fails closed to explicitly listed Florida stores', () => {
  const target = {
    state: 'FL', eventType: 'retailer_store_inventory_result', sourceLabel: 'Target Florida RedSky store fulfillment',
    sourceUrl: 'https://www.target.com/p/test/-/A-14983851', sourceChain: 'target', merchantId: '1518',
    locationPrecision: 'store_level', storeId: 'target:1518', storeAddress: '4750 Millenia Plaza Way, Orlando, FL 32839',
    quantity: 0, availabilityStatus: 'in_stock', sourceAvailabilityVerified: true, confidence: 0.82,
    raw: { chain: 'target', merchantId: '1518', availableToPromise: 5 },
  };
  assert.equal(isFloridaRetailerSignalIdentity(target), true);
  assert.equal(isFloridaRetailerInventory(target), true);
  assert.equal(isFloridaRetailerSignalIdentity({ ...target, merchantId: '9999', storeId: 'target:9999' }), false);
  assert.equal(isFloridaRetailerSignalIdentity({ ...target, sourceUrl: 'https://attacker.example/p/test' }), false);
});

test('central confidence policy enables only guarded Florida retailer inventory', () => {
  const accepted = confidenceForSignal(mdp);
  assert.equal(accepted.policyMode, 'alert_retailer_store_inventory_caveat');
  assert.equal(accepted.canAlertAsInventory, true);
  const spoofed = confidenceForSignal({ ...mdp, sourceLabel: `${mdp.sourceLabel} spoof` });
  assert.equal(spoofed.policyMode, 'policy_only');
  assert.equal(spoofed.canAlertAsInventory, false);
});

test('Florida lifecycle advertises retailer inventory rather than empty Costco-only coverage', () => {
  const lifecycle = getStateLifecycle('FL');
  assert.match(lifecycle.sourceLabel, /retailer/i);
  assert.equal(lifecycle.lifecycle, 'retailer_store_inventory');
  assert.equal(lifecycle.coverageTier, 'live_store_inventory');
  assert.equal(lifecycle.refinementLevel, 'city_store');
});
