import assert from 'node:assert/strict';
import test from 'node:test';
import { detectDropCollapseFallbacks, mergeHistoricalBoardShipmentDrops, mergePartialRefreshDrops, mergePartialRefreshLocations, selectFreshRunDrops } from '../src/partial-refresh-contract.mjs';

test('drop collapse detection marks attempted states for safe publication fallback', () => {
  const previous = { states: [{ state: 'IN', input: { dropCount: 72 } }, { state: 'TN', input: { dropCount: 35 } }] };
  const current = [
    ...Array.from({ length: 7 }, (_, index) => ({ id: `in-${index}`, state: 'IN' })),
    ...Array.from({ length: 35 }, (_, index) => ({ id: `tn-${index}`, state: 'TN' })),
  ];
  assert.deepEqual(detectDropCollapseFallbacks(previous, current, ['IN', 'TN']), ['IN']);
});

test('partial refresh preserves untouched location coverage while current attempted-state rows win', () => {
  const merged = mergePartialRefreshLocations({
    previousLocations: {
      locations: [
        { id: 'nc-board', state: 'NC', name: 'Dunn ABC Board', signalCount: 6 },
        { id: 'ga-store', state: 'GA', name: 'Old Georgia Store', signalCount: 1 },
        { id: 'md-store', state: 'MD-MONTGOMERY', name: 'Montgomery ABS', signalCount: 2 },
      ],
    },
    currentLocations: [
      { id: 'ga-store', state: 'GA', name: 'Current Georgia Store', signalCount: 3 },
      { id: 'nc-scaffold', state: 'NC', name: 'Harnett County ABC Board', signalCount: 0 },
    ],
    partialRefresh: true,
    attemptedStateIds: ['GA'],
  });
  assert.deepEqual(merged.map((location) => location.id), ['ga-store', 'nc-board', 'md-store', 'nc-scaffold']);
  assert.equal(merged.find((location) => location.id === 'ga-store')?.name, 'Current Georgia Store');
});

test('full refresh never preserves prior locations', () => {
  assert.deepEqual(mergePartialRefreshLocations({
    previousLocations: [{ id: 'old-nc', state: 'NC' }],
    currentLocations: [{ id: 'current-ga', state: 'GA' }],
    partialRefresh: false,
    attemptedStateIds: ['GA'],
  }), [{ id: 'current-ga', state: 'GA' }]);
});

test('partial refresh replaces attempted states and preserves untouched published drops', () => {
  const previousDrops = { drops: [
    { id: 'nc-old', state: 'NC' },
    { id: 'il-old', state: 'IL' },
    { id: 'tn-old', state: 'TN' },
  ] };
  const currentDrops = [
    { id: 'nc-new', state: 'NC' },
    { id: 'az-new', state: 'AZ' },
  ];
  const merged = mergePartialRefreshDrops({
    previousDrops,
    currentDrops,
    partialRefresh: true,
    attemptedStateIds: ['NC', 'AZ'],
  });
  assert.deepEqual(merged.map((drop) => drop.id), ['nc-new', 'az-new', 'il-old', 'tn-old']);
});

test('attempted fallback states retain their last published drops', () => {
  const merged = mergePartialRefreshDrops({
    previousDrops: { drops: [{ id: 'tn-old', state: 'TN' }, { id: 'il-old', state: 'IL' }] },
    currentDrops: [{ id: 'tn-collapsed', state: 'TN' }],
    partialRefresh: true,
    attemptedStateIds: ['TN'],
    fallbackStateIds: ['TN'],
  });
  assert.deepEqual(merged.map((drop) => drop.id), ['tn-old', 'il-old']);
  const fallback = merged.find((drop) => drop.id === 'tn-old');
  assert.equal(fallback.stale, true);
  assert.equal(fallback.sourceStale, true);
  assert.equal(fallback.alertable, false);
  assert.equal(fallback.canAlertAsInventory, false);
  assert.equal(fallback.canAlertAsWatch, false);
});

