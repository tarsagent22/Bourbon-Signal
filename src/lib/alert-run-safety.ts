export type AlertSnapshotSafety = {
  safe: boolean;
  reason: "stale_alert_snapshot" | "unknown_alert_snapshot_freshness" | null;
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
  if (!Number.isFinite(generatedAtMs) || !Number.isFinite(nowMs)) {
    return {
      safe: false,
      reason: "unknown_alert_snapshot_freshness",
      ageMinutes: null,
      maxAgeMinutes: input.maxAgeMinutes,
    };
  }
  const ageMinutes = Math.max(0, Math.round(((nowMs - generatedAtMs) / 60_000) * 10) / 10);
  return {
    safe: ageMinutes <= input.maxAgeMinutes,
    reason: ageMinutes <= input.maxAgeMinutes ? null : "stale_alert_snapshot",
    ageMinutes,
    maxAgeMinutes: input.maxAgeMinutes,
  };
}
