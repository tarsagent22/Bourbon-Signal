import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSourceUsefulnessReport,
  sourceUsefulnessMarkdown,
} from '../src/optimization/source-usefulness-report.mjs';

const GENERATED_AT = '2026-07-24T16:00:00.000Z';

function sourceReport({
  state,
  sourceId,
  sourceLabel,
  sourceUrl,
  signals = [],
  roadblocks = [],
}) {
  return {
    state,
    status: 'useful',
    sources: [{
      sourceRuntimeId: sourceId,
      label: sourceLabel,
      url: sourceUrl,
      ok: true,
      signalType: 'fixture',
    }],
    sourceResults: [{
      sourceId,
      sourceLabel,
      sourceUrl,
      status: 'success',
      startedAt: '2026-07-24T15:59:59.000Z',
      finishedAt: GENERATED_AT,
    }],
    signals: signals.map((signal) => ({
      state,
      sourceRuntimeId: sourceId,
      sourceLabel,
      sourceUrl,
      observedAt: '2026-07-24T15:00:00.000Z',
      ...signal,
    })),
    roadblocks: roadblocks.map((roadblock) => ({
      state,
      sourceRuntimeId: sourceId,
      source: sourceLabel,
      ...roadblock,
    })),
  };
}

function siteAlert({ state, source, sourceUrl, storeId, freshnessHours = 1, eligibleForDelivery = true }) {
  return {
    state,
    source,
    sourceUrl,
    storeId,
    locationPrecision: 'store_level',
    eligibleForDelivery,
    freshnessHours,
    priorityClass: 'major',
    tier: 'allocated',
  };
}

test('fresh exact-store alert evidence outranks arbitrarily broad catalog and watch-only breadth', () => {
  const exact = sourceReport({
    state: 'AA',
    sourceId: 'precision:aa',
    sourceLabel: 'AA exact-store inventory',
    sourceUrl: 'https://aa.example.test/inventory',
    signals: [{
      id: 'exact-signal',
      eventType: 'store_inventory_result',
      locationPrecision: 'store_level',
      storeId: 'aa-1',
      canonicalBottleId: 'allocated-bottle',
      canAlertAsInventory: true,
    }],
    roadblocks: [{ status: 503, error: 'one bounded upstream failure' }],
  });
  const catalog = sourceReport({
    state: 'BB',
    sourceId: 'bb:catalog',
    sourceLabel: 'BB broad catalog',
    sourceUrl: 'https://bb.example.test/catalog',
    signals: Array.from({ length: 500 }, (_, index) => ({
      id: `catalog-${index}`,
      eventType: index % 2 ? 'bottle_catalog_signal' : 'release_document_signal',
      locationPrecision: 'statewide_catalog',
      canonicalBottleId: `catalog-bottle-${index}`,
      canAlertAsWatch: true,
    })),
  });
  const report = buildSourceUsefulnessReport({
    stateReports: [catalog, exact],
    customerDrops: [{
      state: 'AA',
      source: 'AA exact-store inventory',
      sourceUrl: 'https://aa.example.test/inventory',
      storeId: 'aa-1',
      locationPrecision: 'store_level',
      canAlertAsInventory: true,
      observedAt: '2026-07-24T15:00:00.000Z',
    }],
    customerAlerts: [
      siteAlert({
        state: 'AA',
        source: 'AA exact-store inventory',
        sourceUrl: 'https://aa.example.test/inventory',
        storeId: 'aa-1',
      }),
      ...Array.from({ length: 500 }, (_, index) => ({
        state: 'BB',
        source: 'BB broad catalog',
        sourceUrl: 'https://bb.example.test/catalog',
        locationPrecision: 'board_county',
        eligibleForDelivery: true,
        freshnessHours: 1,
        storeId: `not-exact-${index}`,
      })),
    ],
    sourceRunHistory: {
      observations: [
        { sourceId: 'precision:aa', observedAt: GENERATED_AT, outcome: 'success', runtimeMs: 120_000 },
        { sourceId: 'bb:catalog', observedAt: GENERATED_AT, outcome: 'success', runtimeMs: 1_000 },
      ],
    },
    sourceSlo: {
      sources: [
        { sourceId: 'precision:aa', observedSampleCount: 10, successfulSampleCount: 8, availabilityRatio: 0.8 },
        { sourceId: 'bb:catalog', observedSampleCount: 10, successfulSampleCount: 10, availabilityRatio: 1 },
      ],
    },
    sourceHealth: {
      states: [
        { state: 'AA', stale: false, roadblockCount: 1 },
        { state: 'BB', stale: false, roadblockCount: 0 },
      ],
    },
    stateRunMetrics: {
      AA: { probes: 10, usefulChanges: 2, failures: 1, lastRuntimeMs: 120_000 },
      BB: { probes: 10, usefulChanges: 10, failures: 0, lastRuntimeMs: 1_000 },
    },
    generatedAt: GENERATED_AT,
  });

  assert.equal(report.contractVersion, 'bourbon-signal-source-usefulness-v1');
  assert.equal(report.rankingPolicy.alertGradeEvidenceAlwaysOutranksCatalogWatchOnly, true);
  assert.equal(report.lanes[0].sourceId, 'precision:aa');
  assert.equal(report.lanes[0].evidenceClass, 'fresh_exact_store_alert');
  assert.equal(report.lanes[0].metrics.freshExactStoreAlertCount, 1);
  assert.equal(report.lanes[0].metrics.uniqueMonitoredStoreCount, 1);
  assert.equal(report.lanes[0].metrics.reliabilityRatio, 0.8);
  assert.equal(report.lanes[0].metrics.roadblockBurden, 1);
  assert.equal(report.lanes[0].metrics.averageRuntimeMs, 120_000);

  const broadCatalog = report.lanes.find((lane) => lane.sourceId === 'bb:catalog');
  assert.ok(broadCatalog);
  assert.equal(broadCatalog.evidenceClass, 'catalog_watch_only');
  assert.ok(broadCatalog.metrics.catalogWatchOnlySignalCount >= 500);
  assert.ok(report.lanes[0].score > broadCatalog.score);
});

