import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  GEORGIA_CITYHIVE_SOURCES,
  GEORGIA_GOTOLIQUOR_STORES,
  GEORGIA_LIGHTSPEED_STORES,
  isAllowedGeorgiaBourbonIdentity,
  isAllowedGeorgiaBottleFormat,
  normalizeGeorgiaCityHiveQuantity,
  parseGeorgiaGoToLiquorStoreProducts,
  parseGeorgiaLightspeedProducts,
} from '../src/collectors/georgia-retailer-surfaces.mjs';
import {
  isGeorgiaRetailerInventory,
  isGeorgiaRetailerLastKnownInventoryEvidence,
  isGeorgiaRetailerSignalIdentity,
} from '../src/georgia-retailer-policy.mjs';
import { markSignalStaleNonAlertable } from '../src/stale-signal-policy.mjs';
import { confidenceForSignal } from '../src/confidence-policy.mjs';
import { legacyPrecisionRuntimeOptions } from '../src/collectors/precision-probes.mjs';
import { getStateLifecycle } from '../src/state-lifecycle.mjs';
import { ALL_STATE_SOURCES } from '../src/state-sources.mjs';
import { suppressGeorgiaActivationBaseline } from '../src/georgia-activation-policy.mjs';
import { verifyGeorgiaReleasePolicy } from '../src/georgia-release-policy.mjs';

const cityHiveSource = GEORGIA_CITYHIVE_SOURCES?.find((source) => source.id === 'tower-wine-spirits');
const goToStore = GEORGIA_GOTOLIQUOR_STORES?.find((store) => store.id === '1071');
const elemental = GEORGIA_LIGHTSPEED_STORES?.find((store) => store.id === 'elemental-spirits:atlanta');

function binarySignal(store, overrides = {}) {
  return {
    state: 'GA',
    stateCode: 'GA',
    eventType: 'retailer_store_inventory_result',
    sourceLabel: store.sourceLabel,
    sourceUrl: `${store.baseUrl}/p/buffalo-trace-bourbon/1138`,
    sourceChain: store.chain,
    merchantId: store.merchantId,
    productId: '1138',
    canonicalBottleId: 'buffalo-trace-bourbon',
    canonicalName: 'Buffalo Trace Bourbon',
    locationPrecision: 'store_level',
    storeId: store.storeId,
    storeName: store.name,
    locationName: store.name,
    storeAddress: store.address,
    city: store.city,
    storeCity: store.city,
    postalCode: store.postalCode || store.zip,
    zip: store.postalCode || store.zip,
    quantity: 0,
    quantityIsExact: false,
    inventorySemantics: 'binary_retailer_orderable_no_exact_count',
    availabilityStatus: 'in_stock',
    sourceAvailabilityVerified: true,
    confidence: 0.84,
    rawName: 'Buffalo Trace Bourbon 750ml',
    canAlertAsInventory: true,
    canAlertAsWatch: true,
    ...overrides,
  };
}

