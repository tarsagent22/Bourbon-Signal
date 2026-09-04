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

// Release quality is not alert authority. Keep downstream identity/lifecycle/alert
// guards intact. Inventory confirmation has a two-hour TTL; watch events 72h.
export const QUALITY_FUTURE_TOLERANCE_MS = 5 * 60_000;
export const QUALITY_MIN_FRESH_RATIO = 0.75;

function freshnessHours(value, nowMs = Date.now()) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) && parsed <= nowMs + QUALITY_FUTURE_TOLERANCE_MS
    ? Math.max(0, (nowMs - parsed) / 3_600_000) : null;
}

function evidenceFor(drop) {
  return {
    // Explicit confirmation wins even when malformed: do not launder it using
    // a more recent crawl, publication or source-event timestamp.
    confirmedAt: drop.lastConfirmedAt ?? drop.last_confirmed_at
      ?? drop.inventoryCheckedAt ?? drop.observedAt ?? drop.observed_at ?? null,
    eventAt: drop.sourceEventAt ?? drop.source_event_at ?? drop.eventAt ?? drop.event_at
      ?? drop.firstSeenAt ?? drop.timestamp ?? null,
    store: drop.storeId || drop.store_id || drop.storeAddress || drop.store_address || null,
    area: drop.area || drop.regionId || drop.city || drop.county || null,
    inventory: drop.canAlertAsInventory === true || drop.dataLane === 'onsite_inventory'
      || /inventory/iu.test(String(drop.type || drop.eventType || '')),
    stale: drop.stale === true || drop.sourceStale === true || drop.source_stale === true
      || drop.raw?.sourceRuntimeNonAlertable === true,
  };
}

function ageDistribution(values) {
  const ages = values.filter((value) => value !== null).sort((a, b) => a - b);
  const percentile = (p) => ages.length ? ages[Math.max(0, Math.ceil(ages.length * p) - 1)] : null;
  return { p50: percentile(0.5), p95: percentile(0.95), max: ages.at(-1) ?? null };
}

