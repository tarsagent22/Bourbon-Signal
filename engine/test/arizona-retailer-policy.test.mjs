import test from 'node:test';
import assert from 'node:assert/strict';

import { confidenceForSignal } from '../src/confidence-policy.mjs';
import { isArizonaRetailerInventory, isArizonaRetailerSignalIdentity } from '../src/arizona-retailer-policy.mjs';
import { curlTextFetch, legacyPrecisionRuntimeOptions } from '../src/collectors/precision-probes.mjs';
import { selectScheduledStates } from '../src/optimization/state-run-plan.mjs';

test('Arizona precision collection gets one bounded long attempt instead of two guaranteed timeouts', () => {
  const cadence = { baseCadenceMs: 1_800_000, minCadenceMs: 1_800_000, maxCadenceMs: 1_800_000 };
  assert.deepEqual(legacyPrecisionRuntimeOptions('AZ', {}, {}), { timeoutMs: 1_200_000, maxAttempts: 1, ...cadence });
  assert.deepEqual(legacyPrecisionRuntimeOptions('NC', {}, {}), { timeoutMs: 120_000, maxAttempts: 2, ...cadence });
  assert.deepEqual(legacyPrecisionRuntimeOptions('AZ', { timeoutMs: 42, maxAttempts: 3 }, {}), { timeoutMs: 42, maxAttempts: 3, ...cadence });
});

test('Arizona state scheduling remains due at 30 minutes despite unchanged-result backoff', () => {
  const lastProbeAt = '2026-10-25T00:00:00.000Z';
  const metric = { lastProbeAt, probes: 100, usefulChanges: 0, consecutiveUnchanged: 80 };
  const options = { now: '2026-10-25T00:31:00.000Z', baseCadenceMs: 30 * 60_000, maxCadenceMs: 24 * 60 * 60_000 };
  const schedule = selectScheduledStates([{ id: 'AZ' }, { id: 'GA' }], { AZ: metric, GA: metric }, options);
  assert.equal(schedule[0].run, true);
  assert.equal(schedule[0].cadenceMs, 30 * 60_000);
  assert.equal(schedule[1].run, true);
  assert.equal(selectScheduledStates([{ id: 'AZ' }], { AZ: metric }, { ...options, now: '2026-10-25T00:29:00.000Z' })[0].run, false);
  const cooled = { ...metric, cooldownUntil: '2026-10-25T04:00:00.000Z' };
  assert.equal(selectScheduledStates([{ id: 'AZ' }], { AZ: cooled }, options)[0].nextProbeAt, cooled.cooldownUntil);
});

test('Arizona curl probes terminate when the outer source runtime aborts', async () => {
  const controller = new AbortController();
  const execFileAsync = (_command, _args, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason || new Error('aborted')), { once: true });
  });
  const pending = curlTextFetch('https://example.com/inventory', { signal: controller.signal, execFileAsync });
  controller.abort(new Error('source runtime expired'));
  await assert.rejects(pending, /source runtime expired/);
});

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

test('legacy Mesa stock flags without the current premise and product proof cannot alert', () => {
  const mesa = {
    state: 'AZ', eventType: 'retailer_store_inventory_result', sourceLabel: 'Mesa Liquor WooCommerce store inventory',
    sourceUrl: 'https://mesaliquorstore.com/product/woodford-double-oaked/', sourceChain: 'mesa-liquor', merchantId: 'mesa-liquor-woocommerce',
    locationPrecision: 'store_level', storeId: 'mesa-liquor:7143-e-southern', storeAddress: '7143 E Southern Ave, Mesa, AZ 85209',
    quantity: 0, availabilityStatus: 'in_stock', confidence: 0.82,
    raw: { chain: 'mesa-liquor', product: { id: 123, is_in_stock: true } }
  };
  assert.equal(isArizonaRetailerInventory(mesa), false);
  assert.equal(confidenceForSignal(mesa).canAlertAsInventory, false);
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

test('Target RedSky orderability is alertable without treating ATP as exact shelf quantity', () => {
  const target = {
    state: 'AZ', eventType: 'retailer_store_inventory_result', sourceLabel: 'Target Arizona RedSky store fulfillment',
    sourceUrl: 'https://www.target.com/p/test/-/A-14983851', sourceChain: 'target', merchantId: '2354',
    locationPrecision: 'store_level', storeId: 'target:2354', storeAddress: '5715 N 19th Ave, Phoenix, AZ 85015',
    quantity: 0, availabilityStatus: 'in_stock', sourceAvailabilityVerified: true, confidence: 0.82,
    raw: { chain: 'target', merchantId: '2354', availableToPromise: 9 }
  };
  assert.equal(isArizonaRetailerSignalIdentity(target), true);
  assert.equal(isArizonaRetailerInventory(target), true);
  assert.equal(confidenceForSignal(target).canAlertAsInventory, true);
  assert.equal(isArizonaRetailerSignalIdentity({ ...target, merchantId: '9999', storeId: 'target:9999' }), false);
  assert.equal(isArizonaRetailerSignalIdentity({ ...target, sourceUrl: 'https://attacker.example/p/test' }), false);
});
