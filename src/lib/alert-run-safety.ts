export const ALERT_FRESHNESS_HARD_CAP_HOURS = 1;

export function resolveAlertFreshnessCapHours(configured: number | undefined) {
  return Number.isFinite(configured) && Number(configured) > 0
    ? Math.min(Number(configured), ALERT_FRESHNESS_HARD_CAP_HOURS)
    : ALERT_FRESHNESS_HARD_CAP_HOURS;
}

export function alertFreshnessIsDeliverable(freshnessHours: number, configuredLimitHours: number | undefined) {
  return Number.isFinite(freshnessHours)
    && freshnessHours >= 0
    && freshnessHours <= resolveAlertFreshnessCapHours(configuredLimitHours);
}

export function signalFreshnessHoursAt(signalAt: string | null | undefined, now: string = new Date().toISOString()) {
  const signalAtMs = signalAt ? Date.parse(signalAt) : Number.NaN;
  const nowMs = Date.parse(now);
  if (!Number.isFinite(signalAtMs) || !Number.isFinite(nowMs)) return Number.NaN;
  const ageMs = nowMs - signalAtMs;
  if (ageMs < -5 * 60_000) return Number.NaN;
  return Math.max(0, ageMs / (60 * 60_000));
}

export function resolveAlertSnapshotMaxAgeMinutes(configured: number | undefined) {
  const defaultMinutes = 45;
  return Number.isFinite(configured) && Number(configured) > 0
    ? Math.min(Number(configured), 60)
    : defaultMinutes;
}

export type AlertSnapshotSafety = {
  safe: boolean;
  reason: "stale_alert_snapshot" | "unknown_alert_snapshot_freshness" | "future_alert_snapshot" | null;
  ageMinutes: number | null;
  maxAgeMinutes: number;
};

export function evaluateAlertSnapshotSafety(input: {
  generatedAt: string | null | undefined;
  now?: string;
  maxAgeMinutes: number;
}): AlertSnapshotSafety {
  const generatedAtMs = input.generatedAt ? Date.parse(input.generatedAt) : Number.NaN;
  const nowMs = Date.parse(input.now || new Date().toISOString());
  const maxAgeMinutes = resolveAlertSnapshotMaxAgeMinutes(input.maxAgeMinutes);
  if (!Number.isFinite(generatedAtMs) || !Number.isFinite(nowMs)) {
    return {
      safe: false,
      reason: "unknown_alert_snapshot_freshness",
      ageMinutes: null,
      maxAgeMinutes,
    };
  }
  const ageMs = nowMs - generatedAtMs;
  if (ageMs < -5 * 60_000) {
    return {
      safe: false,
      reason: "future_alert_snapshot",
      ageMinutes: null,
      maxAgeMinutes,
    };
  }
  const ageMinutes = Math.max(0, ageMs / 60_000);
  return {
    safe: ageMinutes <= maxAgeMinutes,
    reason: ageMinutes <= maxAgeMinutes ? null : "stale_alert_snapshot",
    ageMinutes,
    maxAgeMinutes,
  };
}
