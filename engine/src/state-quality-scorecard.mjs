const LIVE_STORE_TIERS = new Set(['live_store_inventory']);
const WATCH_TIERS = new Set([
  'store_delivery_leads',
  'store_availability_status',
  'shipment_drop_intelligence',
  'aggregate_inventory_watch',
  'distillery_release_watch',
  'retailer_warehouse_inventory',
]);

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function freshnessHours(value, nowMs = Date.now()) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? Math.max(0, (nowMs - parsed) / 3_600_000) : null;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function scoreStateQuality(input, options = {}) {
  const nowMs = options.nowMs || Date.now();
  const normalized = {
    state: String(input.state || '').toUpperCase(),
    coverageTier: String(input.coverageTier || 'unknown'),
    signalCount: number(input.signalCount),
    dropCount: number(input.dropCount),
    storeLevelDropCount: number(input.storeLevelDropCount),
    alertCandidateCount: number(input.alertCandidateCount),
    sourceCount: number(input.sourceCount),
    roadblockCount: number(input.roadblockCount),
    freshestObservedAt: input.freshestObservedAt || null,
    status: String(input.status || 'unknown'),
  };
  const liveStore = LIVE_STORE_TIERS.has(normalized.coverageTier);
  const watchLane = WATCH_TIERS.has(normalized.coverageTier);
  const ageHours = freshnessHours(normalized.freshestObservedAt, nowMs);
  const weaknesses = [];

  let freshnessScore = 0;
  if (ageHours === null) weaknesses.push('unknown_freshness');
  else if (ageHours <= 6) freshnessScore = 20;
  else if (ageHours <= 24) freshnessScore = 16;
  else if (ageHours <= 72) freshnessScore = 10;
  else if (ageHours <= 168) { freshnessScore = 5; weaknesses.push('stale_freshness'); }
  else weaknesses.push('stale_freshness');

  const volumeTarget = liveStore ? 100 : watchLane ? 8 : 20;
  const volumeScore = clamp((normalized.dropCount / volumeTarget) * 20, 0, 20);
  if (normalized.dropCount === 0) weaknesses.push('no_public_drops');
  else if (normalized.dropCount < Math.min(volumeTarget, 5)) weaknesses.push('thin_public_drops');

  let precisionScore = 0;
  if (liveStore) {
    if (normalized.storeLevelDropCount === 0) weaknesses.push('no_store_level_drops');
    const ratio = normalized.dropCount ? normalized.storeLevelDropCount / normalized.dropCount : 0;
    precisionScore = clamp(ratio * 20, 0, 20);
    if (ratio > 0 && ratio < 0.75) weaknesses.push('low_store_precision_ratio');
  } else {
    precisionScore = watchLane && normalized.dropCount > 0 ? 16 : normalized.dropCount > 0 ? 12 : 0;
  }

  const alertTarget = liveStore ? 5 : 1;
  const alertScore = clamp((normalized.alertCandidateCount / alertTarget) * 15, 0, 15);
  if (normalized.alertCandidateCount === 0) weaknesses.push('no_alert_candidates');

  const sourceTarget = liveStore ? 3 : 2;
  const sourceScore = clamp((normalized.sourceCount / sourceTarget) * 15, 0, 15);
  if (normalized.sourceCount <= 1) weaknesses.push('single_source_dependency');

  const roadblockPenalty = clamp(normalized.roadblockCount * 1.5, 0, 10);
  const reliabilityScore = 10 - roadblockPenalty;
  if (normalized.roadblockCount >= 5) weaknesses.push('high_roadblock_load');
  if (/stale|failed|degraded/iu.test(normalized.status)) weaknesses.push('degraded_state_status');

  const score = Math.round(clamp(freshnessScore + volumeScore + precisionScore + alertScore + sourceScore + reliabilityScore));
  const threshold = liveStore ? 65 : watchLane ? 50 : 55;
  const hardBlock = weaknesses.includes('unknown_freshness')
    || weaknesses.includes('no_public_drops')
    || (liveStore && weaknesses.includes('no_store_level_drops'))
    || /failed/iu.test(normalized.status);

  return {
    state: normalized.state,
    coverageTier: normalized.coverageTier,
    score,
    threshold,
    releaseEligible: score >= threshold && !hardBlock,
    freshnessHours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
    dimensions: {
      freshness: Math.round(freshnessScore),
      volume: Math.round(volumeScore),
      precision: Math.round(precisionScore),
      alerts: Math.round(alertScore),
      sourceDiversity: Math.round(sourceScore),
      reliability: Math.round(reliabilityScore),
    },
    weaknesses: [...new Set(weaknesses)],
    input: normalized,
  };
}

function summarizeStateQuality(states) {
  const scores = states.map((state) => state.score);
  return {
    stateCount: states.length,
    releaseEligibleStates: states.filter((state) => state.releaseEligible).length,
    releaseBlockedStates: states.filter((state) => !state.releaseEligible).length,
    averageScore: scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0,
    weakestStates: [...states].sort((a, b) => a.score - b.score || a.state.localeCompare(b.state)).slice(0, 5).map((state) => state.state),
  };
}

export function buildStateQualityScorecard(inputs, { generatedAt = new Date().toISOString(), nowMs } = {}) {
  const states = inputs
    .map((input) => scoreStateQuality(input, { nowMs: nowMs || new Date(generatedAt).getTime() }))
    .sort((a, b) => b.score - a.score || a.state.localeCompare(b.state));
  return {
    schemaVersion: 2,
    generatedAt,
    summary: summarizeStateQuality(states),
    states,
  };
}

