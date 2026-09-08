import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { isSouthCarolinaQuarantinedBaselinePreserved } from '../src/south-carolina-retailer-policy.mjs';
const capture = JSON.parse(readFileSync(new URL('./fixtures/sc/all-american-location-live.json', import.meta.url), 'utf8'));
const baseline = { storeId: capture.storeId, storeName: capture.storeName, storeAddress: capture.storeAddress };
const current = () => ({ ...structuredClone(capture), observedAt: new Date().toISOString() });
test('preview-source quarantine retains the pinned exact location without inventing stock', () => {
  assert.equal(isSouthCarolinaQuarantinedBaselinePreserved(baseline, [current()]), true);
});
test('quarantine is not a generic missing-store, stale-location, or inventory bypass', () => {
  assert.equal(isSouthCarolinaQuarantinedBaselinePreserved(baseline, []), false);
  assert.equal(isSouthCarolinaQuarantinedBaselinePreserved({ ...baseline, storeId: 'other' }, [current()]), false);
  for (const overrides of [
    { canAlertAsInventory: true }, { canAlertAsWatch: true }, { sourceAvailabilityVerified: true },
    { storeAddress: 'different premise' }, { observedAt: '2020-01-01T00:00:00Z' },
    { eventType: 'retailer_store_inventory_result' },
  ]) assert.equal(isSouthCarolinaQuarantinedBaselinePreserved(baseline, [{ ...current(), ...overrides }]), false);
  assert.equal(isSouthCarolinaQuarantinedBaselinePreserved(baseline, [current(), current()]), false);
  assert.equal(isSouthCarolinaQuarantinedBaselinePreserved(baseline, [current(), { ...current(), eventType: 'retailer_store_inventory_result', canAlertAsInventory: true }]), false);
});
