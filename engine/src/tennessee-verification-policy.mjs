import { isTennesseeRetailerInventory, isTennesseeRetailerSignalIdentity } from './tennessee-retailer-policy.mjs';
import { isExplicitSafeStaleSignal } from './stale-signal-policy.mjs';

export const TENNESSEE_RETAINED_EVIDENCE_MAX_AGE_MS = 12 * 60 * 60_000;

function timestamp(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : null;
}

function evidenceTimestamp(row) {
  return timestamp(row?.lastConfirmedAt || row?.observedAt || row?.fetchedAt);
}

function stateReportExplicitlyAllowsFreshRetention(stateReport) {
  return (stateReport?.roadblocks || []).some((roadblock) => {
    const status = String(roadblock?.status || '').toLowerCase();
    if (status === 'fresh_cache_reuse' || status === 'partial_fresh_cache_merge') return true;
    return status === '200'
      && /cache reuse/i.test(String(roadblock?.source || ''))
      && /cache-backed exact-store/i.test(String(roadblock?.error || ''));
  });
}

function isTennesseeInventoryRow(row) {
  return /^(?:cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(String(row?.eventType || row?.type || ''));
}

export function isSafeStaleTennesseeInventoryRow(row) {
  return isTennesseeRetailerSignalIdentity(row)
    && isExplicitSafeStaleSignal(row);
}

export function qualifyingTennesseeInventoryEvidence(rows, {
  now = new Date().toISOString(),
  maxAgeMs = TENNESSEE_RETAINED_EVIDENCE_MAX_AGE_MS,
} = {}) {
  const nowMs = timestamp(now);
  if (nowMs == null) throw new TypeError(`Invalid Tennessee verification time: ${now}`);
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (row?.canAlertAsInventory !== true || !isTennesseeRetailerInventory(row)) return false;
    const observedAtMs = evidenceTimestamp(row);
    if (observedAtMs == null || observedAtMs > nowMs + 5 * 60_000) return false;
    return nowMs - observedAtMs <= maxAgeMs;
  });
}

export function canPublishTennesseePartialEvidenceFallback({
  stateReport,
  drops,
  now = new Date().toISOString(),
  minimumCurrentStateRows = 5,
  minimumCurrentDropRows = 5,
} = {}) {
  if (!stateReport || stateReport.state !== 'TN' || stateReport.stale === true || String(stateReport.status || '') !== 'useful') return false;
  const startedAtMs = timestamp(stateReport.startedAt);
  const finishedAtMs = timestamp(stateReport.finishedAt);
  const nowMs = timestamp(now);
  if (startedAtMs == null || finishedAtMs == null || nowMs == null || finishedAtMs > nowMs + 5 * 60_000) return false;
  const currentStateRows = qualifyingTennesseeInventoryEvidence(stateReport.signals, { now })
    .filter((row) => (evidenceTimestamp(row) ?? -Infinity) >= startedAtMs);
  const currentDropRows = qualifyingTennesseeInventoryEvidence(drops, { now })
    .filter((row) => (evidenceTimestamp(row) ?? -Infinity) >= startedAtMs);
  return currentStateRows.length >= minimumCurrentStateRows
    && currentDropRows.length >= minimumCurrentDropRows;
}