test('Georgia surface registry contains only the configured exact first-party identities', () => {
  assert.equal(GEORGIA_CITYHIVE_SOURCES.length, 17);
  assert.equal(GEORGIA_GOTOLIQUOR_STORES.length, 14);
  assert.equal(GEORGIA_LIGHTSPEED_STORES.length, 2);
  assert.ok(cityHiveSource);
  assert.deepEqual([...cityHiveSource.merchants.keys()].sort(), [
    '546bac733932330002ab0300',
    '66cde7d80f43792960cbe63e',
  ]);
  const greens = GEORGIA_CITYHIVE_SOURCES.find((source) => source.id === 'greens-beverages');
  assert.deepEqual([...greens.merchants.keys()].sort(), [
    '61e1d53d9f85351b2f07c313',
    '61e1d80a2645234aa8e83468',
  ]);
  assert.ok(GEORGIA_GOTOLIQUOR_STORES.every((store) => /^https:\/\/[^/?#]+\/c\/spirits\/whiskey\/19$/.test(store.categoryUrl)));
  assert.deepEqual(GEORGIA_LIGHTSPEED_STORES.map((store) => store.delayMs), [2_000, 2_000]);
});

test('GoToLiquorStore parser requires a visible store-bound Add to Cart control and a clean product URL', () => {
  const html = `
    <div class="product-item" data-store-id="1071">
      <a class="product-name" href="/p/buffalo-trace-bourbon/1138">Buffalo Trace Bourbon 750ml</a>
      <span class="price">$29.99</span>
      <button data-store-id="1071" onclick="GaAddtoCart('1138', '1071')">Add to Cart</button>
    </div>
    <div class="product-item" data-store-id="9999">
      <a class="product-name" href="/p/wrong-store-bourbon/2">Wrong Store Bourbon 750ml</a>
      <button data-store-id="9999" onclick="GaAddtoCart('2', '9999')">Add to Cart</button>
    </div>
    <div class="product-item" data-store-id="1071">
      <a class="product-name" href="/p/catalog-only-bourbon/3">Catalog Only Bourbon 750ml</a>
    </div>
    <div class="product-item" data-store-id="1071">
      <a class="product-name" href="/p/hidden-bourbon/4">Hidden Bourbon 750ml</a>
      <button hidden data-store-id="1071" onclick="GaAddtoCart('4', '1071')">Add to Cart</button>
    </div>
    <div class="product-item" data-store-id="1071">
      <a class="product-name" href="/p/search-route/5?q=bourbon">Query Route Bourbon 750ml</a>
      <button data-store-id="1071" onclick="GaAddtoCart('5', '1071')">Add to Cart</button>
    </div>`;
  assert.deepEqual(parseGeorgiaGoToLiquorStoreProducts(html, goToStore), [{
    productId: '1138',
    rawName: 'Buffalo Trace Bourbon 750ml',
    productUrl: 'https://www.bwcumming.com/p/buffalo-trace-bourbon/1138',
    price: 29.99,
  }]);
  assert.deepEqual(parseGeorgiaGoToLiquorStoreProducts('{malformed', goToStore), []);
  assert.deepEqual(parseGeorgiaGoToLiquorStoreProducts(html, { ...goToStore, id: '9998' }), []);
  const mismatchedCart = html.replace("GaAddtoCart('1138', '1071')", "GaAddtoCart('9999', '1071')");
  assert.deepEqual(parseGeorgiaGoToLiquorStoreProducts(mismatchedCart, goToStore), [], 'cart product identity must match the product URL identity');
  const hiddenInput = `<div class="product-item"><a href="/p/buffalo-trace-bourbon/1138">Buffalo Trace Bourbon 750ml</a><input type="hidden" data-store-id="1071" data-product-id="1138" value="GaAddtoCart Add to Cart"></div>`;
  assert.deepEqual(parseGeorgiaGoToLiquorStoreProducts(hiddenInput, goToStore), [], 'hidden inputs are not visible orderability evidence');
  const unboundCoincidence = `<div class="product-item"><a href="/p/test-bourbon/1071">Test Bourbon 750ml</a><button data-product-id="1071">Add to Cart</button></div>`;
  assert.deepEqual(parseGeorgiaGoToLiquorStoreProducts(unboundCoincidence, goToStore), [], 'a coincidental product/store id is not store binding');
  const hiddenCard = `<div class="product-item hidden"><a href="/p/buffalo-trace-bourbon/1138">Buffalo Trace Bourbon 750ml</a><button onclick="GaAddtoCart('1138', '1071')">Add to Cart</button></div>`;
  assert.deepEqual(parseGeorgiaGoToLiquorStoreProducts(hiddenCard, goToStore), [], 'hidden product cards are not visible evidence');
  const hiddenAncestor = `<section style="display:none"><div class="product-item"><a href="/p/buffalo-trace-bourbon/1138">Buffalo Trace Bourbon 750ml</a><button onclick="GaAddtoCart('1138', '1071')">Add to Cart</button></div></section>`;
  assert.deepEqual(parseGeorgiaGoToLiquorStoreProducts(hiddenAncestor, goToStore), [], 'controls inside hidden ancestors are not visible evidence');
});

test('Lightspeed parser accepts only visible same-host Add to cart product cards', () => {
  const elementalHtml = `
    <li class="col-6"><div class="prod-card">
      <a href="https://www.elementalspirits.co/cart/add/44/" class="btn prod-card__action-button">Add to cart</a>
      <a href="https://www.elementalspirits.co/buffalo-trace-bourbon.html" class="product-card__title">Buffalo Trace Bourbon 750ml</a>
      <ins class="prod-card__price">$34.99</ins>
    </div></li>
    <li class="col-6"><div class="prod-card">
      <a href="https://attacker.example/cart/add/45/" class="btn">Add to cart</a>
      <a href="https://www.elementalspirits.co/forged.html" class="product-card__title">Forged Bourbon 750ml</a>
    </div></li>
    <li class="col-6"><div class="prod-card">
      <a href="https://www.elementalspirits.co/catalog-only.html" class="product-card__title">Catalog Bourbon 750ml</a>
    </div></li>`;
  assert.deepEqual(parseGeorgiaLightspeedProducts(elementalHtml, elemental), [{
    productId: '44',
    rawName: 'Buffalo Trace Bourbon 750ml',
    productUrl: 'https://www.elementalspirits.co/buffalo-trace-bourbon.html',
    price: 34.99,
  }]);

  const ansley = GEORGIA_LIGHTSPEED_STORES.find((store) => store.id === 'ansley-wine-merchants:atlanta');
  const ansleyHtml = `<div class="product col-xs-6 col-sm-3">
    <div class="description"><a href="/cart/add/56892273/" class="cart">Add to cart</a></div>
    <a href="/1792-full-proof.html" title="1792 FULL PROOF" class="title">1792 FULL PROOF 750ml</a>
    <div class="left">$46.99</div>
  </div>`;
  assert.deepEqual(parseGeorgiaLightspeedProducts(ansleyHtml, ansley).map((row) => row.productId), ['56892273']);
});

test('Georgia bottle and quantity guards reject small formats, bundles, and fake sentinel counts', () => {
  for (const value of ['50ml Buffalo Trace', '375 ml bourbon', 'Buffalo Trace 3 Pack', 'Bourbon bundle', 'Case of 6 bourbon', '2 x 750ml bourbon']) {
    assert.equal(isAllowedGeorgiaBottleFormat(value), false, value);
  }
  for (const value of ['Buffalo Trace Bourbon 750ml', 'Maker\'s Mark 1 L', 'Booker\'s Bourbon']) {
    assert.equal(isAllowedGeorgiaBottleFormat(value), true, value);
  }
  assert.deepEqual(normalizeGeorgiaCityHiveQuantity(99), { reportedQuantity: 99, quantity: 99, quantityIsExact: true, binaryAvailability: false });
  assert.deepEqual(normalizeGeorgiaCityHiveQuantity(100), { reportedQuantity: 100, quantity: 0, quantityIsExact: false, binaryAvailability: true });
  assert.deepEqual(normalizeGeorgiaCityHiveQuantity(999), { reportedQuantity: 999, quantity: 0, quantityIsExact: false, binaryAvailability: true });
  assert.equal(isAllowedGeorgiaBourbonIdentity('Crown Royal Chocolate Whiskey', 'Crown Royal Chocolate'), false);
  assert.equal(isAllowedGeorgiaBourbonIdentity('Ben Holladay Soft Red Wheat Bottled In Bond', 'Ben Holladay 6 Year Missouri Bourbon'), true);
  assert.equal(isAllowedGeorgiaBourbonIdentity('Buffalo Trace Candle', 'Buffalo Trace Bourbon'), false);
  assert.equal(isAllowedGeorgiaBourbonIdentity('Buffalo Trace Tumbler', 'Buffalo Trace Bourbon'), false);
  assert.equal(isAllowedGeorgiaBourbonIdentity('Buffalo Trace Ornament', 'Buffalo Trace Bourbon'), false);
});

test('Georgia identity policy accepts exact GoToLiquorStore binary orderability and rejects every spoof dimension', () => {
  const valid = binarySignal(goToStore);
  assert.equal(isGeorgiaRetailerSignalIdentity(valid), true);
  assert.equal(isGeorgiaRetailerInventory(valid), true);
  for (const forged of [
    { ...valid, sourceLabel: `${valid.sourceLabel} spoof` },
    { ...valid, sourceUrl: 'https://attacker.example/p/bourbon/1138' },
    { ...valid, sourceUrl: valid.sourceUrl.replace('https:', 'http:') },
    { ...valid, raw: { chain: 'forged-chain', merchantId: valid.merchantId } },
    { ...valid, raw: { chain: valid.sourceChain, merchantId: '9999' } },
    { ...valid, merchantId: '9999' },
    { ...valid, storeId: 'beverage-world-cumming:9999' },
    { ...valid, storeAddress: '745 Lanier 400 Parkway, Cumming, FL 30040' },
    { ...valid, storeName: 'Attacker Liquor', locationName: 'Attacker Liquor' },
    { ...valid, city: 'Savannah', storeCity: 'Savannah' },
    { ...valid, zip: '99999', postalCode: '99999' },
    { ...valid, stateCode: 'FL' },
    { ...valid, eventType: 'retailer_catalog_availability' },
    { ...valid, sourceAvailabilityVerified: false },
    { ...valid, quantity: 1 },
    { ...valid, rawName: 'Buffalo Trace Bourbon 375ml' },
    { ...valid, rawName: 'Buffalo Trace Bourbon 3 Pack' },
    { ...valid, rawName: 'Buffalo Trace Bourbon Cream 750ml' },
  ]) {
    assert.equal(isGeorgiaRetailerInventory(forged), false, JSON.stringify(forged));
  }
});

test('Georgia identity policy binds exact CityHive merchant/address and Lightspeed shop identity', () => {
  const towerMerchant = cityHiveSource.merchants.get('66cde7d80f43792960cbe63e');
  const cityHive = {
    ...binarySignal({
      sourceLabel: cityHiveSource.sourceLabel,
      baseUrl: cityHiveSource.baseUrl,
      chain: cityHiveSource.id,
      merchantId: towerMerchant.id,
      storeId: `${cityHiveSource.id}:${towerMerchant.id}`,
      name: towerMerchant.name,
      address: towerMerchant.address,
      city: towerMerchant.city,
      postalCode: towerMerchant.postalCode || towerMerchant.zip,
    }),
    eventType: 'cityhive_store_inventory_result',
    sourceUrl: `${cityHiveSource.baseUrl}/shop/product/buffalo-trace`,
    quantity: 4,
    quantityIsExact: true,
    reportedQuantity: 4,
    inventorySemantics: 'exact_retailer_reported_quantity',
    productId: 'cityhive-option-product-id',
    raw: {
      chain: cityHiveSource.id,
      merchantId: towerMerchant.id,
      reportedQuantity: 4,
      product: { id: 'cityhive-parent-product-id' },
      option: { product_id: 'cityhive-option-product-id', merchant_id: towerMerchant.id },
    },
  };
  assert.equal(isGeorgiaRetailerInventory(cityHive), true);
  const unsupportedCityHive = structuredClone(cityHive);
  delete unsupportedCityHive.reportedQuantity;
  delete unsupportedCityHive.raw.reportedQuantity;
  delete unsupportedCityHive.raw.option.quantity;
  assert.equal(isGeorgiaRetailerInventory(unsupportedCityHive), false, 'CityHive inventory requires source quantity evidence');
  assert.equal(isGeorgiaRetailerInventory({ ...cityHive, merchantId: '61dc4ab6a1d5721307e9c20e' }), false);
  assert.equal(isGeorgiaRetailerInventory({ ...cityHive, raw: { ...cityHive.raw, reportedQuantity: 100 }, quantity: 100 }), false);

  const lightspeed = binarySignal(elemental, { sourceUrl: 'https://www.elementalspirits.co/buffalo-trace-bourbon.html' });
  assert.equal(isGeorgiaRetailerInventory(lightspeed), true);
  assert.equal(isGeorgiaRetailerInventory({ ...lightspeed, merchantId: 'lightspeed:640117' }), false);
  assert.equal(isGeorgiaRetailerInventory({ ...lightspeed, storeId: 'ansley-wine-merchants:atlanta' }), false);
});

test('central confidence policy enables only guarded Georgia store inventory including zero-quantity binary rows', () => {
  const valid = binarySignal(goToStore);
  const accepted = confidenceForSignal(valid);
  assert.equal(accepted.policyMode, 'alert_retailer_store_inventory_caveat');
  assert.equal(accepted.canAlertAsInventory, true);
  assert.equal(accepted.canAlertAsWatch, true);
  for (const forged of [
    { ...valid, sourceUrl: 'https://attacker.example/p/test' },
    { ...valid, merchantId: '9999' },
    { ...valid, eventType: 'retailer_catalog_availability' },
  ]) {
    const rejected = confidenceForSignal(forged);
    assert.equal(rejected.canAlertAsInventory, false);
    assert.equal(rejected.canAlertAsWatch, false);
  }
});

test('first Georgia retailer activation is on-site baseline only while later changes remain eligible', () => {
  const currentSignal = binarySignal(goToStore);
  const candidate = { ...currentSignal, eligibleForDelivery: true, blockers: [] };
  const [activation] = suppressGeorgiaActivationBaseline([candidate], [], [currentSignal]);
  assert.equal(activation.eligibleForDelivery, false);
  assert.ok(activation.blockers.includes('state_activation_baseline'));
  assert.equal(activation.sendRecommendation, 'display_on_site_until_change_detected');

  const invalidPrevious = { state: 'GA', eventType: 'retailer_store_inventory_result', canAlertAsInventory: false };
  const [stillActivation] = suppressGeorgiaActivationBaseline([candidate], [invalidPrevious], [currentSignal]);
  assert.equal(stillActivation.eligibleForDelivery, false);

  const [later] = suppressGeorgiaActivationBaseline([candidate], [], [currentSignal], { activated: true });
  assert.equal(later.eligibleForDelivery, true);
  assert.deepEqual(later.blockers, []);
});

test('Georgia release policy allows only an explicitly labeled non-alerting last-known fallback', () => {
  const observedAt = '2026-07-23T00:00:00.000Z';
  const staleReason = 'Quality guard preserved the last good report because signal count collapsed from 12 to 0.';
  const retainedSignal = markSignalStaleNonAlertable(
    binarySignal(goToStore, { observedAt }),
    staleReason,
    '2026-07-24T12:00:00.000Z',
  );
  const retainedDrop = {
    ...retainedSignal,
    type: retainedSignal.eventType,
    sourceStale: true,
    staleSourceCaveat: true,
  };
  const state = {
    state: 'GA',
    status: 'stale_useful_quality_fallback',
    stale: true,
    staleReason,
    staleFallbackAt: '2026-07-24T12:00:00.000Z',
    lastGoodAt: observedAt,
    signals: [retainedSignal],
  };

  const result = verifyGeorgiaReleasePolicy({
    state,
    siteDrops: [retainedDrop],
    siteAlerts: [],
    allowLabeledLastKnownFallback: true,
    nowMs: Date.parse('2026-07-24T13:00:00.000Z'),
  });

  assert.equal(result.fallback, true);
  assert.equal(result.inventorySignals, 1);
  assert.equal(result.projectedDrops, 1);
  assert.equal(isGeorgiaRetailerInventory(retainedSignal), false, 'the live-inventory predicate must continue to reject every retained row');
  assert.equal(retainedSignal.observedAt, observedAt, 'verification must not rewrite a retained observation timestamp');
  assert.equal(retainedSignal.stale, true, 'verification must never convert a stale row into a fresh row');
  assert.equal(retainedSignal.sourceAvailabilityVerified, false, 'last-known evidence must not remain currently verified');
  assert.equal(retainedSignal.raw.lastKnownSourceAvailabilityVerified, true, 'last-known proof must be preserved separately from current verification');
  assert.equal(isGeorgiaRetailerLastKnownInventoryEvidence(retainedSignal), true);
  assert.equal(isGeorgiaRetailerLastKnownInventoryEvidence({ ...retainedSignal, availabilityStatus: 'in_stock' }), false, 'current availability must remain explicitly stale');
  assert.equal(isGeorgiaRetailerLastKnownInventoryEvidence({ ...retainedSignal, sourceAvailabilityVerified: true }), false, 'last-known proof must never become current verification');
});

test('Georgia release policy keeps normal and targeted verification fresh-only', () => {
  const observedAt = '2026-07-24T12:00:00.000Z';
  const signal = binarySignal(goToStore, { observedAt });
  const drop = { ...signal, type: signal.eventType };
  const state = { state: 'GA', status: 'useful', stale: false, signals: [signal] };

  const result = verifyGeorgiaReleasePolicy({
    state,
    siteDrops: [drop],
    siteAlerts: [{
      state: 'GA',
      changeType: 'current_inventory_signal',
      eligibleForDelivery: true,
      eligibleForOnSite: true,
      eligibleForEmail: false,
      eligibleForSms: false,
      inventorySemantics: signal.inventorySemantics,
      quantityIsExact: false,
    }],
    nowMs: Date.parse('2026-07-24T13:00:00.000Z'),
  });
  assert.equal(result.fallback, false);

  const staleReason = 'Quality guard preserved the last good report because signal count collapsed from 12 to 0.';
  const staleSignal = markSignalStaleNonAlertable(
    { ...signal, observedAt: '2026-07-23T00:00:00.000Z' },
    staleReason,
    '2026-07-24T12:00:00.000Z',
  );
  const staleState = {
    state: 'GA',
    status: 'stale_useful_quality_fallback',
    stale: true,
    staleReason,
    staleFallbackAt: '2026-07-24T12:00:00.000Z',
    lastGoodAt: staleSignal.observedAt,
    signals: [staleSignal],
  };
  const staleDrop = { ...staleSignal, type: staleSignal.eventType, sourceStale: true, staleSourceCaveat: true };

  assert.throws(() => verifyGeorgiaReleasePolicy({
    state: staleState,
    siteDrops: [staleDrop],
    siteAlerts: [],
    nowMs: Date.parse('2026-07-24T13:00:00.000Z'),
  }), /fresh|fallback/i, 'strict GA verification must reject a retained fallback');

  assert.throws(() => verifyGeorgiaReleasePolicy({
    state: { ...staleState, staleReason: '', staleFallbackAt: null },
    siteDrops: [staleDrop],
    siteAlerts: [],
    allowLabeledLastKnownFallback: true,
    nowMs: Date.parse('2026-07-24T13:00:00.000Z'),
  }), /explicit|label|reason/i, 'fallback opt-in must not accept an unlabeled stale report');

  assert.throws(() => verifyGeorgiaReleasePolicy({
    state: staleState,
    siteDrops: [{ ...staleDrop, canAlertAsInventory: true }],
    siteAlerts: [],
    allowLabeledLastKnownFallback: true,
    nowMs: Date.parse('2026-07-24T13:00:00.000Z'),
  }), /non-alert|alert/i, 'fallback rows must never regain alert eligibility');

  assert.throws(() => verifyGeorgiaReleasePolicy({
    state: staleState,
    siteDrops: [{ ...staleDrop, storeId: 'forged:store' }],
    siteAlerts: [],
    allowLabeledLastKnownFallback: true,
    nowMs: Date.parse('2026-07-24T13:00:00.000Z'),
  }), /exact|identity/i, 'fallback rows must preserve exact retailer and premises identity');
});

test('Georgia lifecycle and registry expose retailer inventory within the authoritative active-state set', () => {
  const config = JSON.parse(readFileSync(new URL('../../src/config/state-lifecycle.json', import.meta.url), 'utf8'));
  assert.equal(new Set(config.activeStates).size, config.activeStates.length);
  assert.ok(config.activeStates.includes('GA'));
  const lifecycle = getStateLifecycle('GA');
  assert.equal(lifecycle.sourceLabel, 'Georgia retailer inventory + Costco warehouse watch');
  assert.equal(lifecycle.lifecycle, 'retailer_store_inventory');
  assert.equal(lifecycle.coverageTier, 'live_store_inventory');
  assert.equal(lifecycle.refinementLevel, 'city_store');
  assert.match(lifecycle.customerSummary, /first-party retailer/i);
  assert.match(lifecycle.customerSummary, /binary/i);
  assert.match(lifecycle.customerSummary, /quantity/i);
  assert.match(lifecycle.customerSummary, /verify before driving/i);

  const georgia = ALL_STATE_SOURCES.find((state) => state.id === 'GA');
  assert.equal(georgia.strategy, 'retailer_store_inventory');
  assert.equal(georgia.sources.length, 34);
  const labels = new Set(georgia.sources.map((source) => source.label || source.name));
  for (const source of [...GEORGIA_CITYHIVE_SOURCES, ...GEORGIA_GOTOLIQUOR_STORES, ...GEORGIA_LIGHTSPEED_STORES]) {
    assert.ok(labels.has(source.sourceLabel), `Missing Georgia registry source ${source.sourceLabel}`);
  }
});

test('Georgia precision, exporter, verifier, and publication workflow are guarded end to end', () => {
  assert.deepEqual(legacyPrecisionRuntimeOptions('GA', {}, {}), { timeoutMs: 300_000, maxAttempts: 1 });
  const precision = readFileSync(new URL('../src/collectors/precision-probes.mjs', import.meta.url), 'utf8');
  assert.match(precision, /LEGACY_PRECISION_RUNTIME_STATES[\s\S]*?'GA'/);
  assert.match(precision, /if \(config\.id === 'GA'\) return collectGeorgia\(config, bible/);
  assert.match(precision, /curlTextFetch/);
  assert.match(precision, /GEORGIA_LIGHTSPEED_SOURCES_DELAY_MS|source\.delayMs/);
  assert.match(precision, /normalizeGeorgiaCityHiveQuantity/);

  const exporter = readFileSync(new URL('../src/export-site-contract.mjs', import.meta.url), 'utf8');
  assert.match(exporter, /isGeorgiaRetailerInventory/);
  assert.match(exporter, /isGeorgiaRetailerSignalIdentity/);
  assert.match(exporter, /signal\.state === 'GA'/);
  assert.match(exporter, /const georgiaBaseline = drop\.state === 'GA'/);
  assert.match(exporter, /quantityIsExact:/);
  assert.match(exporter, /reportedQuantity:/);
  assert.match(exporter, /binaryRetailerOrderability[\s\S]*?eligibleForEmail:[^\n]*false[\s\S]*?eligibleForSms:[^\n]*false/);

  const operational = readFileSync(new URL('../src/operational-report.mjs', import.meta.url), 'utf8');
  assert.match(operational, /quantityIsExact:[\s\S]*?signal\.quantityIsExact/);
  assert.match(operational, /signal\.state === 'GA'[\s\S]*?signal\.inventorySemantics/);

  const enginePackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(enginePackage.scripts['test:ga'], 'node --test test/georgia-retailer-engine.test.mjs');
  assert.equal(enginePackage.scripts['verify:ga'], 'node src/verify-ga.mjs');
  const workflow = readFileSync(new URL('../../.github/workflows/refresh-feed.yml', import.meta.url), 'utf8');
  assert.match(workflow, /Verify Georgia scheduled lane or isolate an explicit last-known fallback/);
  assert.match(workflow, /Verify Georgia targeted private-retailer recovery/);
  assert.match(workflow, /engine\/out\/optimization\/georgia-retailer-activation\.json/);
  assert.match(workflow, /Verify Georgia scheduled lane or isolate an explicit last-known fallback[\s\S]{0,240}!inputs\.states[\s\S]{0,240}--allow-labeled-last-known-fallback/);
  assert.match(workflow, /Verify Georgia targeted private-retailer recovery[\s\S]{0,240}inputs\.states && contains\(inputs\.states, 'GA'\)[\s\S]{0,180}run: npm run verify:ga/);
  assert.ok(workflow.indexOf('Verify coherent site contract') < workflow.indexOf('Verify Georgia scheduled lane or isolate an explicit last-known fallback'));
  assert.ok(workflow.indexOf('Verify Georgia targeted private-retailer recovery') < workflow.indexOf('Publish and atomically activate encrypted snapshot'));

  const runEngine = readFileSync(new URL('../src/run.mjs', import.meta.url), 'utf8');
  assert.match(runEngine, /GA:\s*Number\(process\.env\.BOURBON_SIGNAL_GA_STATE_TIMEOUT_MS\s*\|\|\s*420_000\)/);
  const genericCollector = readFileSync(new URL('../src/collectors/generic-state.mjs', import.meta.url), 'utf8');
  assert.match(genericCollector, /status:\s*precisionProbe\.stale[\s\S]{0,400}:\s*retainedNotDue/, 'stale source backoff must remain explicitly stale before retained-not-due labeling');
});
