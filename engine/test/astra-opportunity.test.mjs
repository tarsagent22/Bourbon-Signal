import test from 'node:test';
import assert from 'node:assert/strict';
import * as exporter from '../src/export-site-contract.mjs';
const nowMs = Date.now();
const observedAt = new Date(nowMs - 30 * 60_000).toISOString();
const drop = { id: 'va', state: 'VA', canonicalId: 'bottle', bottleName: 'Fixture', storeId: 'va-store', locationPrecision: 'store_level', quantity: 1, canAlertAsInventory: true, tier: 'allocated', observedAt, availabilityEpisodeId: 'episode-one' };
const [opportunity] = exporter.buildCurrentInventoryAlertsFromDrops([drop]);
function merge(overrides = {}) {
  assert.equal(typeof exporter.preservePartialRefreshOpportunities, 'function', 'export must preserve unconsumed opportunities');
  return exporter.preservePartialRefreshOpportunities({ previousCandidates: [opportunity], currentCandidates: [], currentDrops: [drop], partialRefresh: true, attemptedStateIds: ['TX'], nowMs, ...overrides });
}
test('E11 TX-only publication keeps a still-fresh VA opportunity with original identity and age', () => {
  const [kept] = merge();
  assert.equal(kept.dedupeKey, opportunity.dedupeKey);
  assert.equal(kept.signalAt, observedAt);
  assert.equal(kept.eligibleForEmail, opportunity.eligibleForEmail);
  assert.equal(merge({ previousCandidates: [kept, kept], currentCandidates: [opportunity] }).length, 1);
});
test('E11 expired, future, invalidated, fallback and changed-episode opportunities are never rescued', () => {
  assert.equal(merge({ nowMs: nowMs + 2 * 3_600_000 }).length, 0);
  assert.equal(merge({ previousCandidates: [{ ...opportunity, signalAt: new Date(nowMs + 60_000).toISOString() }] }).length, 0);
  assert.equal(merge({ attemptedStateIds: ['VA'] }).length, 0);
  assert.equal(merge({ partialRefresh: false }).length, 0);
  for (const change of [{ quantity: 0 }, { stale: true }, { sourceStale: true }, { canAlertAsInventory: false }, { availabilityEpisodeId: 'different' }]) {
    assert.equal(merge({ currentDrops: [{ ...drop, ...change }] }).length, 0, JSON.stringify(change));
  }
  assert.equal(merge({ currentDrops: [] }).length, 0);
});
test('E11 actual site alerts envelope is accepted across a partial publication', () => {
  assert.equal(merge({ previousCandidates: { contractVersion: 'bourbon-signal-site-v0.1', alerts: [opportunity] } }).length, 1);
});
test('E11 carried opportunity cannot gain channels or refresh its timestamp from reconfirmation', () => {
  const original = { ...opportunity, eligibleForEmail: false, eligibleForSms: false };
  const [kept] = merge({ previousCandidates: [original], currentDrops: [{ ...drop, observedAt: new Date(nowMs).toISOString() }] });
  assert.equal(kept.signalAt, observedAt);
  assert.equal(kept.eligibleForEmail, false);
  assert.equal(kept.eligibleForSms, false);
});
