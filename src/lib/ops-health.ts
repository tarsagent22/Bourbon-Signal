import { list, put } from "@vercel/blob";

const HEARTBEAT_PATH = "ops/alert-delivery-heartbeat-v2.json";
export const EXPECTED_ALERT_CRON_SCHEDULE = "*/5 * * * *";
export const EXPECTED_ALERT_CRON_PATH = "/api/alerts/deliver?cron=v3";
export const EXPECTED_ALERT_CRON_CADENCE_MINUTES = 5;
const CRON_STALE_AFTER_MINUTES = 12;
const ENGINE_STALE_AFTER_MINUTES = 45;

export interface AlertDeliveryHeartbeat {
  schemaVersion: 2;
  completedAt: string;
  ok: boolean;
  dryRun: boolean;
  deploymentId: string | null;
  durationMs: number;
  counts: Record<string, number>;
  error: string | null;
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeCounts(result: Record<string, unknown>) {
  const keys = [
    "candidateCount",
    "eligibleCandidateCount",
    "usersConsidered",
    "usersMatched",
    "onSiteAlertsCreated",
    "emailsWouldSend",
    "emailsSent",
    "smsWouldSend",
    "smsSent",
    "skippedDedupe",
    "skippedStale",
    "skippedUnknownFreshness",
  ];
  return Object.fromEntries(keys.map((key) => [key, finiteNumber(result[key])]));
}

export async function writeAlertDeliveryHeartbeat(input: {
  startedAt: number;
  result?: Record<string, unknown>;
  error?: unknown;
}) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  const result = input.result || {};
  const failed = Boolean(input.error) || result.ok === false;
  const heartbeat: AlertDeliveryHeartbeat = {
    schemaVersion: 2,
    completedAt: new Date().toISOString(),
    ok: !failed,
    dryRun: result.dryRun === true,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    durationMs: Math.max(0, Date.now() - input.startedAt),
    counts: safeCounts(result),
    error: failed ? "delivery_failed" : null,
  };
  await put(HEARTBEAT_PATH, JSON.stringify(heartbeat), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return heartbeat;
}

export async function readAlertDeliveryHeartbeat(): Promise<AlertDeliveryHeartbeat | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    const result = await list({ prefix: HEARTBEAT_PATH, limit: 1 });
    const url = result.blobs.find((blob) => blob.pathname === HEARTBEAT_PATH)?.url;
    if (!url) return null;
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return null;
    return await response.json() as AlertDeliveryHeartbeat;
  } catch {
    return null;
  }
}

function ageMinutes(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round(((Date.now() - parsed) / 60_000) * 10) / 10);
}

function classifyFreshnessPipeline(input: {
  collectionFinishedAt: string | null;
  exportGeneratedAt: string | null;
  snapshotUploadedAt: string | null;
  snapshotActivatedAt: string | null;
  productionObservedAt: string | null;
}) {
  const collectionAge = ageMinutes(input.collectionFinishedAt);
  const exportAge = ageMinutes(input.exportGeneratedAt);
  const uploadAge = ageMinutes(input.snapshotUploadedAt);
  const activationAge = ageMinutes(input.snapshotActivatedAt);
  const observationAge = ageMinutes(input.productionObservedAt);
  const time = (value: string | null) => value ? Date.parse(value) : Number.NaN;
  const tolerance = 2 * 60_000;
  if (collectionAge === null || collectionAge > ENGINE_STALE_AFTER_MINUTES) return { freshnessStage: "collector_delay", recoveryAction: "trigger_guarded_refresh" };
  if (exportAge === null || exportAge > ENGINE_STALE_AFTER_MINUTES || time(input.exportGeneratedAt) + tolerance < time(input.collectionFinishedAt)) return { freshnessStage: "exporter_delay", recoveryAction: "rerun_export_only" };
  if (uploadAge === null || uploadAge > ENGINE_STALE_AFTER_MINUTES || time(input.snapshotUploadedAt) + tolerance < time(input.exportGeneratedAt)) return { freshnessStage: "publisher_delay", recoveryAction: "publish_and_activate_existing_export" };
  if (activationAge === null || activationAge > ENGINE_STALE_AFTER_MINUTES || time(input.snapshotActivatedAt) + tolerance < time(input.snapshotUploadedAt)) return { freshnessStage: "activation_delay", recoveryAction: "retry_snapshot_activation" };
  if (observationAge === null || observationAge > CRON_STALE_AFTER_MINUTES || time(input.productionObservedAt) + tolerance < time(input.snapshotActivatedAt)) return { freshnessStage: "production_reader_delay", recoveryAction: "verify_production_reader" };
  return { freshnessStage: "healthy", recoveryAction: "none" };
}

