import assert from 'node:assert/strict';
import { buildOpsHealth, EXPECTED_ALERT_CRON_SCHEDULE } from '../src/lib/ops-health.ts';

const now = new Date();
const recent = new Date(now.getTime() - 2 * 60_000).toISOString();
const healthy = buildOpsHealth({
  heartbeat: {
    schemaVersion: 1,
    completedAt: recent,
    ok: true,
    dryRun: false,
    durationMs: 500,
    counts: {},
    error: null,
  },
  engineGeneratedAt: recent,
  refreshHealth: { failedStateCount: 0 },
});
assert.equal(healthy.ok, true);
assert.equal(healthy.cron.expectedSchedule, EXPECTED_ALERT_CRON_SCHEDULE);
assert.equal(healthy.cron.status, 'healthy');
assert.equal(healthy.engine.status, 'healthy');

const stale = buildOpsHealth({
  heartbeat: {
    schemaVersion: 1,
    completedAt: new Date(now.getTime() - 20 * 60_000).toISOString(),
    ok: true,
    dryRun: false,
    durationMs: 500,
    counts: {},
    error: null,
  },
  engineGeneratedAt: recent,
  refreshHealth: { failedStateCount: 0 },
});
assert.equal(stale.ok, false);
assert.equal(stale.cron.status, 'stale');

const failedEngine = buildOpsHealth({
  heartbeat: healthy.cron.lastRunAt ? {
    schemaVersion: 1,
    completedAt: healthy.cron.lastRunAt,
    ok: true,
    dryRun: false,
    durationMs: 500,
    counts: {},
    error: null,
  } : null,
  engineGeneratedAt: recent,
  refreshHealth: { failedStateCount: 1 },
});
assert.equal(failedEngine.ok, false);
assert.equal(failedEngine.engine.status, 'failed');

console.log('Ops health tests passed.');
