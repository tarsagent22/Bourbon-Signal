import test from 'node:test';
import assert from 'node:assert/strict';

import { confidenceForSignal } from '../src/confidence-policy.mjs';

test('NC board shipment signals remain informational and cannot create watch alerts', () => {
  const result = confidenceForSignal({
    state: 'NC',
    eventType: 'nc_board_shipment_snapshot',
    locationPrecision: 'board_county',
    quantity: 12,
    confidence: 0.82,
  });

  assert.equal(result.canAlertAsInventory, false);
  assert.equal(result.canAlertAsWatch, false);
  assert.match(result.inventorySemantics, /board-level shipment/i);
});