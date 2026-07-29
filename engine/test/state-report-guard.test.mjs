import test from 'node:test';
import assert from 'node:assert/strict';

import { guardStateReport, stateReportContinuityStateIds, usesPartialSignalContinuity } from '../src/state-report-guard.mjs';
import { markStaleReport } from '../src/state-report-fallback.mjs';

function report(state, count, { actionable = count, status = 'useful' } = {}) {
  return {
    state,
    status,
    finishedAt: '2026-07-13T00:00:00.000Z',
    signals: Array.from({ length: count }, (_, index) => ({
      id: `${state}-${index}`,
      locationPrecision: index < actionable ? 'store_level' : 'statewide_catalog',
      canAlertAsInventory: index < actionable,
      observedAt: '2026-07-13T00:00:00.000Z',
    })),
    sources: [{ ok: true }],
    roadblocks: [],
  };
}

test('preserves the last good state report when a successful collector silently collapses', () => {
  const previous = report('VA', 100);
  const candidate = report('VA', 20);
  previous.sourceCircuitState = { 'va:configured:fixture': { state: 'closed', consecutiveFailures: 0 } };
  candidate.sourceCircuitState = { 'va:configured:fixture': { state: 'open', consecutiveFailures: 3 } };
  candidate.sourceResults = [{ sourceId: 'va:configured:fixture', status: 'collapsed', attemptCount: 1 }];
  const result = guardStateReport({ previous, candidate, now: '2026-07-13T01:00:00.000Z' });

  assert.equal(result.accepted, false);
  assert.equal(result.report.signals.length, 100);
  assert.equal(result.report.stale, true);
  assert.match(result.report.staleReason, /signal count collapsed from 100 to 20/i);
  assert.equal(result.report.signals[0].observedAt, '2026-07-13T00:00:00.000Z');
  assert.equal(result.report.lastGoodAt, '2026-07-13T00:00:00.000Z');
  assert.equal(result.report.signals.every((signal) => signal.canAlertAsInventory === false && signal.canAlertAsWatch === false), true);
  assert.equal(result.report.sourceCircuitState['va:configured:fixture'].state, 'open');
  assert.equal(result.report.sourceResults[0].status, 'collapsed');
});

test('duplicate rows do not inflate the quality baseline or force a stale fallback', () => {
  const previous = report('TX', 100);
  const candidate = report('TX', 1);
  for (const signal of [...previous.signals, ...candidate.signals]) {
    signal.eventType = 'cityhive_store_inventory_result';
    signal.canonicalId = 'bottle-1';
    signal.storeId = 'store-1';
    signal.sourceLabel = 'Texas CityHive inventory';
    signal.productId = 'product-1';
  }

  const result = guardStateReport({ previous, candidate });
  assert.equal(result.accepted, true);
  assert.equal(result.report.signals.length, 1);
});

test('partial quality fallback publishes fresh rows and keeps missing identities as non-alerting stale context', () => {
  const previous = report('TX', 6);
  const candidate = report('TX', 2);
  candidate.finishedAt = '2026-07-25T04:00:00.000Z';

  const result = guardStateReport({
    previous,
    candidate,
    now: '2026-07-25T04:00:01.000Z',
    options: { mergePartialFallback: true },
  });

  assert.equal(result.accepted, true);
  assert.equal(result.report.status, 'partial_useful_quality_fallback');
  assert.equal(result.report.stale, false);
  assert.equal(result.report.partial, true);
  assert.match(result.report.partialReason, /collapsed/i);
  assert.equal(result.report.signals.length, 6);
  assert.equal(result.report.signals.filter((signal) => signal.sourceStale === true).length, 4);
  assert.equal(result.report.signals.filter((signal) => signal.sourceStale === true).every((signal) => typeof signal.staleSourceCaveat === 'string' && signal.staleSourceCaveat.length > 0), true);
  assert.equal(result.report.signals.filter((signal) => signal.canAlertAsInventory === true).length, 2);
  assert.equal(result.report.signals.filter((signal) => signal.sourceStale === true).every((signal) => signal.canAlertAsInventory === false && signal.canAlertAsWatch === false), true);
});

