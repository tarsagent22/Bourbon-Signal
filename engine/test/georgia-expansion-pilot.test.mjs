import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { GEORGIA_CITYHIVE_SOURCES } from '../src/collectors/georgia-retailer-surfaces.mjs';
import { cityHiveJsonBlobs, cityHiveProducts } from '../src/collectors/precision-probes.mjs';
import { calculateStateExpansionMetrics, normalizeStateCode } from '../../scripts/lib/state-expansion-runtime.mjs';

const expectedSources = new Map([
  ['hd-wine-spirits', ['602d5a6c72b84f0c61d19281', '470 South Atlanta Street, Roswell, GA 30075']],
  ['savi-provisions-decatur', ['6930c397acb8bc7e3f5cacf9', '180 West Ponce de Leon Avenue, Decatur, GA 30030']],
  ['roswell-liquor-store', ['67b0a26775b60028f019fc7d', '2300 Holcomb Bridge Rd, Roswell, GA 30076, USA']],
  ['my-friends-bottle-shop', ['6060f60659a44e1d9f414fe3', '275 Memorial Dr SE a, Atlanta, GA 30312, USA']],
  ['dekalb-package', ['614294182bffa1413867340c', '3711 N Decatur Rd, Decatur, GA 30032, USA']],
  ['rox-fine-wine-spirits', ['67ba353e1097104c5948a0e9', '910 Peachtree Pkwy, Cumming, GA 30041, USA']],
  ['island-spirit', ['59810379d05b4360e32fc57e', '444 Johnny Mercer Blvd, Savannah, GA 31410, USA']],
  ['beverage-city-2', ['59810308d05b4360e32fc0fe', '5370 Campbellton Fairburn Road, Fairburn, GA 30213']],
  ['supreme-international-bws', ['683f8c2b49391b4d8202146c', '1338 Veterans Memorial Highway Southwest, Mableton, GA 30126']],
  ['macs-beer-and-wine', ['629f5a1ee808aa2666f4d62d', '21 Peachtree Place Northwest, Atlanta, GA 30309']],
  ['l-and-l-liquor', ['69a064d5f52db426597c677e', '2763 Georgia 54, Peachtree City, GA 30269']],
  ['hwy-155-package', ['62d51cb495773e3714a3a607', '3430 N McDonough Rd, Locust Grove, GA 30248, USA']],
  ['cedartown-liquor-store', ['614319de6c4f35678fe21c40', '830 N Main St, Cedartown, GA 30125, USA']],
  ['jackies-fine-wine-spirits', ['628d3d80ca936b26d57b73be', '3140 Johnson Ferry Rd, Marietta, GA 30062, USA']],
  ['big-johns-package-store', ['6580b79f060c6a2bc31bb022', '5345 Memorial Dr, Stone Mountain, GA 30083, USA']],
  ['shannon-beverage-warehouse', ['5e7179a4453f5434f5a32e77', '6900 Londonderry Way, Union City, GA 30291, USA']],
  ['metro-bottle-atlanta', ['66708b917a01b0290869f338', '2225 Marietta Blvd NW, Atlanta, GA 30318, USA']],
  ['savi-provisions-atlanta', ['604a7a795063d2197ab0aefc', '308 Pharr Rd NE, Atlanta, GA 30305, USA']],
]);

const liveObservations = JSON.parse(readFileSync(
  new URL('./fixtures/ga/cityhive/expansion-live-observations.json', import.meta.url),
  'utf8',
));