export function buildOpsHealth(input: {
  heartbeat: AlertDeliveryHeartbeat | null;
  engineGeneratedAt: string | null;
  refreshHealth?: Record<string, unknown> | null;
  currentDeploymentId?: string | null;
  snapshot?: {
    snapshotId: string | null;
    dataSource: string;
    exportGeneratedAt: string | null;
    snapshotUploadedAt: string | null;
    snapshotActivatedAt: string | null;
    productionObservedAt: string | null;
    appCommit?: string | null;
    engineCommit?: string | null;
    collectionRunId?: string | null;
    lastRollbackAt?: string | null;
    lastRollbackFrom?: string | null;
    lastRollbackTo?: string | null;
  };
}) {
  const cronAgeMinutes = ageMinutes(input.heartbeat?.completedAt);
  const engineAgeMinutes = ageMinutes(input.engineGeneratedAt);
  const failedStateCount = finiteNumber(input.refreshHealth?.failedStateCount);
  const degradedStateCount = finiteNumber(input.refreshHealth?.degradedStateCount);
  const staleStateCount = finiteNumber(input.refreshHealth?.staleStateCount);
  const deploymentMismatch = Boolean(input.currentDeploymentId && input.heartbeat?.deploymentId !== input.currentDeploymentId);
  const monitorOnly = process.env.ALERT_MONITOR_ONLY === "1";
  const deliveryChannelsEnabled = process.env.ALERT_ONSITE_DELIVERY_ENABLED === "1"
    || process.env.ALERT_EMAIL_DELIVERY_ENABLED === "1"
    || process.env.ALERT_SMS_DELIVERY_ENABLED === "1"
    || process.env.ALERT_DELIVERY_ENABLED === "1";
  const cronStatus = !input.heartbeat
    ? "unknown"
    : deploymentMismatch
        ? "wrong_deployment"
      : input.heartbeat.dryRun
        ? monitorOnly && !deliveryChannelsEnabled ? "monitoring" : "dry_run"
        : input.heartbeat.ok !== true
      ? "failed"
      : cronAgeMinutes !== null && cronAgeMinutes <= CRON_STALE_AFTER_MINUTES
        ? "healthy"
        : "stale";
  const pipeline = input.snapshot ? classifyFreshnessPipeline({
    collectionFinishedAt: input.engineGeneratedAt,
    exportGeneratedAt: input.snapshot.exportGeneratedAt,
    snapshotUploadedAt: input.snapshot.snapshotUploadedAt,
    snapshotActivatedAt: input.snapshot.snapshotActivatedAt,
    productionObservedAt: input.snapshot.productionObservedAt,
  }) : null;
  const engineStatus = failedStateCount > 0
    ? "failed"
    : degradedStateCount > 0 || staleStateCount > 0
      ? "degraded"
      : pipeline && pipeline.freshnessStage !== "healthy"
        ? "stale"
      : engineAgeMinutes !== null && engineAgeMinutes <= ENGINE_STALE_AFTER_MINUTES
      ? "healthy"
      : engineAgeMinutes === null ? "unknown" : "stale";
  const ok = (cronStatus === "healthy" || cronStatus === "monitoring") && (engineStatus === "healthy" || engineStatus === "degraded");

  return {
    ok,
    checkedAt: new Date().toISOString(),
    release: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || null,
    },
    cron: {
      path: EXPECTED_ALERT_CRON_PATH,
      expectedSchedule: EXPECTED_ALERT_CRON_SCHEDULE,
      expectedCadenceMinutes: EXPECTED_ALERT_CRON_CADENCE_MINUTES,
      staleAfterMinutes: CRON_STALE_AFTER_MINUTES,
      status: cronStatus,
      lastRunAt: input.heartbeat?.completedAt || null,
      ageMinutes: cronAgeMinutes,
      lastRunOk: input.heartbeat?.ok ?? null,
      lastRunDryRun: input.heartbeat?.dryRun ?? null,
      deploymentId: input.heartbeat?.deploymentId || null,
    },
    engine: {
      status: engineStatus,
      generatedAt: input.engineGeneratedAt,
      ageMinutes: engineAgeMinutes,
      staleAfterMinutes: ENGINE_STALE_AFTER_MINUTES,
      failedStateCount,
      degradedStateCount,
      staleStateCount,
      freshnessStage: pipeline?.freshnessStage ?? (engineStatus === "healthy" ? "legacy_bundled" : engineStatus),
      recoveryAction: pipeline?.recoveryAction ?? null,
      snapshotId: input.snapshot?.snapshotId ?? null,
      dataSource: input.snapshot?.dataSource ?? "bundled",
      exportGeneratedAt: input.snapshot?.exportGeneratedAt ?? null,
      snapshotUploadedAt: input.snapshot?.snapshotUploadedAt ?? null,
      snapshotActivatedAt: input.snapshot?.snapshotActivatedAt ?? null,
      productionObservedAt: input.snapshot?.productionObservedAt ?? null,
      lastRollback: input.snapshot?.lastRollbackAt ? {
        at: input.snapshot.lastRollbackAt,
        from: input.snapshot.lastRollbackFrom ?? null,
        to: input.snapshot.lastRollbackTo ?? null,
      } : null,
      provenance: {
        appCommit: input.snapshot?.appCommit ?? null,
        engineCommit: input.snapshot?.engineCommit ?? null,
        collectionRunId: input.snapshot?.collectionRunId ?? null,
      },
    },
    delivery: {
      cronSecretConfigured: Boolean(process.env.CRON_SECRET || process.env.ALERT_DELIVERY_SECRET),
      blobHeartbeatConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      onSiteEnabled: process.env.ALERT_ONSITE_DELIVERY_ENABLED === "1" || process.env.ALERT_DELIVERY_ENABLED === "1",
      emailEnabled: process.env.ALERT_EMAIL_DELIVERY_ENABLED === "1" || process.env.ALERT_DELIVERY_ENABLED === "1",
      smsEnabled: process.env.ALERT_SMS_DELIVERY_ENABLED === "1" || process.env.ALERT_DELIVERY_ENABLED === "1",
      monitorOnly,
    },
  };
}
