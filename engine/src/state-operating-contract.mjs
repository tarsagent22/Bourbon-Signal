import {
  customerRecordIdentity,
  customerRecordTimestamp,
  hasUnsafeAlertFlags,
  missingCustomerFields,
  projectCustomerSurfaces,
} from './customer-surface-policy.mjs';
import { lifecycleExpectsCustomerVisibleDrops } from './state-lifecycle.mjs';

export const STATE_OPERATING_CONTRACT_VERSION = 'bourbon-signal-state-operating-v1';

const BLOCKING_ANOMALIES = new Set([
  'duplicate_identity_spike',
  'missing_required_customer_fields',
  'stale_or_noninventory_alert_flags',
  'deterministic_collection_failure',
]);

function stateOf(row) {
  return String(row?.state || row?.state_code || '').trim().toUpperCase();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function validTime(...values) {
  for (const value of values) {
    if (Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  }
  return null;
}

function rowsOf(value, key) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.[key]) ? value[key] : [];
}

function newestTimestamp(rows) {
  let newest = null;
  for (const row of rows) {
    const value = customerRecordTimestamp(row);
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && (newest === null || parsed > newest)) newest = parsed;
  }
  return newest === null ? null : new Date(newest).toISOString();
}

function freshnessFor(rows, generatedAt, stale) {
  const observedAt = newestTimestamp(rows);
  const ageHours = observedAt && Number.isFinite(Date.parse(generatedAt))
    ? Math.max(0, Math.round(((Date.parse(generatedAt) - Date.parse(observedAt)) / 3_600_000) * 10) / 10)
    : null;
  const status = stale ? 'stale'
    : ageHours === null ? 'unknown'
      : ageHours <= 24 ? 'fresh'
        : ageHours <= 168 ? 'aging'
          : 'stale';
  return { status, observedAt, ageHours };
}

function collectionSucceeded(status) {
  return /^(?:useful|healthy|success|verified|reachable|fresh)/iu.test(String(status || ''))
    && !/stale|failed|blocked|invalid/iu.test(String(status || ''));
}

function deterministicFailure(status) {
  return /(?:validation|contract|schema|invalid|misconfig|policy_block)/iu.test(String(status || ''));
}

function scheduledReason(state, scheduledVerification) {
  return rowsOf(scheduledVerification?.failures, 'failures')
    .filter((failure) => (failure?.states || []).map((value) => String(value).toUpperCase()).includes(state))
    .map((failure) => [
      failure.reason,
      failure.error,
      failure.command,
    ].filter(Boolean).join(' — ') || 'scheduled verification failed')
    .join('; ') || null;
}

function fallbackFor(state, summary, stateSummary, scheduledVerification) {
  const full = new Set((summary?.fallbackStateIds || []).map((value) => String(value).toUpperCase()));
  const partial = new Set((summary?.partialFallbackStateIds || []).map((value) => String(value).toUpperCase()));
  const scheduledStates = new Set((summary?.scheduledVerificationFailureStateIds || []).map((value) => String(value).toUpperCase()));
  const scheduled = scheduledStates.has(state) ? scheduledReason(state, scheduledVerification) : null;
  if (partial.has(state)) return {
    status: 'partial',
    reason: stateSummary?.staleReason || scheduled || 'Current evidence is combined with safe last-published context.',
  };
  if (full.has(state) || scheduled || stateSummary?.stale === true) return {
    status: 'last_published',
    reason: stateSummary?.staleReason || scheduled || 'Safe last-published context is retained.',
  };
  return { status: 'none', reason: null };
}

function duplicateSpike(rows) {
  const seen = new Set();
  let duplicates = 0;
  for (const row of rows) {
    const identity = customerRecordIdentity(row);
    if (!identity) continue;
    if (seen.has(identity)) duplicates += 1;
    else seen.add(identity);
  }
  return duplicates >= 5 && duplicates / Math.max(rows.length, 1) >= 0.05;
}

function healthFor(anomalies, fallback, customerVisibleDropCount, stateSummary) {
  if (anomalies.some((code) => BLOCKING_ANOMALIES.has(code))) return 'blocked';
  if (fallback.status !== 'none' && customerVisibleDropCount > 0) return 'stale_useful';
  if (fallback.status !== 'none' || anomalies.length || /failed|degraded|blocked/iu.test(String(stateSummary?.status || ''))) return 'degraded';
  return 'healthy';
}

function recoveryFor(health, anomalies, fallback) {
  if (health === 'blocked') return 'manual_validation_required';
  if (anomalies.includes('healthy_collection_publication_not_advanced')) return 'rerun_export_only';
  if (health === 'degraded' || health === 'stale_useful') return 'retry_state_collection';
  if (fallback.status !== 'none') return 'retain_stale_nonalertable';
  return 'none';
}

export function summarizeStateOperatingContract(states = []) {
  const healthCounts = { healthy: 0, stale_useful: 0, degraded: 0, blocked: 0 };
  for (const state of states) healthCounts[state.health] = (healthCounts[state.health] || 0) + 1;
  return {
    stateCount: states.length,
    healthCounts,
    retryStateIds: states.filter((state) => state.recoveryAction === 'retry_state_collection' && state.health !== 'blocked').map((state) => state.state),
    blockedStateIds: states.filter((state) => state.health === 'blocked').map((state) => state.state),
  };
}

