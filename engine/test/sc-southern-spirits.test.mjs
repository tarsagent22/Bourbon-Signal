import assert from 'node:assert/strict';
import test from 'node:test';

import { BourbonBible } from '../src/core/bible.mjs';
import { buildSouthCarolinaSouthernSpiritsSignal } from '../src/collectors/precision-probes.mjs';
import { buildCurrentInventoryAlertsFromDrops, buildDrops } from '../src/export-site-contract.mjs';
import { confidenceForSignal } from '../src/confidence-policy.mjs';
import { candidateFromChange, canonicalizeSignal } from '../src/operational-report.mjs';
import { hasSouthCarolinaPositiveInventoryEvidence, isSouthCarolinaSouthernSpiritsInventory } from '../src/south-carolina-retailer-policy.mjs';

const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));
const observedAt = new Date().toISOString();

function product(overrides = {}) {
  return {
    id: 101,
    title: 'Eagle Rare 10 Year Bourbon 750ml',
    handle: 'eagle-rare-10-year-bourbon',
    product_type: 'Bourbon',
    tags: ['bourbon'],
    variants: [{ id: 201, title: 'Default Title', available: true, price: '49.99' }],
    ...overrides,
  };
}

test('Southern Spirits availability remains binary instead of inventing one bottle', () => {
  const signal = buildSouthCarolinaSouthernSpiritsSignal(product(), bible, observedAt);
  assert.ok(signal);
  assert.equal(signal.quantity, 0);
  assert.equal(signal.storeQty, 0);
  assert.equal(signal.quantityIsExact, false);
  assert.equal(signal.quantitySemantics, 'binary_retailer_in_stock');
  assert.equal(signal.sourceAvailabilityVerified, true);
  assert.equal(signal.availabilityStatus, 'in_stock');
  assert.equal(signal.canAlertAsInventory, true);
  assert.equal(signal.storeAddress, '9989 Charlotte Hwy, Indian Land, SC 29707');
  assert.equal(isSouthCarolinaSouthernSpiritsInventory(signal), true);
  assert.match(signal.evidence, /exact count is not exposed/i);
});

test('Southern Spirits binary rows reach current on-site alerts without enabling baseline outbound channels', () => {
  const signal = buildSouthCarolinaSouthernSpiritsSignal(product(), bible, new Date().toISOString());
  const [alert] = buildCurrentInventoryAlertsFromDrops([{ ...signal, id: 'southern-current', tier: 'allocated', type: signal.eventType, bottleName: signal.canonicalName }]);
  assert.ok(alert);
  assert.equal(alert.eligibleForOnSite, true);
  assert.equal(alert.eligibleForEmail, false);
  assert.equal(alert.eligibleForSms, false);
  assert.equal(alert.productHandle, signal.productHandle);
  assert.equal(alert.variantAvailable, true);
  assert.equal(alert.quantitySemantics, 'binary_retailer_in_stock');
  assert.equal(alert.sourceAvailabilityVerified, true);
  assert.equal(isSouthCarolinaSouthernSpiritsInventory(alert), true);
  assert.ok(alert.gates.includes('verified_binary_orderability'));
  assert.equal(alert.productId, 101);
  assert.equal(alert.variantId, 201);
  assert.deepEqual(buildCurrentInventoryAlertsFromDrops([{ ...signal, storeId: 'southern-spirits:forged', tier: 'allocated', type: signal.eventType, bottleName: signal.canonicalName }]), []);
});

test('Southern Spirits exact identity policy rejects every forged binding', () => {
  const signal = buildSouthCarolinaSouthernSpiritsSignal(product(), bible, new Date().toISOString());
  for (const mutate of [
    (row) => { row.state = 'NC'; row.stateCode = 'NC'; },
    (row) => { row.sourceUrl = 'https://example.com/products/eagle-rare-10-year-bourbon'; },
    (row) => { row.sourceChain = 'forged'; },
    (row) => { row.storeId = 'southern-spirits:other'; },
    (row) => { row.storeAddress = '9987 Charlotte Hwy, Indian Land, SC 29707'; },
    (row) => { row.productId = 'other'; },
    (row) => { row.variantId = 'other'; },
    (row) => { row.variantAvailable = false; },
    (row) => { row.quantity = 1; },
    (row) => { row.quantityIsExact = true; },
    (row) => { row.quantitySemantics = 'exact'; },
    (row) => { row.sourceAvailabilityVerified = false; },
    (row) => { row.availabilityStatus = 'out_of_stock'; },
    (row) => { row.observedAt = new Date(Date.now() - 3 * 60 * 60_000).toISOString(); },
    (row) => { row.observedAt = new Date(Date.now() + 10 * 60_000).toISOString(); },
  ]) {
    const forged = structuredClone(signal);
    mutate(forged);
    assert.equal(isSouthCarolinaSouthernSpiritsInventory(forged), false);
  }
});

