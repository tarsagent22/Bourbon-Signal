import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  FLORIDA_STAR_LIQUORS_REGISTRY_SHA256,
  FLORIDA_STAR_LIQUORS_SOURCE,
} from '../src/collectors/florida-retailer-surfaces.mjs';
import { isFloridaRetailerInventory, isFloridaRetailerOutOfStockObservation } from '../src/florida-retailer-policy.mjs';
import { FLORIDA_STAR_EXPANSION_MINIMUM_NET_NEW_STORES, verifyFloridaStarExpansionArtifact } from '../src/verification/florida-star-expansion-verifier.mjs';

const observedAt = new Date().toISOString();
const baseline = JSON.parse(readFileSync(new URL('../data/florida-star-expansion-baseline.json', import.meta.url), 'utf8'));

function starSignal(store, overrides = {}) {
  const productId = 'fixture-product';
  const variantId = 'fixture-option';
  const sourceUrl = `${FLORIDA_STAR_LIQUORS_SOURCE.baseUrl}/shop/product/buffalo-trace-bourbon/${productId}?option-id=${variantId}`;
  return {
    id: `fixture-${store.id}`,
    state: 'FL',
    sourceLabel: FLORIDA_STAR_LIQUORS_SOURCE.sourceLabel,
    sourceUrl,
    sourceChain: FLORIDA_STAR_LIQUORS_SOURCE.id,
    merchantId: store.id,
    productId,
    variantId,
    rawName: 'Buffalo Trace Bourbon 750ml',
    canonicalBottleId: 'buffalo-trace',
    canonicalName: 'Buffalo Trace Bourbon',
    eventType: 'cityhive_store_inventory_result',
    locationPrecision: 'store_level',
    locationName: store.name,
    storeName: store.name,
    storeId: `${FLORIDA_STAR_LIQUORS_SOURCE.id}:${store.id}`,
    storeAddress: store.address,
    city: store.city,
    stateCode: 'FL',
    postalCode: store.zip,
    zip: store.zip,
    quantity: 3,
    quantityIsExact: true,
    reportedQuantity: 3,
    availabilityStatus: 'in_stock',
    sourceAvailabilityVerified: true,
    observedAt,
    canAlertAsInventory: true,
    canAlertAsWatch: true,
    inventorySemantics: 'exact_retailer_reported_quantity',
    raw: {
      chain: FLORIDA_STAR_LIQUORS_SOURCE.id,
      merchantId: store.id,
      reportedQuantity: 3,
      sourceAvailabilityVerified: true,
      configuredStoreIdentity: true,
      product: { id: productId },
      option: { merchant_id: store.id, product_id: productId, option_id: variantId, full_address: store.address, quantity: 3, product_url: sourceUrl },
    },
    ...overrides,
  };
}


test('immutable Star Liquors registry contains 24 unique net-new exact Florida premises', () => {
  assert.equal(FLORIDA_STAR_LIQUORS_REGISTRY_SHA256, '88a77fc4eeccc115f8c8d7004a285db284b28723654dc5a371ccfcdf15ae76e8');
  assert.equal(FLORIDA_STAR_LIQUORS_SOURCE.id, 'star-liquors');
  assert.equal(FLORIDA_STAR_LIQUORS_SOURCE.baseUrl, 'https://starlq.com');
  assert.equal(FLORIDA_STAR_LIQUORS_SOURCE.merchants.size, 24);
  assert.equal(new Set([...FLORIDA_STAR_LIQUORS_SOURCE.merchants.keys()]).size, 24);
  assert.equal(new Set([...FLORIDA_STAR_LIQUORS_SOURCE.merchants.values()].map((store) => store.address)).size, 24);
  assert.ok([...FLORIDA_STAR_LIQUORS_SOURCE.merchants.values()].every((store) => Object.isFrozen(store)
    && /, FL \d{5}, USA$/.test(store.address)
    && Number.isFinite(store.lat)
    && Number.isFinite(store.lng)));

  assert.equal(baseline.contractVersion, 'bourbon-signal/florida-star-expansion-baseline@1');
  assert.equal(baseline.inventoryStoreIds.length, 180);
  assert.equal(new Set(baseline.inventoryStoreIds).size, 180);
  assert.equal(baseline.inventoryPremises.length, 180);
  assert.equal(new Set(baseline.inventoryPremises.map((premise) => premise.address.toLowerCase())).size, 180);
  const baselineAddresses = new Set(baseline.inventoryPremises.map((premise) => premise.address.toLowerCase()));
  assert.ok([...FLORIDA_STAR_LIQUORS_SOURCE.merchants.values()].every((store) => !baselineAddresses.has(store.address.toLowerCase())));
  const candidateIds = new Set([...FLORIDA_STAR_LIQUORS_SOURCE.merchants.keys()].map((id) => `star-liquors:${id}`));
  assert.deepEqual(baseline.inventoryStoreIds.filter((id) => candidateIds.has(id)), []);
});

