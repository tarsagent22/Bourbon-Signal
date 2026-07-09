import { list, put } from "@vercel/blob";

const HEARTBEAT_PATH = "ops/alert-delivery-heartbeat.json";
export const EXPECTED_ALERT_CRON_SCHEDULE = "*/5 * * * *";
export const EXPECTED_ALERT_CRON_CADENCE_MINUTES = 5;
const CRON_STALE_AFTER_MINUTES = 12;
const ENGINE_STALE_AFTER_MINUTES = 120;

export interface AlertDeliveryHeartbeat {
  schemaVersion: 1;
  completedAt: string;
  ok: boolean;
  dryRun: boolean;
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
  const errorMessage = input.error instanceof Error ? input.error.message : input.error ? String(input.error) : null;
  const heartbeat: AlertDeliveryHeartbeat = {
    schemaVersion: 1,
    completedAt: new Date().toISOString(),
    ok: !errorMessage && result.ok !== false,
    dryRun: result.dryRun === true,
    durationMs: Math.max(0, Date.now() - input.startedAt),
    counts: safeCounts(result),
    error: errorMessage?.slice(0, 240) || null,
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

export function buildOpsHealth(input: {
  heartbeat: AlertDeliveryHeartbeat | null;
  engineGeneratedAt: string | null;
  refreshHealth?: Record<string, unknown> | null;
}) {
  const cronAgeMinutes = ageMinutes(input.heartbeat?.completedAt);
  const engineAgeMinutes = ageMinutes(input.engineGeneratedAt);
  const failedStateCount = finiteNumber(input.refreshHealth?.failedStateCount);
  const cronStatus = !input.heartbeat
    ? "unknown"
    : input.heartbeat.ok !== true
      ? "failed"
      : cronAgeMinutes !== null && cronAgeMinutes <= CRON_STALE_AFTER_MINUTES
        ? "healthy"
        : "stale";
  const engineStatus = failedStateCount > 0
    ? "failed"
    : engineAgeMinutes !== null && engineAgeMinutes <= ENGINE_STALE_AFTER_MINUTES
      ? "healthy"
      : engineAgeMinutes === null ? "unknown" : "stale";
  const ok = cronStatus === "healthy" && engineStatus === "healthy";

  return {
    ok,
    checkedAt: new Date().toISOString(),
    release: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || null,
    },
    cron: {
      path: "/api/alerts/deliver?cron=v2",
      expectedSchedule: EXPECTED_ALERT_CRON_SCHEDULE,
      expectedCadenceMinutes: EXPECTED_ALERT_CRON_CADENCE_MINUTES,
      staleAfterMinutes: CRON_STALE_AFTER_MINUTES,
      status: cronStatus,
      lastRunAt: input.heartbeat?.completedAt || null,
      ageMinutes: cronAgeMinutes,
      lastRunOk: input.heartbeat?.ok ?? null,
      lastRunDryRun: input.heartbeat?.dryRun ?? null,
    },
    engine: {
      status: engineStatus,
      generatedAt: input.engineGeneratedAt,
      ageMinutes: engineAgeMinutes,
      staleAfterMinutes: ENGINE_STALE_AFTER_MINUTES,
      failedStateCount,
    },
    delivery: {
      cronSecretConfigured: Boolean(process.env.CRON_SECRET || process.env.ALERT_DELIVERY_SECRET),
      blobHeartbeatConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      onSiteEnabled: process.env.ALERT_ONSITE_DELIVERY_ENABLED === "1" || process.env.ALERT_DELIVERY_ENABLED === "1",
      emailEnabled: process.env.ALERT_EMAIL_DELIVERY_ENABLED === "1" || process.env.ALERT_DELIVERY_ENABLED === "1",
      smsEnabled: process.env.ALERT_SMS_DELIVERY_ENABLED === "1" || process.env.ALERT_DELIVERY_ENABLED === "1",
    },
  };
}
