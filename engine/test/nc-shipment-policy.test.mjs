import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { confidenceForSignal } from '../src/confidence-policy.mjs';
import { applyNcBoardShipmentPolicy } from '../src/collectors/north-carolina-intelligence.mjs';
import { isRetainedNotDueReport } from '../src/collectors/generic-state.mjs';
import { hasHealthyLowerVolumeShipmentRun, hasSafeScheduledPartialShipmentFallback } from '../src/nc-coverage-summary.mjs';
import { bibleLookup, buildDrops } from '../src/export-site-contract.mjs';

test('NC board shipment signals remain informational and cannot create watch alerts', () => {
  const result = confidenceForSignal({
    state: 'NC',
    eventType: 'nc_board_shipment_snapshot',
    locationPrecision: 'board_county',
    quantity: 12,
    confidence: 0.82,
  });

  assert.equal(result.confidence, 0.9);
  assert.equal(result.policyMode, 'alert_county_store_inventory');
  assert.equal(result.canAlertAsInventory, false);
  assert.equal(result.canAlertAsWatch, false);
  assert.match(result.inventorySemantics, /board-level shipment/i);
});

test('NC shipment collector persists the same non-alerting board-level semantics', () => {
  const signal = applyNcBoardShipmentPolicy({
    eventType: 'nc_board_shipment_snapshot',
    locationPrecision: 'board_county',
    confidence: 0.82,
    raw: { NUMUNITS: 12 },
  });
  assert.equal(signal.confidence, 0.9);
  assert.equal(signal.policyMode, 'alert_county_store_inventory');
  assert.equal(signal.canAlertAsInventory, false);
  assert.equal(signal.canAlertAsWatch, false);
  assert.equal(signal.raw.policyMode, 'alert_county_store_inventory');
  assert.equal(signal.raw.shipmentScope, 'board_level_not_store_inventory');
  assert.match(signal.inventorySemantics, /board-level shipment/i);
});

