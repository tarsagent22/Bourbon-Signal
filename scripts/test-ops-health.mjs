import assert from 'node:assert/strict';
import { buildOpsHealth, EXPECTED_ALERT_CRON_SCHEDULE } from '../src/lib/ops-health.ts';

const now = new Date();
const recent = new Date(now.getTime() - 2 * 60_000).toISOString();
const heartbeat = {
  schemaVersion: 2,
  completedAt: recent,
  ok: true,
  dryRun: false,
  deploymentId: 'dpl_current',
  durationMs: 500,
  counts: {},
  error: null,
};
const healthy = buildOpsHealth({
  heartbeat,
  engineGeneratedAt: recent,
  refreshHealth: { failedStateCount: 0, degradedStateCount: 0, staleStateCount: 0 },
  currentDeploymentId: 'dpl_current',
});
assert.equal(healthy.ok, true);
assert.equal(healthy.cron.expectedSchedule, EXPECTED_ALERT_CRON_SCHEDULE);
assert.equal(healthy.cron.status, 'healthy');
assert.equal(healthy.engine.status, 'healthy');

const stale = buildOpsHealth({
  heartbeat: { ...heartbeat, completedAt: new Date(now.getTime() - 20 * 60_000).toISOString() },
  engineGeneratedAt: recent,
  refreshHealth: { failedStateCount: 0, degradedStateCount: 0, staleStateCount: 0 },
  currentDeploymentId: 'dpl_current',
});
assert.equal(stale.ok, false);
assert.equal(stale.cron.status, 'stale');

const failedEngine = buildOpsHealth({
  heartbeat,
  engineGeneratedAt: recent,
  refreshHealth: { failedStateCount: 1, degradedStateCount: 0, staleStateCount: 0 },
  currentDeploymentId: 'dpl_current',
});
assert.equal(failedEngine.ok, false);
assert.equal(failedEngine.engine.status, 'failed');

const dryRun = buildOpsHealth({
  heartbeat: { ...heartbeat, dryRun: true },
  engineGeneratedAt: recent,
  refreshHealth: { failedStateCount: 0, degradedStateCount: 0, staleStateCount: 0 },
  currentDeploymentId: 'dpl_current',
});
assert.equal(dryRun.ok, false);
assert.equal(dryRun.cron.status, 'dry_run');

process.env.ALERT_MONITOR_ONLY = '1';
const monitoring = buildOpsHealth({
  heartbeat: { ...heartbeat, dryRun: true },
  engineGeneratedAt: recent,
  refreshHealth: { failedStateCount: 0, degradedStateCount: 0, staleStateCount: 0 },
  currentDeploymentId: 'dpl_current',
});
assert.equal(monitoring.ok, true);
assert.equal(monitoring.cron.status, 'monitoring');
assert.equal(monitoring.delivery.monitorOnly, true);
delete process.env.ALERT_MONITOR_ONLY;

const wrongDeployment = buildOpsHealth({
  heartbeat: { ...heartbeat, deploymentId: 'dpl_old' },
  engineGeneratedAt: recent,
  refreshHealth: { failedStateCount: 0, degradedStateCount: 0, staleStateCount: 0 },
  currentDeploymentId: 'dpl_current',
});
assert.equal(wrongDeployment.ok, false);
assert.equal(wrongDeployment.cron.status, 'wrong_deployment');

const degradedEngine = buildOpsHealth({
  heartbeat,
  engineGeneratedAt: recent,
  refreshHealth: { failedStateCount: 0, degradedStateCount: 1, staleStateCount: 0 },
  currentDeploymentId: 'dpl_current',
});
assert.equal(degradedEngine.ok, true, 'labeled stale/degraded fallback data remains serviceable');
assert.equal(degradedEngine.engine.status, 'degraded');

console.log('Ops health tests passed.');
