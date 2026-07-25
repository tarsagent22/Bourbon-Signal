import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { stableId } from '../core/text.mjs';
import { classifyRoadblock } from '../roadblock-health.mjs';

export const SOURCE_USEFULNESS_CONTRACT_VERSION = 'bourbon-signal-source-usefulness-v1';
export const DEFAULT_FRESH_ALERT_HOURS = 24;

const EXCLUDED_RELIABILITY_OUTCOMES = new Set(['not_due', 'disabled', 'quarantined']);
const SUCCESS_OUTCOMES = new Set(['success']);
const CATALOG_WATCH_RE = /catalog|document|surface|policy|context|location|license|watch/i;
const USEFUL_SIGNAL_RE = /inventory|allocation|shipment|delivery|release|lottery|raffle|drop/i;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boundedNumber(value, min, max, fallback = 0) {
  const number = finiteNumber(value);
  return Math.min(max, Math.max(min, number == null ? fallback : number));
}

function stateId(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizedAlias(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\((?:precision probe|browser discovery|fallback)\)\s*$/u, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedUrl(value) {
  try {
    const url = new URL(String(value || ''));
    url.hash = '';
    return url.toString().replace(/\/$/u, '').toLowerCase();
  } catch {
    return String(value || '').trim().toLowerCase().replace(/\/$/u, '');
  }
}

function rowLabel(row = {}) {
  return String(row.sourceLabel || row.source || row.label || '').trim();
}

function rowUrl(row = {}) {
  return String(row.sourceUrl || row.url || '').trim();
}

function rowRuntimeId(row = {}) {
  return String(row.sourceRuntimeId || row.sourceId || '').trim();
}

function rowState(row = {}, fallback = '') {
  return stateId(row.state || row.stateId || row.sourceMetadata?.stateId || fallback);
}

function storeIdentity(row = {}) {
  return String(row.storeId || row.store_id || row.storeName || row.locationName || '').trim();
}

function exactStoreRow(row = {}) {
  return String(row.locationPrecision || row.location_precision || '').toLowerCase() === 'store_level'
    && Boolean(storeIdentity(row));
}

function rowIsStale(row = {}) {
  return row.stale === true
    || row.sourceStale === true
    || row.source_stale === true
    || row.raw?.sourceRuntimeNonAlertable === true;
}

function rowAgeHours(row, generatedAt) {
  const explicit = finiteNumber(row.freshnessHours ?? row.freshness_hours);
  if (explicit != null) return Math.max(0, explicit);
  const observed = Date.parse(row.observedAt || row.lastConfirmedAt || row.fetchedAt || row.eventAt || '');
  const generated = Date.parse(generatedAt || '');
  return Number.isFinite(observed) && Number.isFinite(generated)
    ? Math.max(0, (generated - observed) / 3_600_000)
    : null;
}

function freshDeliveryAlert(row, generatedAt, defaultFreshHours) {
  if (row.eligibleForDelivery !== true || !exactStoreRow(row) || rowIsStale(row)) return false;
  const ageHours = rowAgeHours(row, generatedAt);
  if (ageHours == null) return false;
  const policyHours = finiteNumber(row.freshnessPolicyHours?.onSite);
  const maxHours = Math.min(defaultFreshHours, policyHours == null ? defaultFreshHours : Math.max(0, policyHours));
  return ageHours <= maxHours;
}

function alertValue(row) {
  const priority = {
    critical: 8,
    major: 6,
    high: 5,
    standard: 3,
    normal: 2,
  }[String(row.priorityClass || '').toLowerCase()] || 2;
  const tier = {
    unicorn: 5,
    allocated: 4,
    limited: 3,
    tracked: 2,
  }[String(row.tier || '').toLowerCase()] || 1;
  const age = Math.max(0, finiteNumber(row.freshnessHours) ?? 24);
  const freshness = age <= 2 ? 4 : age <= 6 ? 3 : age <= 12 ? 2 : 1;
  return priority + tier + freshness;
}

function signalIdentity(row, prefix) {
  return String(row.id || row.dedupeKey || row.key || stableId([
    prefix,
    row.state,
    row.sourceRuntimeId,
    row.sourceLabel || row.source,
    row.eventType || row.type,
    row.canonicalBottleId || row.canonicalId || row.bottle,
    storeIdentity(row),
    row.sourceUrl,
  ]));
}

function runtimeMs(startedAt, finishedAt) {
  const started = Date.parse(startedAt || '');
  const finished = Date.parse(finishedAt || '');
  return Number.isFinite(started) && Number.isFinite(finished) && finished >= started
    ? finished - started
    : null;
}

function percentile95(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

function emptyLane({ sourceId, state, label, url, derived = false }) {
  return {
    sourceId,
    state,
    derived,
    labels: new Set(label ? [label] : []),
    urls: new Set(url ? [url] : []),
    latestStatuses: new Set(),
    usefulSignalIds: new Set(),
    catalogWatchSignalIds: new Set(),
    exactStoreSignalIds: new Set(),
    freshAlertIds: new Set(),
    monitoredStores: new Set(),
    exactStoreAlertValue: 0,
    roadblocks: [],
    historyRuntimeSamples: [],
    currentRuntimeSamples: [],
  };
}

function addAlias(aliasIndex, key, sourceId) {
  if (!key) return;
  if (!aliasIndex.has(key)) aliasIndex.set(key, new Set());
  aliasIndex.get(key).add(sourceId);
}

function aliasesFor(state, label, url) {
  const normalizedLabel = normalizedAlias(label);
  const normalizedSourceUrl = normalizedUrl(url);
  return {
    pair: normalizedLabel && normalizedSourceUrl ? `${state}|pair:${normalizedLabel}|${normalizedSourceUrl}` : null,
    label: normalizedLabel ? `${state}|label:${normalizedLabel}` : null,
    url: normalizedSourceUrl ? `${state}|url:${normalizedSourceUrl}` : null,
  };
}

function deterministicLaneId(state, label, url) {
  return `untracked:${stableId([state || 'unknown', normalizedAlias(label) || 'unknown', normalizedUrl(url) || 'unknown'])}`;
}

function sourceMetricsFor(stateRunMetrics, state) {
  const metrics = stateRunMetrics?.[state] || {};
  const probes = Math.max(0, finiteNumber(metrics.probes) || 0);
  const usefulChanges = Math.max(0, finiteNumber(metrics.usefulChanges) || 0);
  const failures = Math.max(0, finiteNumber(metrics.failures) || 0);
  return {
    stateProbeCount: probes,
    stateUsefulChangeCount: usefulChanges,
    stateUsefulChangeRatio: probes ? Math.min(1, usefulChanges / probes) : null,
    stateFailureCount: failures,
    stateFailureRatio: probes ? Math.min(1, failures / probes) : null,
    stateLastRuntimeMs: finiteNumber(metrics.lastRuntimeMs),
  };
}

function sourceReliability(sourceId, sourceSloIndex, historyObservations, latestStatuses) {
  const slo = sourceSloIndex.get(sourceId);
  if (slo && finiteNumber(slo.availabilityRatio) != null) {
    return {
      reliabilityRatio: boundedNumber(slo.availabilityRatio, 0, 1),
      reliabilitySampleCount: Math.max(0, finiteNumber(slo.observedSampleCount) || 0),
      reliabilitySource: 'source_slo_7d',
    };
  }
  const eligible = historyObservations.filter((observation) => (
    observation?.sourceId === sourceId
    && !EXCLUDED_RELIABILITY_OUTCOMES.has(String(observation.outcome || ''))
  ));
  if (eligible.length) {
    return {
      reliabilityRatio: eligible.filter((observation) => SUCCESS_OUTCOMES.has(String(observation.outcome || ''))).length / eligible.length,
      reliabilitySampleCount: eligible.length,
      reliabilitySource: 'source_run_history',
    };
  }
  if (latestStatuses.size) {
    const statuses = [...latestStatuses];
    return {
      reliabilityRatio: statuses.some((status) => status === 'success' || status === 'not_due') ? 1 : 0,
      reliabilitySampleCount: 1,
      reliabilitySource: 'latest_source_result',
    };
  }
  return {
    reliabilityRatio: null,
    reliabilitySampleCount: 0,
    reliabilitySource: 'unavailable',
  };
}

function evidenceClassFor(metrics) {
  if (metrics.freshExactStoreAlertCount > 0) return 'fresh_exact_store_alert';
  if (metrics.exactStoreSignalCount > 0 || metrics.uniqueMonitoredStoreCount > 0) return 'exact_store_monitoring';
  if (metrics.usefulSignalCount > 0) return 'useful_signal';
  return 'catalog_watch_only';
}

function componentsFor(metrics, stateHealth) {
  const evidenceBase = metrics.freshExactStoreAlertCount > 0
    ? 1_000
    : metrics.exactStoreSignalCount > 0 || metrics.uniqueMonitoredStoreCount > 0
      ? 350
      : metrics.usefulSignalCount > 0 ? 150 : 0;
  const exactStoreAlertValue = Math.min(300, metrics.exactStoreAlertValue * 10);
  const monitoredStoreValue = Math.min(150, Math.round(Math.sqrt(metrics.uniqueMonitoredStoreCount) * 15));
  const usefulSignalValue = Math.min(120, Math.round(Math.log2(metrics.usefulSignalCount + 1) * 20));
  const catalogWatchBreadthValue = Math.min(20, Math.round(Math.log2(metrics.catalogWatchOnlySignalCount + 1) * 2));
  const reliabilityValue = Math.round((metrics.reliabilityRatio == null ? 0.5 : metrics.reliabilityRatio) * 100);
  const stateYieldValue = Math.round((metrics.stateUsefulChangeRatio || 0) * 30);
  const roadblockPenalty = Math.min(150, metrics.roadblockBurden * 15 + (stateHealth?.stale ? 25 : 0));
  const runtimeCostPenalty = metrics.averageRuntimeMs == null
    ? 0
    : Math.min(100, Math.round(Math.log2(1 + metrics.averageRuntimeMs / 1_000) * 10));
  return {
    evidenceBase,
    exactStoreAlertValue,
    monitoredStoreValue,
    usefulSignalValue,
    catalogWatchBreadthValue,
    reliabilityValue,
    stateYieldValue,
    roadblockPenalty,
    runtimeCostPenalty,
  };
}

function recommendationFor(lane) {
  if (lane.evidenceClass === 'fresh_exact_store_alert' && lane.metrics.roadblockBurden > 0) return 'repair_and_protect_alert_lane';
  if (lane.evidenceClass === 'fresh_exact_store_alert') return 'protect_alert_lane';
  if (lane.evidenceClass === 'exact_store_monitoring') return 'harden_for_alert_grade';
  if (lane.evidenceClass === 'useful_signal') return 'improve_store_precision';
  return 'review_catalog_watch_cost';
}

export function buildSourceUsefulnessReport({
  stateReports = [],
  sourceRunHistory = null,
  stateRunMetrics = {},
  sourceHealth = null,
  sourceSlo = null,
  customerDrops = [],
  customerAlerts = [],
  generatedAt = new Date().toISOString(),
  freshAlertHours = DEFAULT_FRESH_ALERT_HOURS,
} = {}) {
  const reports = Array.isArray(stateReports) ? stateReports : [];
  const drops = Array.isArray(customerDrops) ? customerDrops : [];
  const alerts = Array.isArray(customerAlerts) ? customerAlerts : [];
  const historyObservations = Array.isArray(sourceRunHistory?.observations) ? sourceRunHistory.observations : [];
  const sourceSloIndex = new Map((sourceSlo?.sources || []).map((source) => [String(source.sourceId || ''), source]));
  const stateHealthIndex = new Map((sourceHealth?.states || []).map((state) => [stateId(state.state), state]));
  const lanes = new Map();
  const aliasIndex = new Map();

  const ensureLane = ({ state, sourceId, label, url, derived = false }) => {
    const resolvedState = stateId(state);
    const resolvedSourceId = sourceId || deterministicLaneId(resolvedState, label, url);
    if (!lanes.has(resolvedSourceId)) lanes.set(resolvedSourceId, emptyLane({
      sourceId: resolvedSourceId,
      state: resolvedState,
      label,
      url,
      derived: derived || !sourceId,
    }));
    const lane = lanes.get(resolvedSourceId);
    if (!lane.state && resolvedState) lane.state = resolvedState;
    if (label) lane.labels.add(label);
    if (url) lane.urls.add(url);
    const alias = aliasesFor(resolvedState || lane.state, label, url);
    addAlias(aliasIndex, alias.pair, resolvedSourceId);
    addAlias(aliasIndex, alias.label, resolvedSourceId);
    addAlias(aliasIndex, alias.url, resolvedSourceId);
    return lane;
  };

  const uniqueAliasLane = (key) => {
    const candidates = key ? aliasIndex.get(key) : null;
    return candidates?.size === 1 ? lanes.get([...candidates][0]) : null;
  };

  const resolveLane = (row, fallbackState = '') => {
    const state = rowState(row, fallbackState);
    const runtimeId = rowRuntimeId(row);
    if (runtimeId) return ensureLane({
      state,
      sourceId: runtimeId,
      label: rowLabel(row),
      url: rowUrl(row),
    });
    const alias = aliasesFor(state, rowLabel(row), rowUrl(row));
    const matched = uniqueAliasLane(alias.pair) || uniqueAliasLane(alias.label) || uniqueAliasLane(alias.url);
    return matched || ensureLane({
      state,
      label: rowLabel(row),
      url: rowUrl(row),
      derived: true,
    });
  };

  for (const report of reports) {
    const state = rowState(report);
    for (const result of report.sourceResults || []) {
      const lane = ensureLane({
        state: rowState(result, state),
        sourceId: rowRuntimeId(result),
        label: rowLabel(result),
        url: rowUrl(result),
      });
      if (result.status) lane.latestStatuses.add(String(result.status));
      const elapsed = runtimeMs(result.startedAt, result.finishedAt);
      if (
        elapsed != null
        && Number(result.attemptCount ?? 1) > 0
        && !EXCLUDED_RELIABILITY_OUTCOMES.has(String(result.status || ''))
      ) lane.currentRuntimeSamples.push(elapsed);
    }
    for (const source of report.sources || []) {
      ensureLane({
        state: rowState(source, state),
        sourceId: rowRuntimeId(source),
        label: rowLabel(source),
        url: rowUrl(source),
        derived: !rowRuntimeId(source),
      });
    }
  }

  for (const report of reports) {
    const state = rowState(report);
    for (const signal of report.signals || []) {
      const lane = resolveLane(signal, state);
      const identity = signalIdentity(signal, 'signal');
      const exactStore = exactStoreRow(signal);
      const inventoryAlertable = signal.canAlertAsInventory === true && !rowIsStale(signal);
      const catalogWatchOnly = !inventoryAlertable && (
        signal.canAlertAsWatch === true
        || CATALOG_WATCH_RE.test(`${signal.eventType || signal.type || ''} ${signal.locationPrecision || ''}`)
      );
      const hasBottleEvidence = Boolean(
        signal.canonicalBottleId
        || signal.canonicalId
        || signal.canonicalName
        || signal.bottleName
        || finiteNumber(signal.matchedBottleCount) > 0
        || signal.matchedBottles?.length,
      );
      const useful = !rowIsStale(signal) && !catalogWatchOnly && (
        inventoryAlertable
        || (hasBottleEvidence && USEFUL_SIGNAL_RE.test(String(signal.eventType || signal.type || '')))
      );
      if (useful) lane.usefulSignalIds.add(identity);
      if (catalogWatchOnly) lane.catalogWatchSignalIds.add(identity);
      if (exactStore && inventoryAlertable) {
        lane.exactStoreSignalIds.add(identity);
        lane.monitoredStores.add(`${rowState(signal, state)}|${storeIdentity(signal)}`);
      }
    }
    for (const roadblock of report.roadblocks || []) {
      resolveLane(roadblock, state).roadblocks.push(roadblock);
    }
  }

  for (const drop of drops) {
    const lane = resolveLane(drop);
    const identity = signalIdentity(drop, 'customer_drop');
    if (exactStoreRow(drop)) {
      lane.monitoredStores.add(`${rowState(drop)}|${storeIdentity(drop)}`);
      if (drop.canAlertAsInventory === true && !rowIsStale(drop)) lane.exactStoreSignalIds.add(identity);
    }
    if (drop.canAlertAsInventory === true && !rowIsStale(drop)) lane.usefulSignalIds.add(identity);
    else if (drop.canAlertAsWatch === true || CATALOG_WATCH_RE.test(`${drop.type || drop.eventType || ''} ${drop.locationPrecision || ''}`)) {
      lane.catalogWatchSignalIds.add(identity);
    }
  }

  for (const alert of alerts) {
    const lane = resolveLane(alert);
    const identity = signalIdentity(alert, 'customer_alert');
    if (exactStoreRow(alert)) lane.monitoredStores.add(`${rowState(alert)}|${storeIdentity(alert)}`);
    if (freshDeliveryAlert(alert, generatedAt, freshAlertHours)) {
      if (!lane.freshAlertIds.has(identity)) lane.exactStoreAlertValue += alertValue(alert);
      lane.freshAlertIds.add(identity);
      lane.exactStoreSignalIds.add(identity);
      lane.usefulSignalIds.add(identity);
    } else if (alert.eligibleForDelivery === true || alert.canAlertAsWatch === true) {
      lane.catalogWatchSignalIds.add(identity);
    }
  }

  for (const observation of historyObservations) {
    const sourceId = String(observation?.sourceId || '');
    if (!sourceId) continue;
    const lane = lanes.get(sourceId) || ensureLane({
      state: rowState(observation),
      sourceId,
      label: sourceId,
      url: '',
    });
    const elapsed = finiteNumber(observation.runtimeMs) ?? runtimeMs(observation.startedAt, observation.observedAt);
    if (
      elapsed != null
      && elapsed >= 0
      && Number(observation.attemptCount ?? 1) > 0
      && !EXCLUDED_RELIABILITY_OUTCOMES.has(String(observation.outcome || ''))
    ) lane.historyRuntimeSamples.push(elapsed);
  }

  const ranked = [...lanes.values()].map((lane) => {
    const runtimeSamples = lane.historyRuntimeSamples.length ? lane.historyRuntimeSamples : lane.currentRuntimeSamples;
    const averageRuntimeMs = runtimeSamples.length
      ? Math.round(runtimeSamples.reduce((sum, value) => sum + value, 0) / runtimeSamples.length)
      : null;
    const roadblockSummary = lane.roadblocks.reduce((summary, roadblock) => {
      const classification = classifyRoadblock(roadblock);
      summary[classification.severity] += 1;
      summary.burden += classification.severity === 'source_blocked' ? 2 : classification.severity === 'operational_failure' ? 1 : 0;
      return summary;
    }, { expected_negative: 0, source_blocked: 0, operational_failure: 0, burden: 0 });
    const reliability = sourceReliability(lane.sourceId, sourceSloIndex, historyObservations, lane.latestStatuses);
    const stateMetrics = sourceMetricsFor(stateRunMetrics, lane.state);
    const metrics = {
      freshExactStoreAlertCount: lane.freshAlertIds.size,
      exactStoreAlertValue: lane.exactStoreAlertValue,
      uniqueMonitoredStoreCount: lane.monitoredStores.size,
      exactStoreSignalCount: lane.exactStoreSignalIds.size,
      usefulSignalCount: lane.usefulSignalIds.size,
      catalogWatchOnlySignalCount: lane.catalogWatchSignalIds.size,
      ...reliability,
      roadblockCount: lane.roadblocks.length,
      roadblockBurden: roadblockSummary.burden,
      expectedNegativeRoadblockCount: roadblockSummary.expected_negative,
      blockedSourceRoadblockCount: roadblockSummary.source_blocked,
      operationalFailureRoadblockCount: roadblockSummary.operational_failure,
      runtimeSampleCount: runtimeSamples.length,
      averageRuntimeMs,
      p95RuntimeMs: percentile95(runtimeSamples),
      ...stateMetrics,
    };
    const stateHealth = stateHealthIndex.get(lane.state) || null;
    const components = componentsFor(metrics, stateHealth);
    const score = Math.max(0, Math.round(
      components.evidenceBase
      + components.exactStoreAlertValue
      + components.monitoredStoreValue
      + components.usefulSignalValue
      + components.catalogWatchBreadthValue
      + components.reliabilityValue
      + components.stateYieldValue
      - components.roadblockPenalty
      - components.runtimeCostPenalty
    ));
    const labels = [...lane.labels].filter(Boolean).sort((left, right) => left.localeCompare(right));
    const urls = [...lane.urls].filter(Boolean).sort((left, right) => left.localeCompare(right));
    const result = {
      rank: 0,
      state: lane.state || null,
      sourceId: lane.sourceId,
      sourceLabel: labels[0] || lane.sourceId,
      sourceUrl: urls[0] || null,
      derivedLane: lane.derived,
      evidenceClass: evidenceClassFor(metrics),
      score,
      metrics,
      components,
      stateHealth: stateHealth ? {
        status: stateHealth.status || null,
        stale: Boolean(stateHealth.stale),
        roadblockCount: Math.max(0, finiteNumber(stateHealth.roadblockCount) || 0),
        actionableInventorySignalCount: Math.max(0, finiteNumber(stateHealth.actionableInventorySignalCount) || 0),
      } : null,
    };
    result.recommendation = recommendationFor(result);
    return result;
  }).sort((left, right) => (
    right.score - left.score
    || right.metrics.freshExactStoreAlertCount - left.metrics.freshExactStoreAlertCount
    || right.metrics.exactStoreAlertValue - left.metrics.exactStoreAlertValue
    || right.metrics.uniqueMonitoredStoreCount - left.metrics.uniqueMonitoredStoreCount
    || right.metrics.usefulSignalCount - left.metrics.usefulSignalCount
    || (right.metrics.reliabilityRatio ?? -1) - (left.metrics.reliabilityRatio ?? -1)
    || left.metrics.roadblockBurden - right.metrics.roadblockBurden
    || (left.metrics.averageRuntimeMs ?? Number.MAX_SAFE_INTEGER) - (right.metrics.averageRuntimeMs ?? Number.MAX_SAFE_INTEGER)
    || String(left.state || '').localeCompare(String(right.state || ''))
    || left.sourceId.localeCompare(right.sourceId)
  )).map((lane, index) => ({ ...lane, rank: index + 1 }));

  return {
    contractVersion: SOURCE_USEFULNESS_CONTRACT_VERSION,
    generatedAt,
    diagnosticOnly: true,
    rankingPolicy: {
      freshAlertHours,
      alertGradeEvidenceAlwaysOutranksCatalogWatchOnly: true,
      alertGradeEvidenceBase: 1_000,
      maximumCatalogWatchOnlyScore: 150,
      reliabilityWindowDays: sourceSlo?.window?.days || 7,
    },
    inputs: {
      stateReportCount: reports.length,
      sourceHistoryObservationCount: historyObservations.length,
      sourceSloSampleCount: Math.max(0, finiteNumber(sourceSlo?.observedSampleCount) || 0),
      sourceHealthStateCount: sourceHealth?.states?.length || 0,
      stateMetricCount: Object.keys(stateRunMetrics || {}).filter((key) => !key.startsWith('_')).length,
      customerDropCount: drops.length,
      customerAlertCount: alerts.length,
    },
    summary: {
      laneCount: ranked.length,
      freshExactStoreAlertLaneCount: ranked.filter((lane) => lane.evidenceClass === 'fresh_exact_store_alert').length,
      exactStoreMonitoringLaneCount: ranked.filter((lane) => lane.evidenceClass === 'exact_store_monitoring').length,
      usefulSignalLaneCount: ranked.filter((lane) => lane.evidenceClass === 'useful_signal').length,
      catalogWatchOnlyLaneCount: ranked.filter((lane) => lane.evidenceClass === 'catalog_watch_only').length,
    },
    lanes: ranked,
  };
}

export function sourceUsefulnessMarkdown(report) {
  const lines = [
    '# Source usefulness / ROI',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    'This report is diagnostic only; never an alert activation or release gate.',
    '',
    `Fresh exact-store alert window: ${report.rankingPolicy.freshAlertHours} hours. Alert-grade evidence always ranks above catalog/watch-only breadth.`,
    '',
    '| Rank | Score | State | Source lane | Evidence | Fresh alerts | Stores | Useful | Reliability | Roadblock burden | Avg runtime |',
    '|---:|---:|---|---|---|---:|---:|---:|---:|---:|---:|',
  ];
  for (const lane of report.lanes) {
    const reliability = lane.metrics.reliabilityRatio == null ? 'n/a' : `${(lane.metrics.reliabilityRatio * 100).toFixed(1)}%`;
    const runtime = lane.metrics.averageRuntimeMs == null ? 'n/a' : `${Math.round(lane.metrics.averageRuntimeMs / 1_000)}s`;
    lines.push(`| ${lane.rank} | ${lane.score} | ${lane.state || 'n/a'} | ${lane.sourceLabel.replace(/\|/g, '/')} | ${lane.evidenceClass} | ${lane.metrics.freshExactStoreAlertCount} | ${lane.metrics.uniqueMonitoredStoreCount} | ${lane.metrics.usefulSignalCount} | ${reliability} | ${lane.metrics.roadblockBurden} | ${runtime} |`);
  }
  lines.push(
    '',
    '## Interpretation',
    '',
    '- Fresh, delivery-eligible exact-store alerts receive a protected evidence base.',
    '- Unique customer-visible stores and useful non-catalog signals add value.',
    '- Seven-day source reliability and state change yield add confidence.',
    '- Actionable roadblocks and measured runtime add bounded cost.',
    '- Catalog and watch-only breadth is visible but capped so volume cannot displace alert-grade evidence.',
    '',
  );
  return lines.join('\n');
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function readStateReports(statesDirectory) {
  const files = await readdir(statesDirectory).catch(() => []);
  const reports = [];
  for (const file of files.filter((name) => name.endsWith('.json')).sort((left, right) => left.localeCompare(right))) {
    const report = await readJson(path.join(statesDirectory, file), null);
    if (report) reports.push(report);
  }
  return reports;
}

export async function writeSourceUsefulnessArtifacts({ outDirectory = path.resolve('out') } = {}) {
  const [
    stateReports,
    sourceRunHistory,
    stateRunMetrics,
    sourceHealth,
    sourceSlo,
    dropsPayload,
    alertsPayload,
    stats,
  ] = await Promise.all([
    readStateReports(path.join(outDirectory, 'states')),
    readJson(path.join(outDirectory, 'optimization', 'source-run-history.json'), null),
    readJson(path.join(outDirectory, 'optimization', 'state-run-metrics.json'), {}),
    readJson(path.join(outDirectory, 'source-health.json'), null),
    readJson(path.join(outDirectory, 'source-slo-7d.json'), null),
    readJson(path.join(outDirectory, 'site', 'drops.json'), { drops: [] }),
    readJson(path.join(outDirectory, 'site', 'alerts.json'), { alerts: [] }),
    readJson(path.join(outDirectory, 'site', 'stats.json'), {}),
  ]);
  const report = buildSourceUsefulnessReport({
    stateReports,
    sourceRunHistory,
    stateRunMetrics,
    sourceHealth,
    sourceSlo,
    customerDrops: Array.isArray(dropsPayload) ? dropsPayload : dropsPayload?.drops || [],
    customerAlerts: Array.isArray(alertsPayload) ? alertsPayload : alertsPayload?.alerts || [],
    generatedAt: stats?.generatedAt || new Date().toISOString(),
  });
  await mkdir(outDirectory, { recursive: true });
  await Promise.all([
    writeFile(path.join(outDirectory, 'source-usefulness-roi.json'), JSON.stringify(report, null, 2)),
    writeFile(path.join(outDirectory, 'source-usefulness-roi.md'), sourceUsefulnessMarkdown(report)),
  ]);
  return report;
}