test('NC quality collapses use current-plus-stale continuity while unrelated states remain strict', () => {
  assert.equal(usesPartialSignalContinuity('NC'), true);
  assert.equal(usesPartialSignalContinuity('TX'), true);
  assert.equal(usesPartialSignalContinuity('SC'), true);
  assert.equal(usesPartialSignalContinuity('VA'), false);
});

test('NC partial continuity publishes current signals and makes every retained row non-alertable', () => {
  const previous = report('NC', 88);
  previous.signals.forEach((signal, index) => {
    signal.canonicalId = `bottle-${index}`;
    signal.storeId = `store-${index}`;
    signal.sourceAvailabilityVerified = true;
  });
  const candidate = report('NC', 25);
  candidate.finishedAt = '2026-07-29T03:10:40.000Z';
  candidate.signals.forEach((signal, index) => {
    signal.canonicalId = `bottle-${index}`;
    signal.storeId = `store-${index}`;
  });
  Object.assign(candidate.signals[24], {
    eventType: 'source_reachable_no_bourbon_signal',
    canonicalId: null,
    storeId: null,
    stale: true,
    sourceStale: true,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    alertable: false,
    sourceAvailabilityVerified: undefined,
    raw: { staleFallback: true },
  });

  const result = guardStateReport({
    previous,
    candidate,
    now: '2026-07-29T03:10:41.000Z',
    options: { mergePartialFallback: usesPartialSignalContinuity('NC') },
  });

  assert.equal(result.accepted, true);
  assert.equal(result.report.status, 'partial_useful_quality_fallback');
  assert.equal(result.report.stale, false);
  assert.equal(result.report.signals.filter((signal) => signal.sourceStale === true).length, 65);
  assert.equal(result.report.signals.filter((signal) => signal.sourceStale === true).every((signal) => (
    signal.canAlertAsInventory === false
      && signal.canAlertAsWatch === false
      && signal.alertable === false
      && signal.sourceAvailabilityVerified === false
      && signal.raw?.staleFallback === true
  )), true);
  assert.deepEqual(stateReportContinuityStateIds([result.report]), {
    fallbackStateIds: [],
    partialFallbackStateIds: ['NC'],
  });
});

test('repeated quality fallback keeps one stable status suffix', () => {
  const previous = report('TX', 100, { status: 'stale_useful_quality_fallback_quality_fallback' });
  const candidate = report('TX', 20);
  const result = guardStateReport({ previous, candidate, now: '2026-07-21T18:00:00.000Z' });

  assert.equal(result.accepted, false);
  assert.equal(result.report.status, 'stale_useful_quality_fallback');
});

test('accepts a healthy expansion and first report', () => {
  assert.equal(guardStateReport({ previous: report('FL', 1), candidate: report('FL', 73) }).accepted, true);
  assert.equal(guardStateReport({ previous: null, candidate: report('TX', 760) }).accepted, true);
});