test('reliability, roadblock burden, and runtime cost break ties between alert-grade lanes', () => {
  const lean = sourceReport({
    state: 'CC',
    sourceId: 'cc:lean',
    sourceLabel: 'CC lean inventory',
    sourceUrl: 'https://cc.example.test/lean',
    signals: [{
      id: 'lean-signal',
      eventType: 'store_inventory_result',
      locationPrecision: 'store_level',
      storeId: 'cc-1',
      canonicalBottleId: 'bottle',
      canAlertAsInventory: true,
    }],
  });
  const burdened = sourceReport({
    state: 'DD',
    sourceId: 'dd:burdened',
    sourceLabel: 'DD burdened inventory',
    sourceUrl: 'https://dd.example.test/burdened',
    signals: [{
      id: 'burdened-signal',
      eventType: 'store_inventory_result',
      locationPrecision: 'store_level',
      storeId: 'dd-1',
      canonicalBottleId: 'bottle',
      canAlertAsInventory: true,
    }],
    roadblocks: [
      { status: 503, error: 'upstream failed' },
      { status: 403, error: 'source blocked by access denial' },
    ],
  });
  const report = buildSourceUsefulnessReport({
    stateReports: [burdened, lean],
    customerAlerts: [
      siteAlert({ state: 'CC', source: 'CC lean inventory', sourceUrl: 'https://cc.example.test/lean', storeId: 'cc-1' }),
      siteAlert({ state: 'DD', source: 'DD burdened inventory', sourceUrl: 'https://dd.example.test/burdened', storeId: 'dd-1' }),
    ],
    sourceRunHistory: {
      observations: [
        { sourceId: 'cc:lean', observedAt: GENERATED_AT, outcome: 'success', runtimeMs: 1_000 },
        { sourceId: 'dd:burdened', observedAt: GENERATED_AT, outcome: 'failed', runtimeMs: 64_000 },
      ],
    },
    sourceSlo: {
      sources: [
        { sourceId: 'cc:lean', observedSampleCount: 20, successfulSampleCount: 20, availabilityRatio: 1 },
        { sourceId: 'dd:burdened', observedSampleCount: 20, successfulSampleCount: 10, availabilityRatio: 0.5 },
      ],
    },
    stateRunMetrics: {
      CC: { probes: 20, usefulChanges: 10, failures: 0, lastRuntimeMs: 1_000 },
      DD: { probes: 20, usefulChanges: 10, failures: 5, lastRuntimeMs: 64_000 },
    },
    generatedAt: GENERATED_AT,
  });

  const leanLane = report.lanes.find((lane) => lane.sourceId === 'cc:lean');
  const burdenedLane = report.lanes.find((lane) => lane.sourceId === 'dd:burdened');
  assert.ok(leanLane.score > burdenedLane.score);
  assert.equal(leanLane.metrics.stateUsefulChangeRatio, 0.5);
  assert.equal(burdenedLane.metrics.roadblockBurden, 3);
  assert.ok(burdenedLane.components.runtimeCostPenalty > leanLane.components.runtimeCostPenalty);
  assert.ok(burdenedLane.components.reliabilityValue < leanLane.components.reliabilityValue);
});