test('Star Liquors policy requires exact merchant, address, product, and positive quantity semantics', () => {
  const [store] = FLORIDA_STAR_LIQUORS_SOURCE.merchants.values();
  const exact = starSignal(store);
  assert.equal(isFloridaRetailerInventory(exact), true);
  assert.equal(isFloridaRetailerInventory(starSignal(store, { raw: { ...exact.raw, product: { id: 'different-cityhive-catalog-parent' } } })), true);
  assert.equal(isFloridaRetailerInventory(starSignal(store, { merchantId: 'forged' })), false);
  assert.equal(isFloridaRetailerInventory(starSignal(store, { storeAddress: '999 Forged St, Miami, FL 33101' })), false);
  assert.equal(isFloridaRetailerInventory(starSignal(store, { sourceUrl: 'https://example.com/shop/product/forged' })), false);
  const mismatchedProductUrl = `${FLORIDA_STAR_LIQUORS_SOURCE.baseUrl}/shop/product/buffalo-trace-bourbon/different-product?option-id=different-option`;
  assert.equal(isFloridaRetailerInventory(starSignal(store, { sourceUrl: mismatchedProductUrl, raw: { ...exact.raw, option: { ...exact.raw.option, product_url: mismatchedProductUrl } } })), false);
  const malformedProductUrl = `${FLORIDA_STAR_LIQUORS_SOURCE.baseUrl}/shop/product/buffalo-trace-bourbon/%E0%A4%A?option-id=${exact.variantId}`;
  assert.doesNotThrow(() => isFloridaRetailerInventory(starSignal(store, { sourceUrl: malformedProductUrl, raw: { ...exact.raw, option: { ...exact.raw.option, product_url: malformedProductUrl } } })));
  assert.equal(isFloridaRetailerInventory(starSignal(store, { sourceUrl: malformedProductUrl, raw: { ...exact.raw, option: { ...exact.raw.option, product_url: malformedProductUrl } } })), false);
  for (const nonExactUrl of [
    exact.sourceUrl.replace('https://', 'https://user@'),
    exact.sourceUrl.replace('starlq.com', 'starlq.com:444'),
    exact.sourceUrl.replace('option-id=fixture-option', 'option-id=%66ixture-option'),
  ]) {
    assert.equal(isFloridaRetailerInventory(starSignal(store, { sourceUrl: nonExactUrl, raw: { ...exact.raw, option: { ...exact.raw.option, product_url: nonExactUrl } } })), false);
  }
  assert.equal(isFloridaRetailerInventory(starSignal(store, { quantity: 0, reportedQuantity: 0, raw: { ...exact.raw, reportedQuantity: 0 } })), false);
  assert.equal(isFloridaRetailerInventory(starSignal(store, { productId: '', variantId: '' })), false);

  const binary = starSignal(store, {
    quantity: 1,
    quantityIsExact: false,
    reportedQuantity: 100,
    inventorySemantics: 'binary_retailer_orderable_no_exact_count',
    raw: { ...exact.raw, reportedQuantity: 100, option: { ...exact.raw.option, quantity: 100 } },
  });
  assert.equal(isFloridaRetailerInventory(binary), true);
  assert.equal(isFloridaRetailerInventory({ ...binary, quantity: 100 }), false);
});

test('Florida Star verification isolates scheduled failure while targeted recovery stays strict', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.scripts['verify:fl:star-expansion'], 'node src/verify-fl-star-expansion.mjs');
  const workflow = readFileSync(new URL('../../.github/workflows/refresh-feed.yml', import.meta.url), 'utf8');
  const scheduled = workflow.match(/- name: Verify Florida scheduled Star Liquors expansion or isolate its partition[\s\S]*?(?=\n      - name:)/)?.[0] || '';
  const targeted = workflow.match(/- name: Verify Florida targeted Star Liquors expansion strictly[\s\S]*?(?=\n      - name:)/)?.[0] || '';
  assert.match(scheduled, /if:\s*\$\{\{ !inputs\.states \}\}[\s\S]*scheduled-state-verification\.mjs verify --state=FL -- npm run verify:fl:star-expansion/);
  assert.match(targeted, /if:\s*\$\{\{ inputs\.states && contains\(inputs\.states, 'FL'\) \}\}[\s\S]*run: npm run verify:fl:star-expansion/);
});