export function evaluateTennesseeSnapshotEvidence({
  stateReport,
  dropsPayload,
  now = new Date().toISOString(),
  allowFreshRetainedEvidence = false,
  allowSafeStaleFallback = false,
  maxAgeMs = TENNESSEE_RETAINED_EVIDENCE_MAX_AGE_MS,
  minimumStateRows = 1,
  minimumDropRows = 1,
} = {}) {
  const failures = [];
  const stateStartedAtMs = timestamp(stateReport?.startedAt);
  const stateFinishedAtMs = timestamp(stateReport?.finishedAt);
  const generatedAtMs = timestamp(dropsPayload?.generatedAt);
  const staleFallbackMode = allowSafeStaleFallback
    && stateReport?.stale === true
    && /^stale_useful(?:_|$)/i.test(String(stateReport?.status || ''));

  if (!stateReport || stateReport.state !== 'TN') failures.push('Missing generated Tennessee state report.');
  if (!staleFallbackMode && (stateReport?.stale === true || /^stale_|^failed_/i.test(String(stateReport?.status || '')))) {
    failures.push(`Tennessee state report is not current: ${stateReport?.status || 'missing status'}.`);
  }
  if (staleFallbackMode && !stateReport?.staleReason) failures.push('Tennessee stale fallback is missing a stale reason.');
  if (stateStartedAtMs == null || stateFinishedAtMs == null) failures.push('Tennessee state report is missing valid run timestamps.');
  if (generatedAtMs == null) failures.push('Generated site drops are missing a valid generatedAt timestamp.');
  if (generatedAtMs != null && stateFinishedAtMs != null && generatedAtMs < stateFinishedAtMs) {
    failures.push('Generated site drops predate the Tennessee state report.');
  }

  const stateEvidence = qualifyingTennesseeInventoryEvidence(stateReport?.signals, { now, maxAgeMs });
  const dropEvidence = qualifyingTennesseeInventoryEvidence(dropsPayload?.drops, { now, maxAgeMs });
  const currentStateEvidence = stateStartedAtMs == null
    ? []
    : stateEvidence.filter((row) => (evidenceTimestamp(row) ?? -Infinity) >= stateStartedAtMs);
  const currentDropEvidence = stateStartedAtMs == null
    ? []
    : dropEvidence.filter((row) => (evidenceTimestamp(row) ?? -Infinity) >= stateStartedAtMs);
  const explicitlyAllowedRetention = stateReportExplicitlyAllowsFreshRetention(stateReport);
  // A collector roadblock may explain why retained rows exist, but it must not
  // weaken a targeted verifier. Only the caller (scheduled fallback lane) can
  // explicitly authorize bounded fresh retention.
  const retainedEvidenceAllowed = allowFreshRetainedEvidence;
  const eligibleStateEvidence = retainedEvidenceAllowed ? stateEvidence : currentStateEvidence;
  const eligibleDropEvidence = retainedEvidenceAllowed ? dropEvidence : currentDropEvidence;
  const staleStateRows = (Array.isArray(stateReport?.signals) ? stateReport.signals : []).filter(isTennesseeInventoryRow);
  const staleDropRows = (Array.isArray(dropsPayload?.drops) ? dropsPayload.drops : [])
    .filter((row) => String(row?.state || row?.stateCode || row?.state_code || '').toUpperCase() === 'TN')
    .filter(isTennesseeInventoryRow);

  if (staleFallbackMode) {
    if (!staleStateRows.length || !staleDropRows.length) failures.push('Tennessee stale fallback must retain reviewed inventory context.');
    if (staleStateRows.some((row) => !isSafeStaleTennesseeInventoryRow(row))) failures.push('Tennessee state fallback contains an unsafe or alertable retained inventory row.');
    if (staleDropRows.some((row) => !isSafeStaleTennesseeInventoryRow(row))) failures.push('Generated Tennessee fallback contains an unsafe or alertable public inventory row.');
  } else if (eligibleStateEvidence.length < minimumStateRows) {
    failures.push(`Tennessee state report has ${eligibleStateEvidence.length} qualifying ${retainedEvidenceAllowed ? 'current/fresh-retained' : 'current'} inventory row(s); expected at least ${minimumStateRows}.`);
  }
  if (!staleFallbackMode && eligibleDropEvidence.length < minimumDropRows) {
    failures.push(`Generated Tennessee site partition has ${eligibleDropEvidence.length} qualifying ${retainedEvidenceAllowed ? 'current/fresh-retained' : 'current'} inventory row(s); expected at least ${minimumDropRows}.`);
  }

  return {
    ok: failures.length === 0,
    failures,
    counts: {
      stateEvidence: stateEvidence.length,
      currentStateEvidence: currentStateEvidence.length,
      dropEvidence: dropEvidence.length,
      currentDropEvidence: currentDropEvidence.length,
      staleStateEvidence: staleStateRows.length,
      staleDropEvidence: staleDropRows.length,
    },
    explicitlyAllowedRetention,
    retainedEvidenceAllowed,
    staleFallbackMode,
  };
}
