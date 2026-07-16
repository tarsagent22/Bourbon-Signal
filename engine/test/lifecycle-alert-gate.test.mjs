import test from 'node:test';
import assert from 'node:assert/strict';
import { lifecycleAllowsInventoryAlert, lifecycleAllowsWatchAlert } from '../src/state-lifecycle.mjs';

test('state lifecycle is the final authority for inventory and watch alert eligibility', () => {
  assert.equal(lifecycleAllowsInventoryAlert('UT'), false);
  assert.equal(lifecycleAllowsWatchAlert('UT'), false);
  assert.equal(lifecycleAllowsInventoryAlert('AZ'), true);
  assert.equal(lifecycleAllowsWatchAlert('AZ'), true);
  assert.equal(lifecycleAllowsInventoryAlert('ZZ'), false, 'unknown states fail closed');
  assert.equal(lifecycleAllowsWatchAlert('ZZ'), false, 'unknown states fail closed');
});