test('ranking is deterministic and stale or ineligible store rows are not alert-grade evidence', () => {
  const reportInput = {
    stateReports: [
      sourceReport({
        state: 'EE',
        sourceId: 'ee:watch',
        sourceLabel: 'EE watch lane',
        sourceUrl: 'https://ee.example.test/watch',
        signals: [{
          id: 'watch',
          eventType: 'allocated_release_signal',
          locationPrecision: 'board_county',
          canonicalBottleId: 'watch-bottle',
          canAlertAsWatch: true,
        }],
      }),
      sourceReport({
        state: 'FF',
        sourceId: 'ff:stale',
        sourceLabel: 'FF stale store lane',
        sourceUrl: 'https://ff.example.test/store',
        signals: [{
          id: 'stale',
          eventType: 'store_inventory_result',
          locationPrecision: 'store_level',
          storeId: 'ff-1',
          canonicalBottleId: 'stale-bottle',
          canAlertAsInventory: false,
          stale: true,
        }],
      }),
    ],
    customerAlerts: [
      siteAlert({
        state: 'FF',
        source: 'FF stale store lane',
        sourceUrl: 'https://ff.example.test/store',
        storeId: 'ff-1',
        freshnessHours: 48,
      }),
      siteAlert({
        state: 'EE',
        source: 'EE watch lane',
        sourceUrl: 'https://ee.example.test/watch',
        storeId: 'ee-1',
        eligibleForDelivery: false,
      }),
    ],
    generatedAt: GENERATED_AT,
  };
  const first = buildSourceUsefulnessReport(reportInput);
  const second = buildSourceUsefulnessReport({
    ...reportInput,
    stateReports: [...reportInput.stateReports].reverse(),
    customerAlerts: [...reportInput.customerAlerts].reverse(),
  });

  assert.deepEqual(second, first);
  assert.equal(first.summary.freshExactStoreAlertLaneCount, 0);
  assert.equal(first.lanes.every((lane) => lane.evidenceClass !== 'fresh_exact_store_alert'), true);
  assert.match(sourceUsefulnessMarkdown(first), /diagnostic only; never an alert activation or release gate/i);
});

