import assert from 'node:assert/strict';
import test from 'node:test';

import { executeFreshnessRecovery } from './engine-freshness-watchdog.mjs';

const now = Date.parse('2026-07-10T14:00:00.000Z');
const ago = (minutes) => new Date(now - minutes * 60_000).toISOString();

function base(overrides = {}) {
  return { now, collectionFinishedAt: ago(25), exportGeneratedAt: ago(20), snapshotUploadedAt: ago(10), snapshotActivatedAt: ago(9), productionObservedAt: ago(1), ...overrides };
}

function adapters() {
  const calls = [];
  return {
    calls,
    isRefreshRunning: async () => false,
    triggerRefresh: async () => { calls.push('refresh'); return { started: true }; },
    publishExisting: async () => { calls.push('publish'); return { status: 'published' }; },
    activateStaged: async () => { calls.push('activate'); return { status: 'published' }; },
    verifyProductionReader: async () => { calls.push('reader'); return { status: 'checked' }; },
  };
}

test('watchdog is a no-op for a fully fresh pipeline', async () => {
  const io = adapters();
  const output = await executeFreshnessRecovery(base(), io);
  assert.equal(output.status, 'healthy');
  assert.deepEqual(io.calls, []);
});

test('watchdog republishes a fresh local export without rerunning collectors', async () => {
  const io = adapters();
  const output = await executeFreshnessRecovery(base({ snapshotUploadedAt: ago(180), snapshotActivatedAt: ago(179), productionObservedAt: ago(178) }), io);
  assert.equal(output.action, 'publish_and_activate_existing_export');
  assert.deepEqual(io.calls, ['publish']);
});

test('watchdog retries pointer activation without recollecting', async () => {
  const io = adapters();
  const output = await executeFreshnessRecovery(base({ snapshotActivatedAt: ago(180), productionObservedAt: ago(179) }), io);
  assert.equal(output.action, 'retry_snapshot_activation');
  assert.deepEqual(io.calls, ['activate']);
});

test('watchdog starts one guarded refresh only when no refresh is running', async () => {
  const io = adapters();
  const output = await executeFreshnessRecovery(base({ collectionFinishedAt: ago(190), exportGeneratedAt: ago(189), snapshotUploadedAt: ago(188), snapshotActivatedAt: ago(187), productionObservedAt: ago(186) }), io);
  assert.equal(output.action, 'trigger_guarded_refresh');
  assert.deepEqual(io.calls, ['refresh']);

  const busy = adapters();
  busy.isRefreshRunning = async () => true;
  const skipped = await executeFreshnessRecovery(base({ collectionFinishedAt: ago(190) }), busy);
  assert.equal(skipped.status, 'refresh_already_running');
  assert.deepEqual(busy.calls, []);
});

test('watchdog bounds retries and reports structured failure', async () => {
  const io = adapters();
  let attempts = 0;
  io.publishExisting = async () => { attempts += 1; throw new Error('transient blob outage'); };
  const output = await executeFreshnessRecovery(base({ snapshotUploadedAt: ago(180) }), io, { maxAttempts: 2, sleep: async () => {} });
  assert.equal(attempts, 2);
  assert.equal(output.status, 'recovery_failed');
  assert.equal(output.error, 'transient blob outage');
});
