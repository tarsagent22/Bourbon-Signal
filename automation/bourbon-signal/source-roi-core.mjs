function asString(value) { return typeof value === 'string' ? value : ''; }
function stateKey(row) { return asString(row.state || row.state_code).toUpperCase(); }
function sourceKey(row) { return asString(row.source || row.sourceLabel || row.type || 'unknown'); }
function isStoreLevel(row) { return asString(row.locationPrecision || row.location_precision).toLowerCase() === 'store_level'; }
function normalizedBottleKey(value) { return asString(value).toLowerCase().replace(/&/g, ' and ').replace(/[\u2019']/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function bottleKeys(row) {
  return new Set([
    row.bottle_id,
    row.canonical_id,
    row.canonical_key,
    row.bottle,
    row.bottleName,
    row.rawName,
    row.canonicalName,
    row.canonical_name,
  ].map(normalizedBottleKey).filter(Boolean));
}
function valueWeight(row) {
  const text = `${row.bottle || row.bottleName || row.rawName || ''} ${row.tier || ''} ${row.priorityClass || ''}`.toLowerCase();
  let score = 1;
  if (/major|unicorn|allocated/.test(text)) score += 8;
  if (/weller|blanton|eagle rare|stagg|taylor|van winkle|old fitz|birthday|russell|four roses|elmer|booker|baker|blood oath/.test(text)) score += 5;
  if (isStoreLevel(row)) score += 3;
  return score;
}
function emptySource(state, source) {
  return { state, source, rows: 0, drops: 0, alerts: 0, storeLevel: 0, valueScore: 0, bottles: new Set(), bottleKeys: new Set(), cities: new Set(), roadblocks: 0, topIssues: [] };
}

function boundedNumber(value, max = 1_000_000) { return Math.min(max, Math.max(0, Number(value) || 0)); }
function normalizedAuthority(value) {
  const authority = asString(value).toLowerCase();
  return ['official', 'first_party', 'verified', 'unknown'].includes(authority) ? authority : 'unknown';
}
function expansionScore(candidate) {
  const aggregateDemand = boundedNumber(candidate.aggregateDemand ?? candidate.demandScore);
  const paidMemberOverlap = boundedNumber(candidate.paidMemberOverlap);
  const canonicalBottleDemand = boundedNumber(candidate.canonicalBottleDemand);
  const exactStoreGap = boundedNumber(candidate.exactStoreGap, 100);
  const alertGradeGap = boundedNumber(candidate.alertGradeGap, 100);
  const reachability = Math.min(1, boundedNumber(candidate.runnerReachability, 1));
  const stability = Math.min(1, boundedNumber(candidate.sourceStability, 1));
  const requestBudget = boundedNumber(candidate.expectedRequestBudget, 10_000);
  const effort = Math.min(5, Math.max(1, Number.isFinite(Number(candidate.implementationEffort)) ? boundedNumber(candidate.implementationEffort, 5) : 5));
  const reversibility = Math.min(5, Math.max(1, Number.isFinite(Number(candidate.reversibility)) ? boundedNumber(candidate.reversibility, 5) : 5));
  const adjacency = Math.min(10, boundedNumber(candidate.strategicAdjacency, 10));
  const authority = normalizedAuthority(candidate.sourceAuthority);
  const coverageTier = asString(candidate.coverageTier).toLowerCase();
  const coverageGap = /research|unknown|none/.test(coverageTier) ? 24 : /watch|catalog|board/.test(coverageTier) ? 15 : 5;
  const authorityScore = ({ official: 28, first_party: 25, verified: 12, unknown: 0 })[authority];
  const demandScore = Math.round(Math.min(40, aggregateDemand * 0.5) + Math.min(25, paidMemberOverlap * 3) + Math.min(25, canonicalBottleDemand * 2));
  const score = Math.round(demandScore + coverageGap + Math.min(18, exactStoreGap * 2) + Math.min(12, alertGradeGap * 2) + authorityScore + reachability * 20 + stability * 15 + adjacency * 2 + (6 - reversibility) * 4 - Math.min(18, requestBudget / 10) - effort * 6);
  const ready = ['official', 'first_party'].includes(authority) && reachability >= 0.7 && stability >= 0.7 && effort <= 3 && reversibility <= 2;
  return {
    state: stateKey(candidate),
    source: sourceKey(candidate),
    score,
    recommendation: ready ? 'expand_state_vertical_slice' : 'research_or_harden_source',
    demandScore,
    rankingInputs: { aggregateDemand, paidMemberOverlap, canonicalBottleDemand, coverageTier: coverageTier || 'unknown', exactStoreGap, alertGradeGap, sourceAuthority: authority, runnerReachability: reachability, expectedRequestBudget: requestBudget, sourceStability: stability, implementationEffort: effort, reversibility, strategicAdjacency: adjacency },
  };
}
function addSource(map, row, type) {
  const state = stateKey(row);
  const source = sourceKey(row);
  if (!state || !source) return;
  const key = `${state}|${source}`;
  if (!map.has(key)) map.set(key, emptySource(state, source));
  const item = map.get(key);
  item.rows += 1;
  if (type === 'drop') item.drops += 1;
  if (type === 'alert') item.alerts += 1;
  if (isStoreLevel(row)) item.storeLevel += 1;
  item.valueScore += valueWeight(row);
  const bottle = asString(row.bottle || row.bottleName || row.rawName || row.canonicalName || row.canonical_name);
  if (bottle) item.bottles.add(bottle);
  for (const key of bottleKeys(row)) item.bottleKeys.add(key);
  const city = asString(row.city || row.storeCity);
  if (city) item.cities.add(city);
}

export function rankSourceInvestments({ drops = [], alerts = [], sourceHealth = { states: [] }, demand = null, expansionCandidates = [], generatedAt = new Date().toISOString() } = {}) {
  const map = new Map();
  for (const row of drops || []) addSource(map, row, 'drop');
  for (const row of alerts || []) addSource(map, row, 'alert');
  for (const state of sourceHealth?.states || []) {
    for (const issue of state.topRoadblocks || state.roadblocks || []) {
      const source = asString(issue.source || issue.id || 'unknown');
      const key = `${state.state}|${source}`;
      if (!map.has(key)) map.set(key, emptySource(state.state, source));
      const item = map.get(key);
      item.roadblocks += 1;
      item.topIssues.push(`${issue.status || 'roadblock'} ${issue.error || ''}`.trim());
    }
  }

  const hasSafeAggregationFloor = Number(demand?.privacy?.minimumEventCount) >= 5
    && demand?.privacy?.aggregationUnit === 'event'
    && demand?.privacy?.distinctSubjectsMeasured === false;
  const privacySafeDemand = demand?.privacy?.containsPii === false
    && demand?.privacy?.containsRawHistory === false
    && hasSafeAggregationFloor
    && Array.isArray(demand?.geographies)
    && Array.isArray(demand?.bottles)
    ? demand
    : null;
  const safeWeight = (value) => Math.min(1_000_000, Math.max(0, Number(value) || 0));
  const geographyDemand = new Map((privacySafeDemand?.geographies || []).map((item) => [asString(item.state).toUpperCase(), safeWeight(item.weightedDemand)]));
  const bottleDemand = (privacySafeDemand?.bottles || []).map((item) => ({
    keys: new Set([item.canonicalBottleId, item.canonicalBottleName].map(normalizedBottleKey).filter(Boolean)),
    weight: safeWeight(item.weightedDemand),
  }));
  const rows = [...map.values()].map((item) => {
    const repairPressure = item.roadblocks ? Math.min(35, item.roadblocks * 8) : 0;
    const matchedBottleDemand = bottleDemand.reduce((total, bottle) => (
      [...bottle.keys].some((key) => item.bottleKeys.has(key)) ? total + bottle.weight : total
    ), 0);
    const demandScore = Math.round((geographyDemand.get(item.state) || 0) + matchedBottleDemand);
    const score = Math.round(item.valueScore + item.alerts * 10 + item.storeLevel * 2 + item.bottles.size * 3 + item.cities.size + repairPressure + demandScore - Math.max(0, item.rows - item.alerts - item.storeLevel) * 0.05);
    let recommendation = 'monitor';
    if (item.roadblocks && (item.alerts || item.storeLevel || item.valueScore > 30 || demandScore >= 25)) recommendation = 'repair_high_value_source';
    else if (item.alerts >= 10 || item.valueScore >= 80 || demandScore >= 75) recommendation = 'protect_and_expand';
    else if (item.storeLevel >= 20 || demandScore >= 25) recommendation = 'expand_target_mesh';
    else if (item.rows >= 100 && item.alerts === 0 && demandScore === 0) recommendation = 'demote_or_tighten_noise';
    return {
      state: item.state,
      source: item.source,
      score,
      demandScore,
      recommendation,
      rows: item.rows,
      drops: item.drops,
      alerts: item.alerts,
      storeLevel: item.storeLevel,
      uniqueBottles: item.bottles.size,
      uniqueCities: item.cities.size,
      roadblocks: item.roadblocks,
      topIssues: item.topIssues.slice(0, 3),
    };
  }).sort((a, b) => b.score - a.score || b.demandScore - a.demandScore);

  const expansionTop = (Array.isArray(expansionCandidates) ? expansionCandidates : [])
    .map(expansionScore)
    .filter((row) => row.state && row.source)
    .sort((left, right) => right.score - left.score || right.demandScore - left.demandScore || left.state.localeCompare(right.state) || left.source.localeCompare(right.source))
    .slice(0, 30);

  return {
    generatedAt,
    count: rows.length,
    demandWeighted: Boolean(privacySafeDemand),
    demandPrivacy: privacySafeDemand?.privacy || null,
    top: rows.slice(0, 30),
    expansionTop,
    expansionCount: expansionTop.length,
    recommendations: rows.reduce((acc, row) => {
      acc[row.recommendation] = (acc[row.recommendation] || 0) + 1;
      return acc;
    }, {}),
  };
}
