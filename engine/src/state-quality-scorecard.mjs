import { isDeepStrictEqual } from 'node:util';

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
export const STATE_QUALITY_SCHEMA_VERSION = 3;

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
    ...(input.freshnessEvidenceOrigin ? { freshnessEvidenceOrigin: input.freshnessEvidenceOrigin } : {}),
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
    // Aggregate-only callers retain their legacy label; never claim row-level
    // semantics merely because this process runs the new scorer.
    schemaVersion: inputs.every((input) => Array.isArray(input.freshnessEvidence)) ? STATE_QUALITY_SCHEMA_VERSION : 2,
    generatedAt,
    summary: summarizeStateQuality(states),
    states,
  };
}

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.length > 0;
const nullableText = value => value === null || text(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);

export function assertStateQualityBaseline(previous, { acceptedStates } = {}) {
  if (!Array.isArray(previous?.states) || !previous.states.length || !Number.isFinite(Date.parse(previous.generatedAt))) {
    throw new Error('State-quality baseline is missing states or its evaluation clock.');
  }
  const seen = new Set();
  for (const row of previous.states) {
    const fail = detail => { throw new Error(`${row?.state}: invalid state-quality baseline ${detail}.`); };
    if (!object(row) || !/^[A-Z]+(?:-[A-Z]+)*$/.test(row.state) || seen.has(row.state)) fail('state identity or duplicate row');
    seen.add(row.state);
    if (!object(row.input) || row.input.state !== row.state || !text(row.coverageTier)
      || row.input.coverageTier !== row.coverageTier || !text(row.input.status)) fail('input identity');
    for (const field of ['score', 'threshold']) if (!finite(row[field])) fail(field);
    if (typeof row.releaseEligible !== 'boolean' || !Array.isArray(row.weaknesses)
      || row.weaknesses.some(value => !text(value))) fail('comparator fields');
    if (!(row.freshnessHours === null || finite(row.freshnessHours))) fail('freshnessHours');
    for (const field of ['signalCount', 'dropCount', 'storeLevelDropCount', 'alertCandidateCount', 'sourceCount', 'roadblockCount']) {
      if (!finite(row.input[field]) || row.input[field] < 0) fail(`input ${field}`);
    }
    if (!nullableText(row.input.freshestObservedAt)) fail('input freshestObservedAt');
    for (const field of ['freshness', 'volume', 'precision', 'alerts', 'sourceDiversity', 'reliability']) {
      if (!finite(row.dimensions?.[field])) fail(`dimension ${field}`);
    }
    const hasEvidence = Object.hasOwn(row.input, 'freshnessEvidence');
    if (previous.schemaVersion === STATE_QUALITY_SCHEMA_VERSION || hasEvidence) {
      const evidence = row.input.freshnessEvidence;
      if (!Array.isArray(evidence) || evidence.length < row.input.dropCount) fail('per-drop freshness evidence');
      for (const item of evidence) {
        // Invalid timestamp strings remain unknown evidence, never fresh clocks.
        // Migration's explicit unknown placeholders contain just the two clocks.
        if (!object(item) || !nullableText(item.confirmedAt) || !nullableText(item.eventAt)
          || ['store', 'area'].some(key => Object.hasOwn(item, key) && !nullableText(item[key]))
          || ['inventory', 'stale'].some(key => Object.hasOwn(item, key) && typeof item[key] !== 'boolean')) fail('freshness evidence structure');
      }
      if (row.freshness?.distributionKnown !== true) fail('freshness evidence distribution');
      const freshness = row.freshness;
      if (!['inventory_confirmation', 'source_event'].includes(freshness.basis) || typeof freshness.eligible !== 'boolean') fail('freshness evidence fields');
      for (const field of ['maxAgeHours', 'minFreshRatio', 'rowCount', 'freshRowCount', 'freshRowRatio', 'futureRowCount', 'unknownRowCount']) {
        if (!finite(freshness[field])) fail(`freshness evidence ${field}`);
      }
      for (const field of ['freshStoreRatio', 'freshAreaRatio', 'freshestAgeHours']) {
        if (!(freshness[field] === null || finite(freshness[field]))) fail(`freshness evidence ${field}`);
      }
      for (const field of ['confirmationAgeHours', 'eventAgeHours']) for (const key of ['p50', 'p95', 'max']) {
        const value = freshness[field]?.[key];
        if (!(value === null || finite(value))) fail(`freshness evidence ${field}.${key}`);
      }
      if (freshness.rowCount !== evidence.length) fail('freshness evidence row count');
    }
    const expected = scoreStateQuality(row.input, { nowMs: Date.parse(previous.generatedAt) });
    if (previous.schemaVersion === 2) {
      // Validate legacy arithmetic without imposing new freshness semantics on
      // its scalar dimension. Non-freshness scoring is unchanged by migration.
      for (const field of ['volume', 'precision', 'alerts', 'sourceDiversity', 'reliability']) {
        if (row.dimensions[field] !== expected.dimensions[field]) fail(`inconsistent dimension ${field}`);
      }
      if (row.threshold !== expected.threshold || row.score !== expected.score - expected.dimensions.freshness + row.dimensions.freshness) fail('inconsistent legacy score');
    }
    if (previous.schemaVersion === STATE_QUALITY_SCHEMA_VERSION) {
      for (const field of ['score', 'threshold', 'releaseEligible', 'freshnessHours', 'dimensions', 'freshness', 'weaknesses']) {
        if (!isDeepStrictEqual(row[field], expected[field])) fail(`inconsistent ${field}`);
      }
    }
  }
  if (acceptedStates && (seen.size !== acceptedStates.size || [...acceptedStates].some(state => !seen.has(state)))) {
    throw new Error('State-quality baseline states do not match complete accepted coverage.');
  }
}