test('retained Georgia customer rows preserve explicit last-known evidence while becoming non-alerting', () => {
  const merged = mergePartialRefreshDrops({
    previousDrops: [{
      id: 'ga-live', state: 'GA', availabilityStatus: 'in_stock', availabilityLabel: 'Available',
      sourceAvailabilityVerified: true, canAlertAsInventory: true, canAlertAsWatch: true, alertable: true,
      raw: { merchantId: 'fixture-merchant' },
    }],
    currentDrops: [],
    partialRefresh: true,
    attemptedStateIds: ['GA'],
    fallbackStateIds: ['GA'],
  });
  assert.equal(merged.length, 1);
  const retained = merged[0];
  assert.equal(retained.availabilityStatus, 'stale');
  assert.equal(retained.sourceAvailabilityVerified, false);
  assert.equal(retained.raw.lastKnownAvailabilityStatus, 'in_stock');
  assert.equal(retained.raw.lastKnownSourceAvailabilityVerified, true);
  assert.equal(retained.raw.sourceAvailabilityVerified, false);
  assert.equal(retained.raw.staleFallback, true);
  assert.equal(retained.raw.sourceRuntimeNonAlertable, true);
  assert.equal(retained.canAlertAsInventory, false);
  assert.equal(retained.canAlertAsWatch, false);
  assert.equal(retained.alertable, false);
  assert.match(retained.staleSourceCaveat, /last-known source evidence/i);
});

test('partial evidence fallback publishes fresh rows and retains only missing prior rows as stale context', () => {
  const merged = mergePartialRefreshDrops({
    previousDrops: {
      drops: [
        { id: 'tn-same', state: 'TN', canAlertAsInventory: true },
        { id: 'tn-old-only', state: 'TN', canAlertAsInventory: true },
        { id: 'tn-unsafe', state: 'TN', canAlertAsInventory: true },
        { id: 'il-old', state: 'IL', canAlertAsInventory: true },
      ],
    },
    currentDrops: [
      { id: 'tn-same', state: 'TN', canAlertAsInventory: true, observedAt: '2026-07-27T12:05:00.000Z' },
      { id: 'tn-new', state: 'TN', canAlertAsInventory: true, observedAt: '2026-07-27T12:06:00.000Z' },
    ],
    partialRefresh: true,
    attemptedStateIds: ['TN'],
    partialFallbackStateIds: ['TN'],
    isSafePartialRetainedRow: (drop) => drop.id !== 'tn-unsafe',
  });
  assert.deepEqual(merged.map((drop) => drop.id), ['tn-same', 'tn-new', 'tn-old-only', 'il-old']);
  assert.equal(merged[0].canAlertAsInventory, true);
  assert.equal(merged[1].canAlertAsInventory, true);
  assert.equal(merged[2].sourceStale, true);
  assert.equal(merged[2].canAlertAsInventory, false);
  assert.equal(merged[2].canAlertAsWatch, false);
  assert.equal(merged[2].staleReason, 'partial_evidence_fallback');
});

test('a fallback state with no prior customer rows may bootstrap only explicitly stale non-alerting context', () => {
  const safe = mergePartialRefreshDrops({
    previousDrops: [{ id: 'pa-old', state: 'PA' }],
    currentDrops: [{
      id: 'oh-stale', state: 'OH', sourceStale: true, stale: true,
      alertable: false, canAlertAsInventory: false, canAlertAsWatch: false,
      staleSourceCaveat: 'Verify with OHLQ before driving.',
    }],
    partialRefresh: true,
    attemptedStateIds: ['OH'],
    fallbackStateIds: ['OH'],
  });
  assert.deepEqual(safe.map((drop) => drop.id), ['oh-stale', 'pa-old']);

  const newerSafe = mergePartialRefreshDrops({
    previousDrops: [{
      id: 'oh-older-stale', state: 'OH', sourceStale: true, alertable: false,
      canAlertAsInventory: false, canAlertAsWatch: false, staleSourceCaveat: 'Old cached OHLQ row.',
      observedAt: '2026-07-21T12:00:00.000Z',
    }],
    currentDrops: [{
      id: 'oh-newer-stale', state: 'OH', sourceStale: true, alertable: false,
      canAlertAsInventory: false, canAlertAsWatch: false, staleSourceCaveat: 'Newer cached OHLQ row.',
      observedAt: '2026-07-22T12:00:00.000Z',
    }],
    partialRefresh: true,
    attemptedStateIds: ['OH'],
    fallbackStateIds: ['OH'],
  });
  assert.deepEqual(newerSafe.map((drop) => drop.id), ['oh-newer-stale']);

  const healthyPrior = mergePartialRefreshDrops({
    previousDrops: [{ id: 'oh-live', state: 'OH', sourceStale: false, canAlertAsInventory: true }],
    currentDrops: [{
      id: 'oh-newer-stale', state: 'OH', sourceStale: true, alertable: false,
      canAlertAsInventory: false, canAlertAsWatch: false, staleSourceCaveat: 'Newer cached OHLQ row.',
      observedAt: '2026-07-22T12:00:00.000Z',
    }],
    partialRefresh: true,
    attemptedStateIds: ['OH'],
    fallbackStateIds: ['OH'],
  });
  assert.deepEqual(healthyPrior.map((drop) => drop.id), ['oh-live']);

  const unsafe = mergePartialRefreshDrops({
    previousDrops: [],
    currentDrops: [{ id: 'oh-unsafe', state: 'OH', sourceStale: true, alertable: true }],
    partialRefresh: true,
    attemptedStateIds: ['OH'],
    fallbackStateIds: ['OH'],
  });
  assert.deepEqual(unsafe, []);
});

