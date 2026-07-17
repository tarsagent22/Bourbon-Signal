import test from 'node:test';
import assert from 'node:assert/strict';
import { lifecycleAllowsInventoryAlert, lifecycleAllowsWatchAlert } from '../src/state-lifecycle.mjs';
import { verifyStateExportIntegrity } from '../src/verify-state-integration.mjs';

test('state lifecycle is the final authority for inventory and watch alert eligibility', () => {
  assert.equal(lifecycleAllowsInventoryAlert('UT'), false);
  assert.equal(lifecycleAllowsWatchAlert('UT'), false);
  assert.equal(lifecycleAllowsInventoryAlert('AZ'), true);
  assert.equal(lifecycleAllowsWatchAlert('AZ'), true);
  assert.equal(lifecycleAllowsInventoryAlert('ZZ'), false);
  assert.equal(lifecycleAllowsWatchAlert('ZZ'), false);
});

test('integration verifier rejects every delivery event when lifecycle denies both channels', () => {
  const result = verifyStateExportIntegrity({
    state: 'UT', lifecycle: { inventoryAlertable: false, watchAlertable: false, coverageTier: 'aggregate_inventory_watch' },
    stateDrops: { count: 0, drops: [] }, drops: { drops: [] },
    alerts: { alerts: [{ state: 'UT', eligibleForDelivery: true, eventType: 'future_unclassified_event' }] },
  });
  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /lifecycle-denied/i);
});