function assertEvidenceBaseline(previous) {
  assertStateQualityBaseline(previous);
}

// Only freshness semantics changed. Keep accepted volume, alert capability,
// reliability and source diversity: the published feed can be capped or include
// history, so rebuilding these dimensions would silently reset real guards.
// Callers must supply the validated, accepted (never candidate) site drops.
export function migrateStateQualityBaseline(previous, { drops } = {}) {
  if (!previous || ![2, STATE_QUALITY_SCHEMA_VERSION].includes(previous.schemaVersion)) {
    throw new Error('Unsupported or missing state-quality baseline schema version.');
  }
  assertStateQualityBaseline(previous);
  if (previous.schemaVersion === STATE_QUALITY_SCHEMA_VERSION) {
    assertEvidenceBaseline(previous);
    return previous;
  }
  if (!Array.isArray(drops) || !Array.isArray(previous.states) || !Number.isFinite(Date.parse(previous.generatedAt))) {
    throw new Error('State-quality migration requires accepted baseline drops, states and evaluation clock.');
  }
  const inputs = previous.states.map((row) => {
    if (!row.input || row.input.state !== row.state) throw new Error(`${row.state}: missing accepted quality input.`);
    if (Array.isArray(row.input.freshnessEvidence)) return row.input;
    const stateDrops = drops.filter((drop) => String(drop.state || drop.state_code || '').toUpperCase() === row.state);
    if (number(row.input.dropCount) > 0 && !stateDrops.length) throw new Error(`${row.state}: missing accepted baseline drop evidence.`);
    const [derived] = buildStateQualityInputs({ stateCoverage: { states: [row.input] }, drops: stateDrops, alerts: [] });
    // Missing original quality rows cannot acquire freshness from a capped feed.
    // Count them as unknown; retain all available historical clocks, not only the
    // freshest N. This is published evidence, not a reconstructed source snapshot.
    const missingRows = Math.max(0, number(row.input.dropCount) - stateDrops.length);
    const freshnessEvidence = [...derived.freshnessEvidence, ...Array.from({ length: missingRows }, () => ({ confirmedAt: null, eventAt: null }))];
    return {
      ...row.input,
      freshestObservedAt: derived.freshestObservedAt,
      freshnessEvidence,
      freshnessEvidenceOrigin: { kind: 'accepted_public_drops', runId: previous.runId || null, generatedAt: previous.generatedAt, publishedRowCount: stateDrops.length, unknownRowCount: missingRows },
    };
  });
  // Re-evaluate at the original clock for comparison; partial retention separately
  // ages these same anchors at the new clock. Do not erase real subsequent aging.
  const migrated = { ...previous, ...buildStateQualityScorecard(inputs, { generatedAt: previous.generatedAt }), baselineMigration: { fromSchemaVersion: 2, toSchemaVersion: STATE_QUALITY_SCHEMA_VERSION, sourceRunId: previous.runId || null } };
  assertEvidenceBaseline(migrated);
  return migrated;
}

export function mergePartialRefreshStateQuality(previous, current, summary = {}) {
  if (current?.schemaVersion === STATE_QUALITY_SCHEMA_VERSION && previous) {
    if (previous.schemaVersion !== STATE_QUALITY_SCHEMA_VERSION) throw new Error('State-quality baseline requires migration before partial retention.');
    assertEvidenceBaseline(previous);
  }
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