test('customer-facing source aliases join back to runtime lanes and skipped checks add no runtime cost', () => {
  const report = buildSourceUsefulnessReport({
    stateReports: [{
      state: 'GG',
      status: 'useful',
      sources: [{
        sourceRuntimeId: 'precision:gg',
        label: 'GG precision runtime',
        url: 'https://gg.example.test/',
        ok: true,
      }],
      sourceResults: [{
        sourceId: 'precision:gg',
        sourceLabel: 'GG precision runtime',
        sourceUrl: 'https://gg.example.test/',
        status: 'success',
        attemptCount: 1,
        startedAt: '2026-07-24T15:59:59.000Z',
        finishedAt: GENERATED_AT,
      }],
      signals: [{
        id: 'gg-store-row',
        state: 'GG',
        sourceRuntimeId: 'precision:gg',
        sourceLabel: 'GG exact inventory API',
        sourceUrl: 'https://api.gg.example.test/inventory',
        eventType: 'store_inventory_result',
        locationPrecision: 'store_level',
        storeId: 'gg-1',
        canonicalBottleId: 'bottle',
        canAlertAsInventory: true,
        observedAt: '2026-07-24T15:00:00.000Z',
      }],
      roadblocks: [],
    }],
    customerAlerts: [siteAlert({
      state: 'GG',
      source: 'GG exact inventory API',
      sourceUrl: 'https://api.gg.example.test/inventory',
      storeId: 'gg-1',
    })],
    sourceRunHistory: {
      observations: [
        { sourceId: 'precision:gg', observedAt: '2026-07-24T15:00:00.000Z', outcome: 'success', attemptCount: 1, runtimeMs: 1_000 },
        { sourceId: 'precision:gg', observedAt: GENERATED_AT, outcome: 'not_due', attemptCount: 0, runtimeMs: 0 },
      ],
    },
    generatedAt: GENERATED_AT,
  });

  assert.equal(report.lanes.length, 1);
  assert.equal(report.lanes[0].sourceId, 'precision:gg');
  assert.equal(report.lanes[0].metrics.freshExactStoreAlertCount, 1);
  assert.equal(report.lanes[0].metrics.runtimeSampleCount, 1);
  assert.equal(report.lanes[0].metrics.averageRuntimeMs, 1_000);
});

test('missing reliability measurements remain unavailable instead of becoming fabricated zero or success', () => {
  const report = buildSourceUsefulnessReport({
    stateReports: [{
      state: 'HH',
      sourceResults: [{ sourceId: 'precision:hh', sourceLabel: 'HH precision', status: 'not_due', attemptCount: 0 }],
      sources: [],
      signals: [],
      roadblocks: [],
    }],
    sourceSlo: { sources: [{ sourceId: 'precision:hh', observedSampleCount: 0, availabilityRatio: null }] },
    generatedAt: GENERATED_AT,
  });
  assert.equal(report.lanes[0].metrics.reliabilityRatio, null);
  assert.equal(report.lanes[0].metrics.reliabilitySampleCount, 0);
  assert.equal(report.lanes[0].metrics.reliabilitySource, 'unavailable');
});

test('legacy precision lanes with multiple retailer labels are explicitly identified as aggregated', () => {
  const report = buildSourceUsefulnessReport({
    stateReports: [{
      state: 'GA',
      sourceResults: [{ sourceId: 'precision:ga', sourceLabel: 'Georgia precision', status: 'success' }],
      sources: [],
      signals: [
        { id: 'a', state: 'GA', sourceRuntimeId: 'precision:ga', sourceLabel: 'A Retailer', eventType: 'store_inventory_result', locationPrecision: 'store_level', storeId: 'a', canonicalId: 'bottle-a', canAlertAsInventory: true },
        { id: 'b', state: 'GA', sourceRuntimeId: 'precision:ga', sourceLabel: 'B Retailer', eventType: 'store_inventory_result', locationPrecision: 'store_level', storeId: 'b', canonicalId: 'bottle-b', canAlertAsInventory: true },
      ],
      roadblocks: [],
    }],
    generatedAt: GENERATED_AT,
  });
  assert.equal(report.lanes.length, 1);
  assert.equal(report.lanes[0].aggregatedLegacyLane, true);
  assert.equal(report.lanes[0].sourceLabel, 'GA aggregated precision lane');
  assert.deepEqual(report.lanes[0].sourceLabels, ['A Retailer', 'B Retailer', 'Georgia precision']);
});
