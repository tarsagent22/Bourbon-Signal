const MINUTE = 60_000;

export const DEFAULT_RELIABILITY_SLO = Object.freeze({
  maxSnapshotAgeMs: 45 * MINUTE,
  requiredStateCoverageRatio: 1,
  maxConsecutiveRefreshFailures: 1,
  refreshIntervalMs: 30 * MINUTE,
  refreshSafetyMarginMs: 5 * MINUTE,
});

export const DEFAULT_EXPANSION_PROMOTION_POLICY = Object.freeze({
  minShadowRuns: 3,
  minCanaryRuns: 2,
  requireVerticalSliceManifest: true,
  requireFixtureContract: true,
  requireCanaryPreviewUrl: true,
});

function stateSet(value = '') {
  return new Set(String(value).split(',').map((item) => item.trim().toUpperCase()).filter(Boolean));
}

export function evaluateStateControl(state, env = process.env) {
  const normalized = String(state || '').trim().toUpperCase();
  const disabled = stateSet(env.BOURBON_SIGNAL_DISABLED_STATES);
  const quarantined = stateSet(env.BOURBON_SIGNAL_QUARANTINED_STATES);
  if (disabled.has(normalized)) return { state: normalized, mode: 'disabled', collect: false, publishCandidate: false };
  if (quarantined.has(normalized)) return { state: normalized, mode: 'quarantined', collect: true, publishCandidate: false };
  return { state: normalized, mode: 'active', collect: true, publishCandidate: true };
}

export function evaluateCapacityBudget({ stateExpectedRunMs = [], concurrency = 1, intervalMs, safetyMarginMs } = {}) {
  const workers = Math.max(1, Math.floor(Number(concurrency) || 1));
  const interval = Number(intervalMs || DEFAULT_RELIABILITY_SLO.refreshIntervalMs);
  const margin = Number(safetyMarginMs ?? DEFAULT_RELIABILITY_SLO.refreshSafetyMarginMs);
  const loads = Array(workers).fill(0);
  const durations = stateExpectedRunMs.map(Number).filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => b - a);
  for (const duration of durations) {
    let target = 0;
    for (let index = 1; index < loads.length; index += 1) if (loads[index] < loads[target]) target = index;
    loads[target] += duration;
  }
  const projectedRunMs = Math.max(0, ...loads);
  const availableRunMs = Math.max(0, interval - margin);
  return {
    ok: projectedRunMs <= availableRunMs,
    projectedRunMs,
    availableRunMs,
    utilization: availableRunMs ? projectedRunMs / availableRunMs : Infinity,
    workerLoadsMs: loads,
    reason: projectedRunMs <= availableRunMs ? null : `Expansion exceeds refresh capacity: projected ${projectedRunMs}ms > available ${availableRunMs}ms.`,
  };
}

export function validateExpansionLifecycle(config = {}) {
  const activeStates = Array.isArray(config.activeStates) ? config.activeStates : [];
  const grandfathered = new Set(config.reliabilityPolicy?.grandfatheredActiveStates || []);
  const promotionPolicy = { ...DEFAULT_EXPANSION_PROMOTION_POLICY, ...(config.reliabilityPolicy?.promotionPolicy || {}) };
  const failures = [];
  for (const state of activeStates) {
    const lifecycle = config.states?.[state];
    if (!lifecycle || lifecycle.publicStatus !== 'active') {
      failures.push(`${state}: active state must have publicStatus=active.`);
      continue;
    }
    if (grandfathered.has(state)) continue;
    if (lifecycle.promotionStage !== 'active') failures.push(`${state}: promotionStage must be active after shadow and canary.`);
    const evidence = lifecycle.promotionEvidence;
    if (!evidence || Number(evidence.shadowRuns || 0) < Number(promotionPolicy.minShadowRuns) || Number(evidence.canaryRuns || 0) < Number(promotionPolicy.minCanaryRuns) || !Number.isFinite(Date.parse(evidence.verifiedAt))) {
      failures.push(`${state}: promotionEvidence requires ${promotionPolicy.minShadowRuns} shadowRuns, ${promotionPolicy.minCanaryRuns} canaryRuns, and verifiedAt.`);
    }
    if (promotionPolicy.requireVerticalSliceManifest !== false && !evidence?.verticalSliceManifest) failures.push(`${state}: promotionEvidence requires a vertical-slice manifest reference.`);
    if (promotionPolicy.requireFixtureContract !== false && !evidence?.fixtureContract) failures.push(`${state}: promotionEvidence requires a golden fixture contract reference.`);
    if (promotionPolicy.requireCanaryPreviewUrl !== false && !evidence?.canaryPreviewUrl) failures.push(`${state}: promotionEvidence requires a canary preview URL.`);
  }
  return { ok: failures.length === 0, failures };
}