export function buildStateOperatingContract({
  activeStateIds = [],
  summary = {},
  stateCoverage = {},
  drops = [],
  alerts = [],
  quality = null,
  previousQuality = null,
  stateReports = [],
  scheduledVerification = null,
  previous = null,
  generatedAt = new Date().toISOString(),
  previousPublishedAt = null,
} = {}) {
  const active = [...new Set([...activeStateIds].map((value) => String(value).trim().toUpperCase()).filter(Boolean))].sort();
  const summaryByState = new Map(rowsOf(summary?.states, 'states').map((row) => [stateOf(row), row]));
  const coverageByState = new Map(rowsOf(stateCoverage?.states, 'states').map((row) => [stateOf(row), row]));
  const reportByState = new Map(rowsOf(stateReports, 'states').map((row) => [stateOf(row), row]));
  const qualityByState = new Map(rowsOf(quality?.states, 'states').map((row) => [stateOf(row), row]));
  const previousQualityByState = new Map(rowsOf(previousQuality?.states, 'states').map((row) => [stateOf(row), row]));
  const previousByState = new Map(rowsOf(previous?.states, 'states').map((row) => [stateOf(row), row]));
  const attempted = new Set((summary?.attemptedStateIds || (summary?.partialRefresh === true ? [] : active)).map((value) => String(value).toUpperCase()));

  const states = active.map((state) => {
    const stateSummary = summaryByState.get(state) || coverageByState.get(state) || {};
    const coverage = coverageByState.get(state) || stateSummary;
    const report = reportByState.get(state) || {};
    const qualityState = qualityByState.get(state) || {};
    const previousQualityState = previousQualityByState.get(state) || {};
    const baseline = previousByState.get(state) || null;
    const stateDrops = rowsOf(drops, 'drops').filter((row) => stateOf(row) === state);
    const stateAlerts = rowsOf(alerts, 'alerts').filter((row) => stateOf(row) === state);
    const visibleDrops = stateDrops.filter((row) => projectCustomerSurfaces(row).onSite);
    const eligibleAlerts = stateAlerts.filter((row) => projectCustomerSurfaces(row, { kind: 'alert' }).delivery);
    const fallback = fallbackFor(state, summary, stateSummary, scheduledVerification);
    const anomalies = [];
    const collectionStatus = String(stateSummary.status || report.status || qualityState.input?.status || 'unknown');
    const signalCount = finite(coverage.signalCount ?? stateSummary.signalCount ?? qualityState.input?.signalCount ?? report.signals?.length);
    const previousDropCount = finite(baseline?.customerVisibleDropCount ?? previousQualityState.input?.dropCount ?? previousQualityState.dropCount);

    if (collectionSucceeded(collectionStatus) && signalCount === 0) anomalies.push('unexpected_zero_valid_output');
    if (signalCount > 0 && visibleDrops.length === 0 && lifecycleExpectsCustomerVisibleDrops(state)) {
      anomalies.push('unexpected_zero_customer_visible_output');
    }
    if (attempted.has(state) && fallback.status === 'none' && previousDropCount >= 5 && visibleDrops.length < Math.ceil(previousDropCount * 0.5)) {
      anomalies.push('significant_drop_count_collapse');
    }
    if (duplicateSpike(visibleDrops)) anomalies.push('duplicate_identity_spike');
    if (stateDrops.some((row) => missingCustomerFields(row).length > 0)) anomalies.push('missing_required_customer_fields');
    if (stateDrops.some((row) => hasUnsafeAlertFlags(row))
      || stateAlerts.some((row) => hasUnsafeAlertFlags(row, { kind: 'alert' }))) anomalies.push('stale_or_noninventory_alert_flags');
    if (deterministicFailure(collectionStatus)) anomalies.push('deterministic_collection_failure');

    const lastSuccessAt = validTime(
      report.stale === true ? report.previousFinishedAt : report.finishedAt,
      stateSummary.stale === true ? stateSummary.previousFinishedAt : stateSummary.finishedAt,
      baseline?.collection?.lastSuccessAt,
    );
    const lastPublicationAt = attempted.has(state) && fallback.status === 'none'
      ? validTime(generatedAt)
      : validTime(baseline?.lastPublicationAt, previousPublishedAt, generatedAt);
    if (attempted.has(state) && collectionSucceeded(collectionStatus) && baseline?.lastPublicationAt
      && Date.parse(lastSuccessAt) > Date.parse(baseline.lastPublicationAt)
      && Date.parse(lastPublicationAt) <= Date.parse(baseline.lastPublicationAt)) {
      anomalies.push('healthy_collection_publication_not_advanced');
    }

    const freshness = freshnessFor(visibleDrops, generatedAt, fallback.status !== 'none' || stateSummary.stale === true);
    const anomalyCodes = [...new Set(anomalies)].sort();
    const health = healthFor(anomalyCodes, fallback, visibleDrops.length, stateSummary);
    return {
      state,
      health,
      collection: {
        status: collectionStatus,
        count: finite(stateSummary.reachableSourceCount ?? report.sources?.filter((source) => source?.ok).length ?? stateSummary.sourceCount),
        lastSuccessAt,
      },
      signalCount,
      customerVisibleDropCount: visibleDrops.length,
      alertCandidateCount: eligibleAlerts.length,
      lastPublicationAt,
      freshness,
      fallback,
      anomalyCodes,
      recoveryAction: recoveryFor(health, anomalyCodes, fallback),
    };
  });

  return {
    contractVersion: STATE_OPERATING_CONTRACT_VERSION,
    generatedAt,
    summary: summarizeStateOperatingContract(states),
    states,
  };
}
