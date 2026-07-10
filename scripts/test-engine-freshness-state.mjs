import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyFreshnessState } from '../engine/src/operations/freshness-state.mjs';

const now = Date.parse('2026-07-10T14:00:00.000Z');
const isoAgo = (minutes) => new Date(now - minutes * 60_000).toISOString();

test('healthy pipeline requires recent collection, export, upload, activation, and observation', () => {
  const result = classifyFreshnessState({ now, collectionFinishedAt: isoAgo(20), exportGeneratedAt: isoAgo(18), snapshotUploadedAt: isoAgo(17), snapshotActivatedAt: isoAgo(16), productionObservedAt: isoAgo(1) });
  assert.equal(result.freshnessStage, 'healthy');
  assert.equal(result.recoveryAction, 'none');
  assert.equal(result.ok, true);
});

test('fresh local export with stale production repairs publication without collection', () => {
  const result = classifyFreshnessState({ now, collectionFinishedAt: isoAgo(25), exportGeneratedAt: isoAgo(20), snapshotUploadedAt: isoAgo(190), snapshotActivatedAt: isoAgo(185), productionObservedAt: isoAgo(180) });
  assert.equal(result.freshnessStage, 'publisher_delay');
  assert.equal(result.recoveryAction, 'publish_and_activate_existing_export');
});

test('uploaded snapshot with stale activation retries only atomic pointer activation', () => {
  const result = classifyFreshnessState({ now, collectionFinishedAt: isoAgo(25), exportGeneratedAt: isoAgo(20), snapshotUploadedAt: isoAgo(10), snapshotActivatedAt: isoAgo(180), productionObservedAt: isoAgo(175) });
  assert.equal(result.freshnessStage, 'activation_delay');
  assert.equal(result.recoveryAction, 'retry_snapshot_activation');
});

test('stale collection triggers one guarded refresh', () => {
  const result = classifyFreshnessState({ now, collectionFinishedAt: isoAgo(181), exportGeneratedAt: isoAgo(180), snapshotUploadedAt: isoAgo(179), snapshotActivatedAt: isoAgo(178), productionObservedAt: isoAgo(177) });
  assert.equal(result.freshnessStage, 'collector_delay');
  assert.equal(result.recoveryAction, 'trigger_guarded_refresh');
});

test('fresh active snapshot not observed by production identifies reader delay', () => {
  const result = classifyFreshnessState({ now, collectionFinishedAt: isoAgo(25), exportGeneratedAt: isoAgo(20), snapshotUploadedAt: isoAgo(10), snapshotActivatedAt: isoAgo(9), productionObservedAt: isoAgo(190) });
  assert.equal(result.freshnessStage, 'production_reader_delay');
  assert.equal(result.recoveryAction, 'verify_production_reader');
});
