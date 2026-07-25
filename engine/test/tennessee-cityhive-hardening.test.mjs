import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshCityHivePositiveSignals,
  normalizeCityHiveReportedQuantity,
  reconcileCityHiveRateLimitsWithCache,
  rotatingSourceCohort,
} from '../src/collectors/cityhive-hardening.mjs';

test('Tennessee CityHive cohorts rotate without hammering the full source universe', () => {
  const sources = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(rotatingSourceCohort(sources, '1970-01-01T00:00:00.000Z', 2, 60 * 60_000), ['a', 'b']);
  assert.deepEqual(rotatingSourceCohort(sources, '1970-01-01T01:00:00.000Z', 2, 60 * 60_000), ['c', 'd']);
  assert.equal(new Set(rotatingSourceCohort(sources, '1970-01-01T02:00:00.000Z', 8, 60 * 60_000)).size, 5);
});

test('CityHive quantity 100 is binary availability rather than an exact shelf count', () => {
  assert.deepEqual(normalizeCityHiveReportedQuantity(100), {
    reportedQuantity: 100,
    binaryAvailability: true,
    quantity: 1
  });
  assert.deepEqual(normalizeCityHiveReportedQuantity(7), {
    reportedQuantity: 7,
    binaryAvailability: false,
    quantity: 7
  });
});

test('CityHive fallback accepts only fresh positive rows from the requested source', () => {
  const observedAt = '2026-07-23T06:00:00.000Z';
  const signals = [
    { eventType: 'cityhive_store_inventory_result', quantity: 1, observedAt: '2026-07-23T02:00:00.000Z', raw: { chain: 'paradise-fubar-liquors' } },
    { eventType: 'cityhive_store_inventory_result', quantity: 1, observedAt: '2026-07-22T20:00:00.000Z', raw: { chain: 'paradise-fubar-liquors' } },
    { eventType: 'cityhive_store_inventory_out_of_stock', quantity: 0, observedAt: '2026-07-23T05:00:00.000Z', raw: { chain: 'paradise-fubar-liquors' } },
    { eventType: 'cityhive_store_inventory_result', quantity: 1, observedAt: '2026-07-23T05:00:00.000Z', raw: { chain: 'other-source' } },
  ];
  assert.deepEqual(
    freshCityHivePositiveSignals(signals, ['paradise-fubar-liquors'], observedAt, 6 * 60 * 60_000),
    [signals[0]],
  );
});

test('a rate-limited Tennessee source is not reported broken when fresh positive cache preserves it', () => {
  const result = reconcileCityHiveRateLimitsWithCache({
    sources: [{
      id: 'happy-ours-wine-and-spirits',
      sourceLabel: 'Happy Ours Wine & Spirits CityHive store inventory',
    }],
    roadblocks: [
      { source: 'Happy Ours Wine & Spirits CityHive store inventory', status: 429, error: 'HTTP 429' },
      { source: 'Happy Ours Wine & Spirits CityHive store inventory', status: 'reachable_no_safe_inventory_rows', error: 'No safe inventory rows' },
      { source: 'Another source', status: 500, error: 'HTTP 500' },
    ],
    retainedSignals: [{
      eventType: 'cityhive_store_inventory_result',
      quantity: 1,
      raw: { chain: 'happy-ours-wine-and-spirits', cacheFallback: true },
    }],
  });

  assert.deepEqual(result.recoveredSourceIds, ['happy-ours-wine-and-spirits']);
  assert.deepEqual(result.roadblocks, [{ source: 'Another source', status: 500, error: 'HTTP 500' }]);
});

test('live rows do not disguise a current CityHive rate limit as recovered cache', () => {
  const roadblock = { source: 'Happy Ours Wine & Spirits CityHive store inventory', status: 429, error: 'HTTP 429' };
  const result = reconcileCityHiveRateLimitsWithCache({
    sources: [{ id: 'happy-ours-wine-and-spirits', sourceLabel: roadblock.source }],
    roadblocks: [roadblock],
    retainedSignals: [{
      eventType: 'cityhive_store_inventory_result',
      quantity: 1,
      raw: { chain: 'happy-ours-wine-and-spirits' },
    }],
  });

  assert.deepEqual(result.recoveredSourceIds, []);
  assert.deepEqual(result.roadblocks, [roadblock]);
});

test('a 429 remains actionable when cache has no positive inventory for that source', () => {
  const roadblock = { source: 'Happy Ours Wine & Spirits CityHive store inventory', status: 429, error: 'HTTP 429' };
  const result = reconcileCityHiveRateLimitsWithCache({
    sources: [{ id: 'happy-ours-wine-and-spirits', sourceLabel: roadblock.source }],
    roadblocks: [roadblock],
    retainedSignals: [{ eventType: 'cityhive_store_inventory_out_of_stock', quantity: 0, raw: { chain: 'happy-ours-wine-and-spirits' } }],
  });

  assert.deepEqual(result.recoveredSourceIds, []);
  assert.deepEqual(result.roadblocks, [roadblock]);
});

test('a real source failure replaces its contradictory reachable-no-inventory summary', () => {
  const source = 'Happy Ours Wine & Spirits CityHive store inventory';
  const failure = { source, status: 429, error: 'HTTP 429' };
  const result = reconcileCityHiveRateLimitsWithCache({
    sources: [{ id: 'happy-ours-wine-and-spirits', sourceLabel: source }],
    roadblocks: [
      failure,
      { source, status: 'reachable_no_safe_inventory_rows', error: 'No safe inventory rows' },
    ],
    retainedSignals: [],
  });

  assert.deepEqual(result.roadblocks, [failure]);
});
