function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function decideSourceSchedule(metrics = {}, options = {}) {
  const probes = Math.max(1, Number(metrics.probes || 0));
  const yieldRate = clamp(Number(metrics.usefulChanges || 0) / probes, 0, 1);
  const failureRate = clamp(Number(metrics.failures || 0) / probes, 0, 1);
  const freshness = 1 / (1 + Math.max(0, Number(metrics.consecutiveUnchanged || 0)) / 4);
  const roiScore = clamp(yieldRate * 0.7 + freshness * 0.3 - failureRate * 0.6, 0, 1);
  const base = Math.max(1_000, Number(options.baseCadenceMs ?? 3_600_000));
  const min = Math.max(1_000, Number(options.minCadenceMs ?? base / 4));
  const max = Math.max(min, Number(options.maxCadenceMs ?? base * 24));
  const coldMultiplier = 1 + Math.max(0, Number(metrics.consecutiveUnchanged || 0)) / 3;
  const failureMultiplier = 1 + failureRate * 4 + Math.max(0, Number(metrics.consecutiveFailures || 0));
  const valueMultiplier = roiScore >= 0.6 ? 0.5 : roiScore >= 0.3 ? 1 : coldMultiplier;
  const cadenceMs = Math.round(clamp(base * valueMultiplier * failureMultiplier, min, max));
  const lastProbe = Date.parse(metrics.lastProbeAt || '');
  const now = Date.parse(options.now || new Date().toISOString());
  const nextProbeAt = Number.isFinite(lastProbe) ? new Date(lastProbe + cadenceMs).toISOString() : options.now || new Date(now).toISOString();
  const due = !Number.isFinite(lastProbe) || !Number.isFinite(now) || now >= lastProbe + cadenceMs;
  return {
    sourceId: metrics.sourceId || null,
    decision: metrics.disabled ? 'disabled' : due ? 'probe_now' : 'wait',
    cadenceMs,
    nextProbeAt,
    roiScore: Math.round(roiScore * 1000) / 1000,
    reasons: metrics.disabled ? ['disabled'] : [roiScore >= 0.6 ? 'high_roi' : roiScore < 0.2 ? 'low_roi' : 'normal_roi', ...(failureRate >= 0.5 ? ['failure_backoff'] : []), ...(Number(metrics.consecutiveUnchanged || 0) >= 4 ? ['unchanged_backoff'] : [])]
  };
}
