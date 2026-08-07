function isFiniteTimestamp(value) {
  return Number.isFinite(Date.parse(value || ''));
}

function rowsAreSafeRetainedSignals(signals) {
  return Array.isArray(signals)
    && signals.length > 0
    && signals.every((signal) => signal?.stale === true
      && signal.canAlertAsInventory !== true
      && signal.canAlertAsWatch !== true);
}

export function isSafePennsylvaniaScheduledFallback({
  allowSafeStaleFallback = false,
  stateReport = null,
} = {}) {
  if (!allowSafeStaleFallback || stateReport?.state !== 'PA') return false;
  if (!rowsAreSafeRetainedSignals(stateReport.signals)) return false;

  const status = String(stateReport.status || '');
  const provenanceAt = stateReport.lastGoodAt || stateReport.previousFinishedAt;
  if (!isFiniteTimestamp(provenanceAt)) return false;

  if (status === 'useful_retained_not_due' && stateReport.stale === false) return true;

  return stateReport.stale === true
    && /^stale_[a-z0-9]+(?:_[a-z0-9]+)*$/i.test(status)
    && Boolean(String(stateReport.staleReason || '').trim())
    && isFiniteTimestamp(stateReport.staleFallbackAt);
}
