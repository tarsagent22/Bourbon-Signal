import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { GEORGIA_CITYHIVE_SOURCES } from '../src/collectors/georgia-retailer-surfaces.mjs';
import { calculateStateExpansionMetrics, normalizeStateCode } from '../../scripts/lib/state-expansion-runtime.mjs';

const expectedSources = new Map([
  ['hd-wine-spirits', ['602d5a6c72b84f0c61d19281', '470 South Atlanta Street, Roswell, GA 30075']],
  ['savi-provisions-decatur', ['6930c397acb8bc7e3f5cacf9', '180 West Ponce de Leon Avenue, Decatur, GA 30030']],
  ['beverage-city-2', ['59810308d05b4360e32fc0fe', '5370 Campbellton Fairburn Road, Fairburn, GA 30213']],
  ['supreme-international-bws', ['683f8c2b49391b4d8202146c', '1338 Veterans Memorial Highway Southwest, Mableton, GA 30126']],
  ['macs-beer-and-wine', ['629f5a1ee808aa2666f4d62d', '21 Peachtree Place Northwest, Atlanta, GA 30309']],
  ['l-and-l-liquor', ['69a064d5f52db426597c677e', '2763 Georgia 54, Peachtree City, GA 30269']],
]);

test('Georgia expansion registers six reviewed first-party CityHive exact-store sources', () => {
  assert.equal(GEORGIA_CITYHIVE_SOURCES.length, 17);
  for (const [sourceId, [merchantId, address]] of expectedSources) {
    const source = GEORGIA_CITYHIVE_SOURCES.find((candidate) => candidate.id === sourceId);
    assert.ok(source, `${sourceId} missing`);
    assert.match(source.categoryUrl, /^https:\/\//);
    assert.equal(source.merchants.size, 1);
    assert.equal(source.merchants.get(merchantId)?.address, address);
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

test('state expansion runtime accepts only canonical two-letter state codes', () => {
  assert.equal(normalizeStateCode(' ga '), 'GA');
  assert.throws(() => normalizeStateCode('Georgia'), /two-letter/i);
});
