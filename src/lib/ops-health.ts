import { get, put } from "@vercel/blob";

const HEARTBEAT_PATH = "ops/alert-delivery-heartbeat-v2.json";
export const EXPECTED_ALERT_CRON_SCHEDULE = "*/5 * * * *";
export const EXPECTED_ALERT_CRON_PATH = "/api/alerts/deliver?cron=v3";
export const EXPECTED_ALERT_CRON_CADENCE_MINUTES = 5;
const CRON_STALE_AFTER_MINUTES = 12;
const ENGINE_STALE_AFTER_MINUTES = 120;

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
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return heartbeat;
}

export async function readAlertDeliveryHeartbeat(): Promise<AlertDeliveryHeartbeat | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    const result = await get(HEARTBEAT_PATH, { access: "private" });
    if (!result || result.statusCode !== 200) return null;
    return await new Response(result.stream).json() as AlertDeliveryHeartbeat;
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

export function buildOpsHealth(input: {
  heartbeat: AlertDeliveryHeartbeat | null;
  engineGeneratedAt: string | null;
  refreshHealth?: Record<string, unknown> | null;
  currentDeploymentId?: string | null;
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
  const engineStatus = failedStateCount > 0
    ? "failed"
    : degradedStateCount > 0 || staleStateCount > 0
      ? "degraded"
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