test('full refresh never retains rows solely from the previous contract', () => {
  const merged = mergePartialRefreshDrops({
    previousDrops: [{ id: 'old', state: 'IL' }],
    currentDrops: [{ id: 'new', state: 'IL' }],
    partialRefresh: false,
    attemptedStateIds: ['IL'],
  });
  assert.deepEqual(merged, [{ id: 'new', state: 'IL' }]);
});

test('full refresh retains eligible NC board-shipment history from published and bootstrap contracts', () => {
  const merged = mergeHistoricalBoardShipmentDrops({
    currentDrops: [{
      id: 'wake-current', state: 'NC', type: 'nc_board_shipment_snapshot',
      locationName: 'Wake County ABC Board', sourceEventAt: '2026-08-02T12:00:00.000Z',
    }],
    previousDrops: { drops: [{
      id: 'dunn-july-12', state: 'NC', type: 'nc_board_shipment_snapshot',
      locationName: 'Dunn ABC Board', sourceEventAt: '2026-07-12T12:00:00.000Z',
      canAlertAsInventory: false, canAlertAsWatch: true, alertable: true,
    }] },
    bootstrapDrops: { drops: [{
      id: 'brunswick-july-12', state: 'NC', type: 'nc_board_shipment_snapshot',
      locationName: 'Brunswick County ABC Board', sourceEventAt: '2026-07-12T13:00:00.000Z',
      canAlertAsInventory: false, canAlertAsWatch: false,
    }] },
    now: '2026-08-03T12:00:00.000Z',
    historyDays: 30,
  });
  assert.deepEqual(merged.map((drop) => drop.id), ['wake-current', 'brunswick-july-12', 'dunn-july-12']);
  const retainedDunn = merged.find((drop) => drop.id === 'dunn-july-12');
  assert.equal(retainedDunn?.sourceStale, true);
  assert.equal(retainedDunn?.canAlertAsInventory, false);
  assert.equal(retainedDunn?.canAlertAsWatch, false);
  assert.equal(retainedDunn?.alertable, false);
  assert.equal(retainedDunn?.eligibleForDelivery, false);
  assert.equal(retainedDunn?.dataLane, 'informational');
  assert.equal(retainedDunn?.informationalOnly, true);
});

test('fresh-run provenance excludes cached rows from historical-current and alert inputs', () => {
  const cachedNc = {
    id: 'cached-nc', state: 'NC', type: 'nc_board_shipment_snapshot', observedAt: '2026-07-12T12:00:00.000Z',
    canAlertAsWatch: true, dataLane: 'actionable_watch',
  };
  const freshGa = {
    id: 'fresh-ga', state: 'GA', type: 'store_inventory_result', observedAt: '2026-08-03T11:00:00.000Z',
    canAlertAsInventory: true,
  };
  const freshMdScoped = {
    id: 'fresh-md', state: 'MD-MONTGOMERY', type: 'county_inventory_aggregate', observedAt: '2026-08-03T11:00:00.000Z',
    canAlertAsInventory: true,
  };
  assert.deepEqual(
    selectFreshRunDrops({ drops: [cachedNc, freshGa, freshMdScoped], freshStateIds: ['GA', 'MD-MONTGOMERY'] }),
    [freshGa, freshMdScoped],
  );
  assert.deepEqual(selectFreshRunDrops({ drops: [cachedNc], freshStateIds: undefined }), []);
});