export function mergePartialRefreshStateQuality(previous, current, summary = {}) {
  const preserved = new Set((summary.fallbackStateIds || []).map((state) => String(state).toUpperCase()));
  if ((summary.partialRefresh !== true && !preserved.size) || previous?.schemaVersion !== current?.schemaVersion) return current;
  const attempted = new Set((summary.attemptedStateIds || []).map((state) => String(state).toUpperCase()));
  const previousByState = new Map((previous?.states || []).map((state) => [String(state.state).toUpperCase(), state]));
  const states = (current?.states || []).map((state) => {
    const stateId = String(state.state).toUpperCase();
    return attempted.has(stateId) && !preserved.has(stateId) ? state : previousByState.get(stateId) || state;
  }).sort((a, b) => b.score - a.score || a.state.localeCompare(b.state));
  return { ...current, summary: summarizeStateQuality(states), states };
}

export function scopeStateQualityForRefresh(scorecard, summary = {}) {
  if (summary.partialRefresh !== true) return scorecard;
  const attempted = new Set((summary.attemptedStateIds || []).map((state) => String(state).toUpperCase()));
  return {
    ...scorecard,
    states: (scorecard?.states || []).filter((state) => attempted.has(String(state.state).toUpperCase())),
  };
}

export function compareStateQuality(previous, current, { maxScoreDrop = 15, minDropRatio = 0.5, severeDropRatio = 0.4 } = {}) {
  const failures = [];
  const warnings = [];
  const previousByState = new Map((previous?.states || []).map((state) => [state.state, state]));
  for (const state of current?.states || []) {
    const before = previousByState.get(state.state);
    if (!before) continue;
    const priorDrops = number(before.input?.dropCount ?? before.dropCount);
    const currentDrops = number(state.input?.dropCount ?? state.dropCount);
    const currentStatus = String(state.input?.status || '');
    const preservedFallback = /quality_fallback/iu.test(currentStatus)
      && currentDrops >= Math.floor(priorDrops * minDropRatio);
    if (number(before.score) - number(state.score) > maxScoreDrop) {
      if (preservedFallback) warnings.push(`${state.state}: quality score fell from ${before.score} to ${state.score} while the last-good rows remain preserved.`);
      else failures.push(`${state.state}: quality score fell from ${before.score} to ${state.score}.`);
    }
    const hardWeaknesses = new Set(['unknown_freshness', 'no_public_drops', 'no_store_level_drops', 'degraded_state_status']);
    const hardSourceFailure = (state.weaknesses || []).some((weakness) => hardWeaknesses.has(weakness))
      || /stale|failed|degraded/iu.test(currentStatus);
    if (priorDrops >= 5 && currentDrops < Math.floor(priorDrops * minDropRatio)) {
      const dropRatio = priorDrops > 0 ? currentDrops / priorDrops : 0;
      const message = `${state.state}: public drops fell from ${priorDrops} to ${currentDrops}.`;
      if (dropRatio < severeDropRatio || hardSourceFailure) failures.push(message);
      else warnings.push(`${message} Healthy source status preserved the fresh snapshot while the next run confirms inventory churn.`);
    }
    if (before.releaseEligible === true && state.releaseEligible !== true) {
      const hardFailure = (state.weaknesses || []).some((weakness) => hardWeaknesses.has(weakness));
      if (hardFailure && !preservedFallback) failures.push(`${state.state}: changed from release eligible to blocked.`);
      else if (!preservedFallback) warnings.push(`${state.state}: release score crossed below threshold without a hard source failure.`);
    }
    const beforeDegraded = /stale|failed|degraded/iu.test(String(before.input?.status || ''));
    const currentDegraded = /stale|failed|degraded/iu.test(currentStatus);
    if (!beforeDegraded && currentDegraded) {
      if (preservedFallback) warnings.push(`${state.state}: preserved fallback is serving the last good rows while collection retries.`);
      else failures.push(`${state.state}: state status became degraded (${state.input?.status || 'unknown'}).`);
    }
  }
  return { ok: failures.length === 0, failures, warnings };
}

export function buildStateQualityInputs({ stateCoverage, drops, alerts }) {
  const coverageRows = Array.isArray(stateCoverage?.states) ? stateCoverage.states : [];
  return coverageRows.map((coverage) => {
    const state = String(coverage.state || '').toUpperCase();
    const stateDrops = (drops || []).filter((drop) => String(drop.state || drop.state_code || '').toUpperCase() === state);
    const stateAlerts = (alerts || []).filter((alert) => String(alert.state || '').toUpperCase() === state && alert.eligibleForDelivery === true);
    const sources = new Set();
    let freshestObservedAt = null;
    let freshestMs = -Infinity;
    let storeLevelDropCount = 0;
    for (const drop of stateDrops) {
      const source = drop.sourceUrl || drop.source_url || drop.source || drop.sourceLabel || drop.retailer;
      if (source) sources.add(String(source));
      const precision = String(drop.locationPrecision || drop.location_precision || '');
      if (precision === 'store_level' || drop.storeId || drop.store_id || drop.storeAddress || drop.store_address) storeLevelDropCount += 1;
      for (const value of [drop.sourceEventAt, drop.source_event_at, drop.observedAt, drop.observed_at, drop.timestamp, drop.lastSeenAt]) {
        const parsed = value ? new Date(value).getTime() : NaN;
        if (Number.isFinite(parsed) && parsed > freshestMs) { freshestMs = parsed; freshestObservedAt = new Date(parsed).toISOString(); }
      }
    }
    return {
      state,
      coverageTier: coverage.coverageTier,
      signalCount: coverage.signalCount,
      dropCount: stateDrops.length,
      storeLevelDropCount,
      alertCandidateCount: stateAlerts.length,
      sourceCount: sources.size || number(coverage.sourceCount),
      roadblockCount: coverage.roadblockCount,
      freshestObservedAt,
      status: coverage.status,
    };
  });
}