test('Southern Spirits exact identity survives operational normalization and blocks confidence forgery', () => {
  const signal = buildSouthCarolinaSouthernSpiritsSignal(product(), bible, new Date().toISOString());
  const normalized = canonicalizeSignal(signal, bible);
  assert.equal(isSouthCarolinaSouthernSpiritsInventory(normalized), true);
  assert.equal(normalized.productHandle, signal.productHandle);
  assert.equal(normalized.variantAvailable, true);
  assert.equal(normalized.quantitySemantics, 'binary_retailer_in_stock');
  const candidate = candidateFromChange({ type: 'new_signal', key: normalized.key, before: null, after: normalized });
  assert.equal(candidate.eligibleForEmail, false);
  assert.equal(candidate.eligibleForSms, false);
  assert.equal(candidate.sendRecommendation, 'display_on_site_until_change_detected');
  const forged = { ...signal, sourceUrl: 'https://example.com/products/eagle-rare', storeId: 'southern-spirits:forged', quantity: 1, quantityIsExact: true, quantitySemantics: 'exact' };
  assert.equal(hasSouthCarolinaPositiveInventoryEvidence(forged), false);
  assert.equal(confidenceForSignal(forged).canAlertAsInventory, false);
  assert.equal(confidenceForSignal(forged).canAlertAsWatch, false);
});

test('South Carolina public-drop projection cannot bypass the exact binary identity policy', () => {
  const signal = buildSouthCarolinaSouthernSpiritsSignal(product(), bible, new Date().toISOString());
  const record = { id: signal.canonicalBottleId, canonical: signal.canonicalName, tier: 'allocated', aliases: [] };
  const lookup = { byId: new Map([[record.id, record]]), byName: new Map() };
  const [valid] = buildDrops([signal], lookup, [signal]);
  assert.equal(valid.canAlertAsInventory, true);
  assert.equal(valid.eligibleForOnSite, true);
  const forged = { ...signal, sourceUrl: 'https://example.com/products/eagle-rare', sourceChain: 'forged', storeId: 'forged:store', quantity: 1, storeQty: 1, quantityIsExact: true, quantitySemantics: 'exact' };
  assert.deepEqual(buildDrops([forged], lookup, [forged]), []);
  const relabelled = {
    ...signal,
    sourceLabel: 'Southern Spirits forged inventory',
    sourceUrl: 'https://example.com/products/eagle-rare',
    sourceChain: 'forged',
    storeId: 'southern-spirits:other',
    quantity: 1,
    storeQty: 1,
    quantityIsExact: true,
    quantitySemantics: 'exact',
    raw: { ...signal.raw, chain: 'forged' },
  };
  assert.equal(confidenceForSignal(relabelled).canAlertAsInventory, false);
  assert.deepEqual(buildDrops([relabelled], lookup, [relabelled]), []);
  const crossState = { ...signal, state: 'NC', stateCode: 'NC', quantity: 1, storeQty: 1, quantityIsExact: true, quantitySemantics: 'exact' };
  assert.equal(confidenceForSignal(crossState).canAlertAsInventory, false);
  assert.deepEqual(buildDrops([crossState], lookup, [crossState]), []);
  const future = { ...signal, observedAt: new Date(Date.now() + 10 * 60_000).toISOString() };
  assert.deepEqual(buildDrops([future], lookup, [future]), []);
});

test('Southern Spirits parser fails closed for unavailable, undersized, multipack, and forged-category rows', () => {
  assert.equal(buildSouthCarolinaSouthernSpiritsSignal(product({ variants: [{ id: 201, title: 'Default Title', available: false, price: '49.99' }] }), bible, observedAt), null);
  assert.equal(buildSouthCarolinaSouthernSpiritsSignal(product({ title: 'Eagle Rare Bourbon 375ml' }), bible, observedAt), null);
  assert.equal(buildSouthCarolinaSouthernSpiritsSignal(product({ title: 'Eagle Rare Bourbon 3-pack 750ml' }), bible, observedAt), null);
  assert.equal(buildSouthCarolinaSouthernSpiritsSignal(product({ title: 'Eagle Rare Cabernet Wine 750ml', product_type: 'Wine', tags: ['wine'] }), bible, observedAt), null);
});