test('production verifier requires at least 20 Star stores and preserves all 180 baseline stores', () => {
  assert.equal(FLORIDA_STAR_EXPANSION_MINIMUM_NET_NEW_STORES, 20, 'Star expansion remains positive-inventory-only at its frozen target');
  const policyFixture = JSON.parse(readFileSync(new URL('./fixtures/florida-star-baseline-policy-signals.json', import.meta.url), 'utf8'));
  assert.equal(policyFixture.contractVersion, 'bourbon-signal/florida-star-baseline-policy-signals@1');
  const retained = policyFixture.signals.map((signal) => ({ ...signal, observedAt }));
  assert.deepEqual(retained.map((signal) => signal.storeId).sort(), [...baseline.inventoryStoreIds].sort());
  assert.ok(retained.every(isFloridaRetailerInventory));
  const star = [...FLORIDA_STAR_LIQUORS_SOURCE.merchants.values()].map(starSignal);
  const retainedWithZero = retained.map((signal) => signal.storeId === 'primo-liquors:southeast' ? {
    ...signal,
    quantity: 0,
    quantityIsExact: true,
    reportedQuantity: 0,
    availabilityStatus: 'out_of_stock',
    sourceAvailabilityVerified: true,
    premisesVerified: true,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    inventorySemantics: 'exact_retailer_reported_quantity',
    raw: { ...signal.raw, chain: 'primo-liquors', reportedQuantity: 0 },
  } : signal);
  assert.ok(retainedWithZero.some(isFloridaRetailerOutOfStockObservation));
  const state = { state: 'FL', status: 'useful', stale: false, generatedAt: observedAt, signals: [...retainedWithZero, ...star] };
  const summary = verifyFloridaStarExpansionArtifact({ state, baseline, now: Date.now() });
  assert.equal(summary.baselineStores, 180);
  assert.equal(summary.currentStores, 203);
  assert.equal(summary.observedStores, 204);
  assert.equal(summary.netNewStores, 24);
  assert.equal(summary.starStores, 24);
  assert.equal(summary.removedStores, 0);

  const tamperedPremise = structuredClone(baseline);
  tamperedPremise.inventoryPremises[0].address = '999 Tampered Way, Orlando, FL 32801';
  assert.throws(() => verifyFloridaStarExpansionArtifact({ state, baseline: tamperedPremise, now: Date.now() }), /premise.*digest|digest.*premise/i);
  const mismatchedPremiseId = structuredClone(baseline);
  mismatchedPremiseId.inventoryPremises[0].storeId = 'forged:store';
  assert.throws(() => verifyFloridaStarExpansionArtifact({ state, baseline: mismatchedPremiseId, now: Date.now() }), /premise.*(?:ID|digest)|(?:ID|digest).*premise/i);

  const forgedBaselineSignals = [...retained];
  forgedBaselineSignals[0] = { ...forgedBaselineSignals[0], sourceUrl: 'https://example.com/forged-baseline-row' };
  assert.throws(() => verifyFloridaStarExpansionArtifact({
    state: { ...state, signals: [...forgedBaselineSignals, ...star] },
    baseline,
    now: Date.now(),
  }), /removed 1 immutable baseline store/i);
  const wrongPremiseSignals = [...retained];
  wrongPremiseSignals[0] = { ...wrongPremiseSignals[0], storeAddress: '999 Wrong Premise Way, Orlando, FL 32801' };
  assert.throws(() => verifyFloridaStarExpansionArtifact({
    state: { ...state, signals: [...wrongPremiseSignals, ...star] },
    baseline,
    now: Date.now(),
  }), /removed 1 immutable baseline store/i);

  assert.throws(() => verifyFloridaStarExpansionArtifact({
    state: { ...state, signals: [...retained, ...star.slice(0, 19)] },
    baseline,
    now: Date.now(),
  }), /at least 20|got 19/i);
  const zeroStar = { ...star[19], quantity: 0, reportedQuantity: 0, availabilityStatus: 'out_of_stock', canAlertAsInventory: false, canAlertAsWatch: false, raw: { ...star[19].raw, reportedQuantity: 0 } };
  assert.throws(() => verifyFloridaStarExpansionArtifact({
    state: { ...state, signals: [...retained, ...star.slice(0, 19), zeroStar] },
    baseline,
    now: Date.now(),
  }), /at least 20|got 19/i);
  assert.throws(() => verifyFloridaStarExpansionArtifact({
    state: { ...state, signals: [...retained.slice(1), ...star] },
    baseline,
    now: Date.now(),
  }), /baseline|removed/i);
  assert.throws(() => verifyFloridaStarExpansionArtifact({
    state: { ...state, signals: [...retained, ...star.map((row) => ({ ...row, observedAt: '2026-08-01T00:00:00.000Z' }))] },
    baseline,
    now: Date.now(),
  }), /at least 20|fresh/i);
});