test('historical retention sanitizes untouched partial-refresh shipment rows and expires old ones', () => {
  const merged = mergeHistoricalBoardShipmentDrops({
    currentDrops: [
      {
        id: 'ga-current', state: 'GA', type: 'store_inventory_result', observedAt: '2026-08-03T11:00:00.000Z',
        canAlertAsInventory: true,
      },
      {
        id: 'dunn-retained', state: 'NC', type: 'nc_board_shipment_snapshot', observedAt: '2026-07-12T12:00:00.000Z',
        canAlertAsWatch: true, dataLane: 'actionable_watch',
      },
      {
        id: 'expired-retained', state: 'NC', type: 'nc_board_shipment_snapshot', observedAt: '2026-06-01T12:00:00.000Z',
        canAlertAsWatch: true, dataLane: 'actionable_watch',
      },
    ],
    currentSourceDrops: [{ id: 'ga-current', state: 'GA', type: 'store_inventory_result' }],
    now: '2026-08-03T12:00:00.000Z',
    historyDays: 30,
  });
  assert.deepEqual(merged.map((drop) => drop.id), ['ga-current', 'dunn-retained']);
  const retainedDunn = merged.find((drop) => drop.id === 'dunn-retained');
  assert.equal(retainedDunn?.sourceStale, true);
  assert.equal(retainedDunn?.canAlertAsWatch, false);
  assert.equal(retainedDunn?.dataLane, 'informational');
});

test('genuinely current NC shipment rows remain current but informational and non-alertable', () => {
  const currentShipment = {
    id: 'wake-current', state: 'NC', type: 'nc_board_shipment_snapshot', observedAt: '2026-08-03T11:00:00.000Z',
    canAlertAsWatch: true, dataLane: 'actionable_watch',
  };
  const merged = mergeHistoricalBoardShipmentDrops({
    currentDrops: [currentShipment],
    currentSourceDrops: [currentShipment],
    now: '2026-08-03T12:00:00.000Z',
    historyDays: 30,
  });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].sourceStale, undefined);
  assert.equal(merged[0].canAlertAsWatch, false);
  assert.equal(merged[0].alertable, false);
  assert.equal(merged[0].dataLane, 'informational');
  assert.equal(merged[0].informationalOnly, true);
});

test('historical retention never revives inventory, expired shipments, or duplicate current rows', () => {
  const merged = mergeHistoricalBoardShipmentDrops({
    currentDrops: [{
      id: 'dunn-same', state: 'NC', type: 'nc_board_shipment_snapshot',
      locationName: 'Dunn ABC Board', sourceEventAt: '2026-08-02T12:00:00.000Z',
    }],
    previousDrops: { drops: [
      { id: 'dunn-same', state: 'NC', type: 'nc_board_shipment_snapshot', sourceEventAt: '2026-07-12T12:00:00.000Z' },
      { id: 'old-shipment', state: 'NC', type: 'nc_board_shipment_snapshot', sourceEventAt: '2026-06-01T12:00:00.000Z' },
      { id: 'old-inventory', state: 'NC', type: 'store_inventory_result', observedAt: '2026-07-12T12:00:00.000Z' },
      { id: 'other-state', state: 'VA', type: 'nc_board_shipment_snapshot', sourceEventAt: '2026-07-12T12:00:00.000Z' },
    ] },
    now: '2026-08-03T12:00:00.000Z',
    historyDays: 30,
  });
  assert.deepEqual(merged.map((drop) => drop.id), ['dunn-same']);
  assert.equal(merged[0].sourceEventAt, '2026-08-02T12:00:00.000Z');
});