test('all six fresh Triad board shipments become explicit Drop Feed cards without outbound eligibility', () => {
  const observedAt = '2026-08-12T15:04:19.000Z';
  const expected = [
    ['ac6335835df0fe4b', 'Old Fitzgerald BIB 10Y Spring 26 Decanter .75L', 30, '17286'],
    ['e8f2cf5f49bfc3a0', 'Four Roses Single Barrel OESQ .75L', 132, '17479'],
    ['42d052354ece31cf', "Old Forester President's Choice 700ML", 24, '17764'],
    ['ce64ebf6c9c88241', 'Buffalo Trace KY Straight Bourbon 1.00L', 480, '18366'],
    ['f6ffcaca4330372e', 'E.H. Taylor Jr. Small Batch .75L', 42, '20581'],
    ['c8439852697843ad', 'Buffalo Trace KY Straight Bourbon .75L', 480, '20611'],
  ];
  const seed = JSON.parse(readFileSync(new URL('../data/bourbon-bible-seed.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
  const additions = JSON.parse(readFileSync(new URL('../data/bourbon-bible-additions.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
  const records = [...seed.families, ...additions.families].map((family, index) => ({ id: `test-bible-${index}`, ...family }));
  const bible = bibleLookup(records);
  const signals = expected.map(([id, name, quantity, ncCode]) => applyNcBoardShipmentPolicy({
    id,
    state: 'NC',
    eventType: 'nc_board_shipment_snapshot',
    rawName: name,
    canonicalName: name,
    ncCode,
    locationPrecision: 'board_county',
    locationName: 'Triad Municipal ABC Board',
    county: 'Guilford',
    quantity,
    observedAt,
    sourceEventAt: observedAt,
    fetchedAt: observedAt,
    sourceLabel: 'NC ABC Stock Shipped Data',
    sourceUrl: 'https://abc2.nc.gov/Search/StockShippedData',
    raw: { NUMUNITS: quantity },
  }));

  const drops = buildDrops(signals, bible, signals);
  assert.equal(drops.length, 6, 'every exact August 12 Triad shipment must map through the checked-in Bourbon Bible');
  assert.deepEqual(new Set(drops.map((drop) => drop.id)), new Set(expected.map(([id]) => id)));
  for (const drop of drops) {
    assert.equal(drop.eligibleForOnSite, true);
    assert.equal(drop.eligibleForDropFeed, true);
    assert.equal(drop.eligibleForWatch, false);
    assert.equal(drop.canAlertAsInventory, false);
    assert.equal(drop.canAlertAsWatch, false);
    assert.equal(drop.eligibleForDelivery, false);
    assert.equal(drop.eligibleForEmail, false);
    assert.equal(drop.eligibleForSms, false);
    assert.equal(drop.availabilityScope, 'board');
    assert.equal(drop.locationPrecision, 'board_county');
    assert.ok(drop.boardShipmentQuantity > 0);
    assert.match(drop.inventorySemantics, /board-level shipment/i);
    assert.match(drop.inventoryCaveat, /does not prove an exact store/i);
  }

  assert.deepEqual(buildDrops([{ ...signals[0], id: 'zero', quantity: 0, raw: { ...signals[0].raw, NUMUNITS: 0 } }], bible, []), []);
  assert.deepEqual(buildDrops([{ ...signals[0], id: 'unknown', rawName: 'Unrecognized Bourbon', canonicalName: 'Unrecognized Bourbon' }], bible, []), []);
});

test('retained not-due source results remain useful instead of becoming blocked', () => {
  assert.equal(isRetainedNotDueReport([{ status: 'not_due' }, { status: 'not_due' }], [{ id: 'cached' }]), true);
  assert.equal(isRetainedNotDueReport([{ status: 'failure' }], [{ id: 'cached' }]), false);
  assert.equal(isRetainedNotDueReport([{ status: 'not_due' }], []), false);
});

test('NC lower-volume shipment verification follows current official source breadth and quality', () => {
  const now = Date.parse('2026-08-03T01:00:00.000Z');
  const healthy = {
    stockShipped: {
      sourceUrl: 'https://abc2.nc.gov/Search/StockShippedData',
      observedAt: '2026-08-02T15:04:18.000Z',
      boardCount: 174,
      productCount: 2675,
      recordCount: 66723,
      trackedSignalCount: 282,
      controlledDistributionSignalCount: 136,
      priceEnrichedSignalCount: 282,
    },
    coverage: { withTrackedShipments: 103 },
    roadblockCount: 1,
  };

  assert.equal(hasHealthyLowerVolumeShipmentRun(healthy, 282, now), true);
  assert.equal(hasHealthyLowerVolumeShipmentRun(healthy, 249, now), false);
  assert.equal(hasHealthyLowerVolumeShipmentRun({ ...healthy, roadblockCount: 5 }, 282, now), true, 'isolated source failures stay within the verifier ceiling');
  assert.equal(hasHealthyLowerVolumeShipmentRun({ ...healthy, roadblockCount: 6 }, 282, now), false, 'the shared verifier ceiling still fails closed');
  assert.equal(hasHealthyLowerVolumeShipmentRun({ ...healthy, stockShipped: { ...healthy.stockShipped, observedAt: '2026-07-30T12:00:00.000Z' } }, 282, now), false);
  assert.equal(hasHealthyLowerVolumeShipmentRun({ ...healthy, stockShipped: { ...healthy.stockShipped, sourceUrl: 'https://example.com/shipment.csv' } }, 282, now), false);
  assert.equal(hasHealthyLowerVolumeShipmentRun({ ...healthy, stockShipped: { ...healthy.stockShipped, priceEnrichedSignalCount: 100 } }, 282, now), false);
});

test('NC scheduled partial fallback accepts a current official volume dip only with fully non-alerting retained context', () => {
  const now = Date.parse('2026-08-05T12:57:31.000Z');
  const nc = {
    stockShipped: {
      sourceUrl: 'https://abc2.nc.gov/Search/StockShippedData',
      observedAt: '2026-08-04T15:04:18.000Z',
      boardCount: 174,
      productCount: 2673,
      recordCount: 65765,
      trackedSignalCount: 237,
      controlledDistributionSignalCount: 107,
      priceEnrichedSignalCount: 237,
    },
    coverage: { boardCount: 174, withTrackedShipments: 95 },
    roadblockCount: 0,
  };
  const current = { id: 'current', sourceStale: false, stale: false, raw: {} };
  const retained = {
    id: 'retained',
    sourceStale: true,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    alertable: false,
    sourceAvailabilityVerified: false,
  };
  const report = { status: 'partial_useful_quality_fallback', partial: true, stale: false, signals: [current, retained] };

  assert.equal(hasSafeScheduledPartialShipmentFallback(nc, report, 237, now), true);
  assert.equal(hasSafeScheduledPartialShipmentFallback({ ...nc, roadblockCount: 5 }, report, 237, now), true, 'partial fallback uses the same isolated-roadblock ceiling');
  assert.equal(hasSafeScheduledPartialShipmentFallback({ ...nc, roadblockCount: 6 }, report, 237, now), false, 'partial fallback rejects excessive roadblocks');
  assert.equal(hasHealthyLowerVolumeShipmentRun(nc, 237, now), false, 'strict lower-volume recovery remains blocked');
  assert.equal(hasSafeScheduledPartialShipmentFallback({ ...nc, coverage: { ...nc.coverage, withTrackedShipments: 80 } }, report, 237, now), false);
  assert.equal(hasSafeScheduledPartialShipmentFallback(nc, { ...report, stale: true }, 237, now), false);
  assert.equal(hasSafeScheduledPartialShipmentFallback(nc, { ...report, signals: [current, { ...retained, canAlertAsInventory: true }] }, 237, now), false);
  assert.equal(hasSafeScheduledPartialShipmentFallback(nc, { ...report, signals: [retained] }, 237, now), false);
});

test('all NC release gates use the shared source-backed lower-volume policy', () => {
  for (const sourcePath of ['../src/verify-nc.mjs', '../src/verify.mjs', '../src/quality-audit.mjs']) {
    const source = readFileSync(new URL(sourcePath, import.meta.url), 'utf8');
    assert.match(source, /import \{[^}]*hasHealthyLowerVolumeShipmentRun[^}]*\} from '\.\/nc-coverage-summary\.mjs';/);
    assert.match(source, /hasHealthyLowerVolumeShipmentRun\(/);
    assert.doesNotMatch(source, /function hasHealthyLowerVolumeNcShipmentRun/);
  }
});