function evaluateFreshness(input, nowMs, liveStore, watchLane) {
  const maxAgeHours = liveStore ? 2 : watchLane ? 72 : 24;
  const rows = Array.isArray(input.freshnessEvidence) ? input.freshnessEvidence : null;
  // Compatibility for callers supplying aggregate quality inputs. Production
  // buildStateQualityInputs always supplies row evidence and distribution.
  const evidence = rows ?? [{ confirmedAt: input.freshestObservedAt, eventAt: input.freshestObservedAt }];
  const confirmationAges = evidence.map((row) => freshnessHours(row.confirmedAt, nowMs));
  const eventAges = evidence.map((row) => freshnessHours(row.eventAt, nowMs));
  const relevantAges = liveStore ? confirmationAges : evidence.map((row, i) => row.eventAt != null ? eventAges[i] : confirmationAges[i]);
  let futureRowCount = 0;
  const fresh = evidence.map((row, i) => {
    const value = liveStore ? row.confirmedAt : row.eventAt ?? row.confirmedAt;
    if (Date.parse(value || '') > nowMs + QUALITY_FUTURE_TOLERANCE_MS) futureRowCount += 1;
    return !row.stale && (!liveStore || row.inventory !== false)
      && relevantAges[i] !== null && relevantAges[i] <= maxAgeHours;
  });
  const groupRatio = (key) => {
    const all = new Set(evidence.map((row) => row[key]).filter(Boolean));
    const usable = new Set(evidence.filter((row, i) => fresh[i]).map((row) => row[key]).filter(Boolean));
    return all.size ? usable.size / all.size : null;
  };
  const freshRowCount = fresh.filter(Boolean).length;
  const freshRowRatio = evidence.length ? freshRowCount / evidence.length : 0;
  const freshStoreRatio = groupRatio('store');
  const freshAreaRatio = groupRatio('area');
  const validAges = relevantAges.filter((age) => age !== null);
  const blocked = !freshRowCount || freshRowRatio < QUALITY_MIN_FRESH_RATIO
    || (liveStore && [freshStoreRatio, freshAreaRatio].some((ratio) => ratio !== null && ratio < QUALITY_MIN_FRESH_RATIO));
  return {
    basis: liveStore ? 'inventory_confirmation' : 'source_event',
    maxAgeHours, minFreshRatio: QUALITY_MIN_FRESH_RATIO,
    distributionKnown: rows !== null, rowCount: evidence.length,
    freshRowCount, freshRowRatio, freshStoreRatio, freshAreaRatio,
    futureRowCount, unknownRowCount: relevantAges.filter((age) => age === null).length - futureRowCount,
    confirmationAgeHours: ageDistribution(confirmationAges), eventAgeHours: ageDistribution(eventAges),
    freshestAgeHours: validAges.length ? Math.min(...validAges) : null,
    eligible: !blocked,
  };
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function scoreStateQuality(input, options = {}) {
  const nowMs = options.nowMs ?? Date.now();
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
    ...(Array.isArray(input.freshnessEvidence) ? { freshnessEvidence: input.freshnessEvidence } : {}),
    status: String(input.status || 'unknown'),
  };
  const liveStore = LIVE_STORE_TIERS.has(normalized.coverageTier);
  const watchLane = WATCH_TIERS.has(normalized.coverageTier);
  const freshness = evaluateFreshness(normalized, nowMs, liveStore, watchLane);
  const ageHours = freshness.freshestAgeHours;
  const weaknesses = [];
  if (!freshness.eligible) weaknesses.push('insufficient_fresh_evidence');
  if (freshness.futureRowCount) weaknesses.push('future_freshness');

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
  const hardBlock = !freshness.eligible || weaknesses.includes('unknown_freshness')
    || weaknesses.includes('no_public_drops')
    || (liveStore && weaknesses.includes('no_store_level_drops'))
    || /failed/iu.test(normalized.status);

  return {
    state: normalized.state,
    coverageTier: normalized.coverageTier,
    score,
    threshold,
    releaseEligible: score >= threshold && !hardBlock,
    freshness,
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
    .map((input) => scoreStateQuality(input, { nowMs: nowMs ?? new Date(generatedAt).getTime() }))
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
    if (attempted.has(stateId) && !preserved.has(stateId)) return state;
    const prior = previousByState.get(stateId) || state;
    // Preserve history, not an expired eligibility decision from a prior clock.
    return prior.input && current.generatedAt
      ? scoreStateQuality(prior.input, { nowMs: Date.parse(current.generatedAt) }) : prior;
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
    // Positive retained volume cannot waive freshness. An empty/non-alerting
    // partition has no positive evidence to validate and must not prevent a
    // sold-out observation or an unrelated fresh partition from publishing.
    const hasPositiveRows = number(state.input?.dropCount ?? state.dropCount) > 0;
    if (hasPositiveRows && (state.freshness?.eligible === false || (state.weaknesses || []).includes('insufficient_fresh_evidence'))) {
      // State admission and global snapshot publication are separate: the
      // score remains ineligible, but this must not freeze healthy partitions.
      warnings.push(`${state.state}: insufficient fresh evidence for release quality.`);
    }
    const before = previousByState.get(state.state);
    if (!before) continue;
    const priorDrops = number(before.input?.dropCount ?? before.dropCount);
    const currentDrops = number(state.input?.dropCount ?? state.dropCount);
    const currentStatus = String(state.input?.status || '');
    const preservedFallback = /quality_fallback/iu.test(currentStatus)
      && currentDrops >= Math.floor(priorDrops * minDropRatio);
    const hardWeaknesses = new Set(['unknown_freshness', 'no_public_drops', 'no_store_level_drops', 'degraded_state_status']);
    const hardSourceFailure = (state.weaknesses || []).some((weakness) => hardWeaknesses.has(weakness))
      || /stale|failed|degraded/iu.test(currentStatus);
    if (number(before.score) - number(state.score) > maxScoreDrop) {
      if (preservedFallback) warnings.push(`${state.state}: quality score fell from ${before.score} to ${state.score} while the last-good rows remain preserved.`);
      else failures.push(`${state.state}: quality score fell from ${before.score} to ${state.score}.`);
    }
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
    const alertCapableDrops = stateDrops.filter((drop) => drop.canAlertAsInventory === true || drop.canAlertAsWatch === true);
    const sources = new Set();
    let freshestObservedAt = null;
    let freshestMs = -Infinity;
    let storeLevelDropCount = 0;
    const freshnessEvidence = stateDrops.map(evidenceFor);
    for (const drop of stateDrops) {
      const source = drop.sourceUrl || drop.source_url || drop.source || drop.sourceLabel || drop.retailer;
      if (source) sources.add(String(source));
      const precision = String(drop.locationPrecision || drop.location_precision || '');
      if (precision === 'store_level' || drop.storeId || drop.store_id || drop.storeAddress || drop.store_address) storeLevelDropCount += 1;
      const evidence = evidenceFor(drop);
      for (const value of [LIVE_STORE_TIERS.has(coverage.coverageTier) ? evidence.confirmedAt : evidence.eventAt ?? evidence.confirmedAt]) {
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
      alertCandidateCount: Math.max(stateAlerts.length, alertCapableDrops.length),
      sourceCount: sources.size || number(coverage.sourceCount),
      roadblockCount: coverage.roadblockCount,
      freshestObservedAt,
      freshnessEvidence,
      status: coverage.status,
    };
  });
}
