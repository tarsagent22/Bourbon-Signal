import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { confidenceForSignal } from '../src/confidence-policy.mjs';
import { applyNcBoardShipmentPolicy } from '../src/collectors/north-carolina-intelligence.mjs';
import { isRetainedNotDueReport } from '../src/collectors/generic-state.mjs';
import { hasHealthyLowerVolumeShipmentRun } from '../src/nc-coverage-summary.mjs';

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
  assert.equal(hasHealthyLowerVolumeShipmentRun({ ...healthy, roadblockCount: 2 }, 282, now), false);
  assert.equal(hasHealthyLowerVolumeShipmentRun({ ...healthy, stockShipped: { ...healthy.stockShipped, observedAt: '2026-07-30T12:00:00.000Z' } }, 282, now), false);
  assert.equal(hasHealthyLowerVolumeShipmentRun({ ...healthy, stockShipped: { ...healthy.stockShipped, sourceUrl: 'https://example.com/shipment.csv' } }, 282, now), false);
  assert.equal(hasHealthyLowerVolumeShipmentRun({ ...healthy, stockShipped: { ...healthy.stockShipped, priceEnrichedSignalCount: 100 } }, 282, now), false);
});

test('all NC release gates use the shared source-backed lower-volume policy', () => {
  for (const sourcePath of ['../src/verify-nc.mjs', '../src/verify.mjs', '../src/quality-audit.mjs']) {
    const source = readFileSync(new URL(sourcePath, import.meta.url), 'utf8');
    assert.match(source, /import \{ hasHealthyLowerVolumeShipmentRun \} from '\.\/nc-coverage-summary\.mjs';/);
    assert.match(source, /hasHealthyLowerVolumeShipmentRun\(/);
    assert.doesNotMatch(source, /function hasHealthyLowerVolumeNcShipmentRun/);
  }
});
