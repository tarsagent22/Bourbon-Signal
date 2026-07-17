import test from 'node:test';
import assert from 'node:assert/strict';

import { confidenceForSignal } from '../src/confidence-policy.mjs';
import { applyNcBoardShipmentPolicy } from '../src/collectors/north-carolina-intelligence.mjs';
import { isRetainedNotDueReport } from '../src/collectors/generic-state.mjs';

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