test('NC repeat observations keep their first feed timestamp while real shipments and locations remain new', () => {
  const previous = {
    ...report('NC', 0),
    signals: [
      {
        id: 'wake-buffalo-trace',
        state: 'NC',
        eventType: 'store_inventory_result',
        canonicalId: 'buffalo-trace',
        sourceLabel: 'Wake County ABC store inventory search',
        sourceUrl: 'https://wakeabc.example/inventory/buffalo-trace',
        storeId: 'wake-store-1',
        storeName: 'Wake Store 1',
        locationPrecision: 'store_level',
        quantity: 6,
        availabilityStatus: 'in_stock',
        price: 29.95,
        observedAt: '2026-07-24T18:20:00.000Z',
        canAlertAsInventory: true,
      },
      {
        id: 'wake-shipment-12',
        state: 'NC',
        eventType: 'nc_board_shipment_snapshot',
        canonicalId: 'eagle-rare',
        sourceLabel: 'NC ABC Stock Shipped Data',
        sourceUrl: 'https://abc2.nc.gov/Pricing/ViewItemDetails/123',
        locationName: 'Wake County ABC Board',
        locationPrecision: 'board_county',
        quantity: 12,
        sourceEventAt: '2026-07-24T15:04:00.000Z',
        observedAt: '2026-07-24T15:04:00.000Z',
      },
    ],
  };
  const candidate = {
    ...report('NC', 0),
    finishedAt: '2026-07-24T21:41:00.000Z',
    signals: [
      {
        ...previous.signals[0],
        observedAt: '2026-07-24T21:40:00.000Z',
      },
      {
        ...previous.signals[1],
        id: 'wake-shipment-24',
        quantity: 24,
        sourceEventAt: '2026-07-24T21:04:00.000Z',
        observedAt: '2026-07-24T21:04:00.000Z',
      },
      {
        ...previous.signals[0],
        id: 'mecklenburg-buffalo-trace',
        storeId: 'mecklenburg-store-1',
        storeName: 'Mecklenburg Store 1',
        observedAt: '2026-07-24T21:40:00.000Z',
      },
    ],
  };

  const result = guardStateReport({ previous, candidate });
  assert.equal(result.accepted, true);

  const unchanged = result.report.signals.find((signal) => signal.id === 'wake-buffalo-trace');
  assert.equal(unchanged.observedAt, '2026-07-24T21:40:00.000Z');
  assert.equal(unchanged.firstSeenAt, '2026-07-24T18:20:00.000Z');
  assert.equal(unchanged.lastConfirmedAt, '2026-07-24T21:40:00.000Z');

  const shipment = result.report.signals.find((signal) => signal.id === 'wake-shipment-24');
  assert.equal(shipment.firstSeenAt, '2026-07-24T21:04:00.000Z');
  assert.equal(shipment.lastConfirmedAt, '2026-07-24T21:04:00.000Z');
  assert.ok(result.report.signals.some((signal) => signal.storeId === 'mecklenburg-store-1'));
});

test('preserves low-volume watch lanes when they collapse to zero', () => {
  const result = guardStateReport({ previous: report('KY', 8, { actionable: 0 }), candidate: report('KY', 0, { actionable: 0 }) });
  assert.equal(result.accepted, false);
  assert.equal(result.report.signals.length, 8);
});

test('does not use a zero-signal baseline to block legitimate empty watch states', () => {
  const result = guardStateReport({ previous: report('CA', 0, { actionable: 0 }), candidate: report('CA', 0, { actionable: 0 }) });
  assert.equal(result.accepted, true);
});

test('preserves last-good public bottle rows when unmatched inventory inflates total and actionable counts', () => {
  const previous = report('IN', 1000, { actionable: 100 });
  previous.signals.slice(0, 72).forEach((signal, index) => { signal.canonicalId = `bottle-${index}`; });
  const candidate = report('IN', 1400, { actionable: 295 });
  candidate.signals[0].canonicalId = 'bottle-0';

  const result = guardStateReport({ previous, candidate, now: '2026-07-17T11:00:00.000Z' });
  assert.equal(result.accepted, false);
  assert.match(result.reason, /public bottle candidate count collapsed from 72 to 1/i);
  assert.equal(result.report.status, 'stale_useful_quality_fallback');
  assert.equal(result.report.signals.length, 1000);
  assert.equal(result.report.signals.every((signal) => signal.canAlertAsInventory === false), true);
});

test('protects low-volume public bottle lanes from collapsing behind inflated generic inventory', () => {
  const previous = report('IN', 20, { actionable: 10 });
  previous.signals.slice(0, 4).forEach((signal, index) => { signal.canonicalId = `limited-${index}`; });
  const candidate = report('IN', 40, { actionable: 20 });

  const result = guardStateReport({ previous, candidate });
  assert.equal(result.accepted, false);
  assert.match(result.reason, /public bottle candidate count collapsed from 4 to 0/i);
});