test('Georgia expansion registers the reviewed first-party CityHive exact-store sources', () => {
  assert.equal(GEORGIA_CITYHIVE_SOURCES.length, 29);
  for (const [sourceId, [merchantId, address]] of expectedSources) {
    const source = GEORGIA_CITYHIVE_SOURCES.find((candidate) => candidate.id === sourceId);
    assert.ok(source, `${sourceId} missing`);
    assert.match(source.categoryUrl, /^https:\/\//);
    assert.equal(source.merchants.size, 1);
    assert.equal(source.merchants.get(merchantId)?.address, address);
  }
});

test('Georgia expansion replays retained raw first-party captures through the production CityHive parser', () => {
  assert.equal(liveObservations.schemaVersion, 'bourbon-signal-raw-first-party-capture-v1');
  assert.equal(liveObservations.observations.length, 6);
  for (const observation of liveObservations.observations) {
    const source = GEORGIA_CITYHIVE_SOURCES.find((candidate) => candidate.id === observation.sourceId);
    assert.ok(source, `${observation.sourceId} missing`);
    const merchant = source.merchants.get(observation.merchantId);
    assert.equal(merchant?.address, observation.address);
    assert.equal(source.categoryUrl, observation.categoryUrl);
    assert.equal(new URL(observation.captureUrl).hostname, new URL(source.baseUrl).hostname);
    const rawCapture = readFileSync(new URL(`./fixtures/ga/cityhive/${observation.captureFile}`, import.meta.url), 'utf8');
    const blobs = cityHiveJsonBlobs(rawCapture);
    assert.equal(blobs.length, 1, `${observation.sourceId} capture must retain one exact parser-visible expression`);
    const products = cityHiveProducts(blobs);
    const parsedProduct = products.find((product) => String(product?.id || '') === observation.catalogProductId);
    assert.ok(parsedProduct, `${observation.sourceId} product missing from raw replay`);
    const parsedOption = parsedProduct.merchants
      ?.flatMap((candidate) => candidate?.product_options || [])
      .find((candidate) => String(candidate?.option_id || '') === observation.variantId);
    assert.ok(parsedOption, `${observation.sourceId} option missing from raw replay`);
    assert.equal(String(parsedOption.merchant_id), observation.merchantId);
    assert.equal(parsedOption.full_address, observation.address);
    assert.equal(Number(parsedOption.quantity), observation.reportedQuantity);
    assert.equal(String(parsedOption.product_id), observation.productId);
    assert.equal(parsedProduct.name, observation.productName);
    const productUrl = new URL(parsedOption.product_url);
    assert.equal(productUrl.hostname, new URL(source.baseUrl).hostname);
    assert.match(productUrl.pathname, new RegExp(`/shop/product/.+/${observation.productId}$`));
    assert.equal(productUrl.searchParams.get('option-id'), observation.variantId);
  }
});

test('Georgia collector uses bounded domain-aware source lanes and exports timing metadata', () => {
  const source = readFileSync(new URL('../src/collectors/precision-probes.mjs', import.meta.url), 'utf8');
  assert.match(source, /BOURBON_SIGNAL_GA_SOURCE_CONCURRENCY/);
  assert.match(source, /runBoundedSourceLanes\(\[\s*\{ name: 'cityhive'/);
  assert.match(source, /sourceConcurrency:\s*laneRun\.concurrency/);
  assert.match(source, /sourceTimings:\s*laneRun\.timings/);
  assert.match(source, /sleepWithSignal\(GA_CITYHIVE_PAGE_DELAY_MS/);
});

test('state expansion metrics count only fresh exact-store alertable inventory and stale leakage', () => {
  const current = {
    state: 'GA', eventType: 'cityhive_store_inventory_result', storeId: 'a', locationPrecision: 'store_level',
    storeName: 'Store A', storeAddress: '1 Main St, Atlanta, GA 30303', sourceLabel: 'Store A inventory',
    sourceUrl: 'https://example.com/product/a', merchantId: 'merchant-a', productId: 'product-a', canonicalBottleId: 'bottle-a',
    sourceAvailabilityVerified: true, availabilityStatus: 'in_stock',
    canAlertAsInventory: true, canAlertAsWatch: true, observedAt: '2026-07-30T03:00:00.000Z',
  };
  const stale = { ...current, storeId: 'b', stale: true };
  const directory = { state: 'GA', eventType: 'retailer_store_location', storeId: 'c', locationPrecision: 'store_level' };
  const metrics = calculateStateExpansionMetrics({
    stateCode: 'GA',
    stateReport: { state: 'GA', stale: false, signals: [current, stale, directory] },
    siteDrops: { items: [current, stale, { ...current, state: 'TN', storeId: 'tn' }] },
    coverageState: { representedAreaCount: 2, layers: { known: 36, live: 7, alertGrade: 6 } },
    nowMs: Date.parse('2026-07-30T04:00:00.000Z'),
  });
  assert.deepEqual(metrics, {
    knownStores: 36,
    liveStores: 1,
    alertGradeStores: 1,
    representedAreas: 2,
    freshExactStoreDrops: 1,
    alertableStaleRows: 2,
  });
});

test('state expansion metrics reject watch-only, unbound, and pre-probe rows', () => {
  const base = {
    state: 'GA', eventType: 'retailer_store_inventory_result', storeId: 'a', storeName: 'Store A',
    storeAddress: '1 Main St, Atlanta, GA 30303', locationPrecision: 'store_level', sourceLabel: 'Store inventory',
    sourceUrl: 'https://example.com/product/a', merchantId: 'merchant-a', productId: 'product-a', canonicalBottleId: 'bottle-a',
    sourceAvailabilityVerified: true, availabilityStatus: 'in_stock', canAlertAsInventory: true,
    observedAt: '2026-07-30T03:00:00.000Z',
  };
  const metrics = calculateStateExpansionMetrics({
    stateCode: 'GA',
    stateReport: { signals: [{ ...base, canAlertAsInventory: false }, { ...base, storeId: 'missing-address', storeAddress: '' }, base] },
    siteDrops: { items: [base] },
    nowMs: Date.parse('2026-07-30T04:00:00.000Z'),
    minimumObservedAtMs: Date.parse('2026-07-30T03:30:00.000Z'),
  });
  assert.equal(metrics.liveStores, 0);
  assert.equal(metrics.alertGradeStores, 0);
  assert.equal(metrics.freshExactStoreDrops, 0);
});

test('production verification binds public data to the targeted run and observation window', () => {
  const source = readFileSync(new URL('../../scripts/verify-production-state-expansion.mjs', import.meta.url), 'utf8');
  assert.match(source, /stateReport\.runId !== stats\.runId/);
  assert.match(source, /stats\.generatedAt[\s\S]*stateReport\.finishedAt/);
  assert.match(source, /minimumObservedAtMs:\s*Date\.parse\(stateReport\.startedAt/);
});

test('Georgia live probe derives the isolated customer projection from the fresh state report', () => {
  const source = readFileSync(new URL('../../scripts/run-state-expansion-live-probe.mjs', import.meta.url), 'utf8');
  assert.match(source, /state !== 'FL' && state !== 'SC' && state !== 'GA'/);
  assert.match(source, /state === 'GA'[\s\S]*?src\/run\.mjs/);
  assert.match(source, /buildDrops\(freshGeorgia\.signals/);
  assert.match(source, /verifyGeorgiaReleasePolicy\(\{ state: freshGeorgia, siteDrops: localGeorgiaDrops, siteAlerts: \[\] \}\)/);
});

test('state expansion runtime accepts only canonical two-letter state codes', () => {
  assert.equal(normalizeStateCode(' ga '), 'GA');
  assert.throws(() => normalizeStateCode('Georgia'), /two-letter/i);
});
