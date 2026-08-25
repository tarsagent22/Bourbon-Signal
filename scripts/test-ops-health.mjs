import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
process.env.VERCEL_GIT_COMMIT_SHA = 'commit-current';
process.env.VERCEL_DEPLOYMENT_ID = 'dpl_current';
const healthy = buildOpsHealth({
  heartbeat,
  engineGeneratedAt: recent,
  refreshHealth: { failedStateCount: 0, degradedStateCount: 0, staleStateCount: 0 },
  currentDeploymentId: 'dpl_current',
});
assert.equal(healthy.ok, true);
assert.equal(healthy.cron.expectedSchedule, EXPECTED_ALERT_CRON_SCHEDULE);
assert.equal(healthy.cron.status, 'healthy');
assert.equal(healthy.release.status, 'healthy');
assert.equal(healthy.release.commit, 'commit-current');
assert.equal(healthy.engine.status, 'healthy');
assert.equal(healthy.engine.staleAfterMinutes, 45);

const missingHeartbeat = buildOpsHealth({
  heartbeat: null,
  engineGeneratedAt: recent,
  refreshHealth: { failedStateCount: 0, degradedStateCount: 0, staleStateCount: 0 },
  currentDeploymentId: 'dpl_current',
});
assert.equal(missingHeartbeat.cron.status, 'unknown');
assert.equal(missingHeartbeat.release.status, 'healthy', 'verified deployment identity must not be mislabeled as a mismatch when no heartbeat exists');

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
assert.equal(wrongDeployment.release.status, 'critical');
assert.equal(wrongDeployment.release.reason, 'alert_heartbeat_wrong_deployment');

const degradedEngine = buildOpsHealth({
  heartbeat,
  engineGeneratedAt: recent,
  refreshHealth: { failedStateCount: 0, degradedStateCount: 1, staleStateCount: 0 },
  currentDeploymentId: 'dpl_current',
});
assert.equal(degradedEngine.ok, true, 'labeled stale/degraded fallback data remains serviceable');
assert.equal(degradedEngine.engine.status, 'degraded');

const healthyPipeline = buildOpsHealth({
  heartbeat,
  engineGeneratedAt: recent,
  refreshHealth: { failedStateCount: 0, degradedStateCount: 0, staleStateCount: 0 },
  currentDeploymentId: 'dpl_current',
  snapshot: {
    snapshotId: 'snapshot-123',
    dataSource: 'remote-snapshot',
    exportGeneratedAt: recent,
    snapshotUploadedAt: recent,
    snapshotActivatedAt: recent,
    productionObservedAt: recent,
    appCommit: 'app123',
    engineCommit: 'engine123',
    collectionRunId: 'run123',
    lastRollbackAt: '2026-07-13T10:00:00.000Z',
    lastRollbackFrom: 'snapshot-bad',
    lastRollbackTo: 'snapshot-123',
  },
});
assert.equal(healthyPipeline.engine.freshnessStage, 'healthy');
assert.equal(healthyPipeline.engine.snapshotId, 'snapshot-123');
assert.equal(healthyPipeline.engine.provenance.engineCommit, 'engine123');
assert.deepEqual(healthyPipeline.engine.lastRollback, { at: '2026-07-13T10:00:00.000Z', from: 'snapshot-bad', to: 'snapshot-123' });

const publisherDelay = buildOpsHealth({
  heartbeat,
  engineGeneratedAt: recent,
  refreshHealth: { failedStateCount: 0, degradedStateCount: 0, staleStateCount: 0 },
  currentDeploymentId: 'dpl_current',
  snapshot: {
    snapshotId: 'snapshot-old',
    dataSource: 'cache-fallback',
    exportGeneratedAt: recent,
    snapshotUploadedAt: new Date(now.getTime() - 180 * 60_000).toISOString(),
    snapshotActivatedAt: new Date(now.getTime() - 179 * 60_000).toISOString(),
    productionObservedAt: null,
  },
});
assert.equal(publisherDelay.ok, false);
assert.equal(publisherDelay.engine.freshnessStage, 'publisher_delay');
assert.equal(publisherDelay.engine.recoveryAction, 'publish_and_activate_existing_export');

const alertAudit = {
  status: 'ok',
  queueModeActive: true,
  windowStart: '2026-07-10T00:00:00.000Z',
  windowEnd: '2026-07-11T00:00:00.000Z',
  deliveredRows: 9,
  uniqueRecipients: 4,
  channelCounts: { onSite: 2, email: 5, sms: 2 },
  repeatedIdentityGroups: 1,
  repeatedPayloadGroups: 2,
  repeatedUnderlyingBottleGroups: 3,
};
const audited = buildOpsHealth({
  heartbeat,
  engineGeneratedAt: recent,
  refreshHealth: { failedStateCount: 0, degradedStateCount: 0, staleStateCount: 0 },
  currentDeploymentId: 'dpl_current',
  alertAudit,
});
assert.deepEqual(audited.delivery.alertAudit, alertAudit);
assert.doesNotMatch(JSON.stringify(audited.delivery.alertAudit), /user-|@|stableMatchKey|emailAddress|phone/i, 'ops health audit must expose aggregate counts only');

const unavailableAudit = {
  status: 'unavailable',
  queueModeActive: true,
  windowStart: alertAudit.windowStart,
  windowEnd: alertAudit.windowEnd,
  deliveredRows: 0,
  uniqueRecipients: 0,
  channelCounts: { onSite: 0, email: 0, sms: 0 },
  repeatedIdentityGroups: 0,
  repeatedPayloadGroups: 0,
  repeatedUnderlyingBottleGroups: 0,
  note: 'queue_database_unavailable',
};
const degradedAudit = buildOpsHealth({ heartbeat, engineGeneratedAt: recent, alertAudit: unavailableAudit });
assert.equal(degradedAudit.delivery.alertAudit.status, 'unavailable');
assert.equal(degradedAudit.ok, true, 'audit database unavailability must not turn otherwise healthy production health into an outage');

const healthRoute = readFileSync(new URL('../src/app/api/ops/health/route.ts', import.meta.url), 'utf8');
assert.doesNotMatch(healthRoute, /readAlertQueueAuditHealth/, 'public health must read the cached heartbeat rather than scan the queue');
assert.match(healthRoute, /heartbeat\?\.alertAudit/, 'public health must expose the aggregate cached by the delivery heartbeat');
const deliveryRoute = readFileSync(new URL('../src/app/api/alerts/deliver/route.ts', import.meta.url), 'utf8');
assert.match(deliveryRoute, /readAlertQueueAuditHealth/, 'the scheduled delivery boundary must calculate the aggregate once per heartbeat');

console.log('Ops health tests passed.');