test('uses projected customer tier rather than generic canonical identity for public-collapse guards', () => {
  const previous = report('IN', 1000, { actionable: 100 });
  previous.signals.slice(0, 72).forEach((signal, index) => { signal.canonicalId = `limited-${index}`; signal.tier = 'limited'; });
  const candidate = report('IN', 2000, { actionable: 300 });
  candidate.signals.slice(0, 300).forEach((signal, index) => { signal.canonicalId = `core-${index}`; signal.tier = 'core'; });
  const isPublicBottleCandidate = (signal) => ['limited', 'allocated', 'unicorn'].includes(signal.tier);

  const result = guardStateReport({ previous, candidate, options: { isPublicBottleCandidate } });
  assert.equal(result.accepted, false);
  assert.match(result.reason, /public bottle candidate count collapsed from 72 to 0/i);
});

test('duplicate inventory rows cannot hide a collapse in unique public bottle-store combinations', () => {
  const previous = report('IN', 1000, { actionable: 100 });
  previous.signals.slice(0, 72).forEach((signal, index) => {
    signal.canonicalName = `Rare Bottle ${index}`;
    signal.locationName = `Store ${index}`;
    signal.projectedTier = 'limited';
  });
  const candidate = report('IN', 1400, { actionable: 295 });
  candidate.signals.slice(0, 295).forEach((signal, index) => {
    signal.canonicalName = `Rare Bottle ${index % 7}`;
    signal.locationName = `Store ${index % 7}`;
    signal.projectedTier = 'limited';
  });
  const result = guardStateReport({
    previous,
    candidate,
    options: { isPublicBottleCandidate: (signal) => signal.projectedTier === 'limited' },
  });
  assert.equal(result.accepted, false);
  assert.match(result.reason, /actionable store signal count collapsed from 100 to 7/i);
});

test('a stale last-good fallback remains the public baseline on the next collection attempt', () => {
  const previous = report('IN', 1000, { actionable: 100 });
  previous.signals.slice(0, 72).forEach((signal, index) => { signal.canonicalId = `limited-${index}`; signal.tier = 'limited'; });
  const stalePrevious = markStaleReport(previous, { id: 'IN', label: 'Indiana' }, 'worker failed', '2026-07-17T11:00:00.000Z');
  const candidate = report('IN', 2000, { actionable: 300 });
  candidate.signals.slice(0, 300).forEach((signal, index) => { signal.canonicalId = `core-${index}`; signal.tier = 'core'; });
  const isPublicBottleCandidate = (signal) => ['limited', 'allocated', 'unicorn'].includes(signal.tier);

  const result = guardStateReport({ previous: stalePrevious, candidate, options: { isPublicBottleCandidate } });
  assert.equal(result.accepted, false);
  assert.match(result.reason, /public bottle candidate count collapsed from 72 to 0/i);
  assert.equal(result.report.signals.every((signal) => signal.canAlertAsInventory === false), true);
});

test('statewide tier rows do not inflate the stale store-level public baseline', () => {
  const previous = report('NC', 1274, { actionable: 76 });
  previous.signals.forEach((signal, index) => {
    signal.canonicalId = `limited-${index}`;
    signal.tier = 'limited';
    if (index >= 76) signal.locationPrecision = 'statewide_catalog';
  });
  const stalePrevious = markStaleReport(previous, { id: 'NC', label: 'North Carolina' }, 'worker failed');
  const candidate = report('NC', 1274, { actionable: 80 });
  candidate.signals.forEach((signal, index) => {
    signal.canonicalId = index < 80 ? `limited-new-${index}` : `core-${index}`;
    signal.tier = index < 80 ? 'limited' : 'core';
    if (index >= 80) signal.locationPrecision = 'statewide_catalog';
  });
  const isPublicBottleCandidate = (signal) => ['limited', 'allocated', 'unicorn'].includes(signal.tier);

  const result = guardStateReport({ previous: stalePrevious, candidate, options: { isPublicBottleCandidate } });
  assert.equal(result.accepted, true);
});
