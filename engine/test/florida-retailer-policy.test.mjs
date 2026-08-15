import test from 'node:test';
import assert from 'node:assert/strict';

import { confidenceForSignal } from '../src/confidence-policy.mjs';
import { isFloridaRetailerInventory, isFloridaRetailerSignalIdentity } from '../src/florida-retailer-policy.mjs';
import { isExplicitSafeStaleSignal, STALE_RETAINED_AVAILABILITY_LABEL } from '../src/florida-safe-stale-policy.mjs';
import { getStateLifecycle } from '../src/state-lifecycle.mjs';
import { ALL_STATE_SOURCES } from '../src/state-sources.mjs';

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
  canAlertAsInventory: true,
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

test('Florida retained fallback requires every explicit stale and non-alertable marker', () => {
  const stale = {
    ...mdp,
    stale: true,
    sourceStale: true,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    alertable: false,
    availabilityStatus: 'stale',
    availabilityLabel: STALE_RETAINED_AVAILABILITY_LABEL,
    sourceAvailabilityVerified: false,
    raw: {
      ...mdp.raw,
      sourceAvailabilityVerified: false,
      sourceRuntimeNonAlertable: true,
      staleFallback: true,
      staleNonAlertable: true,
    },
  };
  assert.equal(isExplicitSafeStaleSignal(stale), true);
  for (const unsafe of [
    { ...stale, alertable: true },
    { ...stale, canAlertAsWatch: true },
    { ...stale, sourceAvailabilityVerified: true },
    { ...stale, availabilityStatus: 'in_stock' },
    { ...stale, availabilityLabel: 'In stock' },
    { ...stale, raw: { ...stale.raw, sourceRuntimeNonAlertable: false } },
    { ...stale, raw: { ...stale.raw, staleNonAlertable: false } },
  ]) assert.equal(isExplicitSafeStaleSignal(unsafe), false);
});

test('Florida Target identity fails closed to explicitly listed Florida stores', () => {
  const target = {
    state: 'FL', eventType: 'retailer_store_inventory_result', sourceLabel: 'Target Florida RedSky store fulfillment',
    sourceUrl: 'https://www.target.com/p/test/-/A-14983851', sourceChain: 'target', merchantId: '1518',
    locationPrecision: 'store_level', storeId: 'target:1518', storeAddress: '4750 Millenia Plaza Way, Orlando, FL 32839',
    quantity: 0, availabilityStatus: 'in_stock', sourceAvailabilityVerified: true, canAlertAsInventory: true, confidence: 0.82,
    raw: { chain: 'target', merchantId: '1518', availableToPromise: 5 },
  };
  assert.equal(isFloridaRetailerSignalIdentity(target), true);
  assert.equal(isFloridaRetailerInventory(target), true);
  assert.equal(isFloridaRetailerSignalIdentity({ ...target, merchantId: '9999', storeId: 'target:9999' }), false);
  assert.equal(isFloridaRetailerSignalIdentity({ ...target, sourceUrl: 'https://attacker.example/p/test' }), false);
});

test("Florida Jensen's pickup inventory requires exact merchant, host, store, and pickup proof", () => {
  const jensens = {
    ...mdp,
    sourceLabel: "Jensen's Liquors Miami Shopify pickup inventory",
    sourceUrl: 'https://jensensliquors.com/products/blantons-single-barrel',
    sourceChain: 'jensens-liquors', merchantId: 'jensens-miami-shopify',
    storeId: 'jensens-liquors:1646-sw-27th', storeAddress: '1646 SW 27th Ave, Miami, FL 33145',
    raw: { chain: 'jensens-liquors', merchantId: 'jensens-miami-shopify', variant: { available: true }, pickupVerified: true },
  };
  assert.equal(isFloridaRetailerSignalIdentity(jensens), true);
  assert.equal(isFloridaRetailerInventory(jensens), true);
  assert.equal(confidenceForSignal(jensens).canAlertAsInventory, true);
  assert.equal(isFloridaRetailerSignalIdentity({ ...jensens, sourceUrl: 'https://other.example/product' }), false);
  assert.equal(isFloridaRetailerSignalIdentity({ ...jensens, storeId: 'jensens-liquors:other' }), false);
});

test('Florida CityHive inventory binds first-party host, merchant, store, and Florida address', () => {
  const cityHive = {
    ...mdp,
    eventType: 'cityhive_store_inventory_result',
    sourceLabel: '1001 Liquors / My Florida Liquors CityHive store inventory',
    sourceUrl: 'https://myfloridaliquors.com/shop/product/test?merchant-id=5f58f60980eb420def3fd51b',
    sourceChain: 'my-florida-liquors',
    merchantId: '5f58f60980eb420def3fd51b',
    storeId: 'my-florida-liquors:5f58f60980eb420def3fd51b',
    storeAddress: '14904 E Orange Lake Blvd, Kissimmee, FL 34747, USA',
    raw: { chain: 'my-florida-liquors', merchantId: '5f58f60980eb420def3fd51b', sourceAvailabilityVerified: true },
  };
  assert.equal(isFloridaRetailerSignalIdentity(cityHive), true);
  assert.equal(isFloridaRetailerInventory(cityHive), true);
  assert.equal(confidenceForSignal(cityHive).canAlertAsInventory, true);
  assert.equal(isFloridaRetailerSignalIdentity({ ...cityHive, sourceUrl: 'https://attacker.example/product' }), false);
  assert.equal(isFloridaRetailerSignalIdentity({ ...cityHive, storeId: 'my-florida-liquors:other' }), false);
  assert.equal(isFloridaRetailerInventory({ ...cityHive, storeAddress: 'Kissimmee, GA 34747' }), false);
});

test('Florida online catalog rows remain watch-only without exact-store evidence', () => {
  const watch = { ...mdp, eventType: 'retailer_catalog_availability', locationPrecision: 'statewide_catalog', sourceLabel: 'Luekens Wine & Spirits Shopify inventory', sourceUrl: 'https://www.luekensliquors.com/products/blantons' };
  assert.equal(isFloridaRetailerInventory(watch), false);
  assert.equal(confidenceForSignal(watch).canAlertAsInventory, false);
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

test('Florida registry includes the second-wave retailer discovery sources', () => {
  const florida = ALL_STATE_SOURCES.find((entry) => entry.id === 'FL');
  const labels = florida.sources.map((source) => source.label || source.name);
  for (const expected of [
    '1001 Liquors / My Florida Liquors CityHive store inventory',
    'Liquor Depot Tampa online quantity watch',
    'Paradise Liquors & Wine Florida CityHive store inventory',
    "Gaspar's Liquor Shoppe Lightspeed store inventory",
  ]) assert.ok(labels.includes(expected), `Missing Florida source: ${expected}`);
});
