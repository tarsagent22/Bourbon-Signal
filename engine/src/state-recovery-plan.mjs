export const STATE_RECOVERY_PLAN_VERSION = 'bourbon-signal-state-recovery-v1';
export const MAX_STATE_RECOVERY_ATTEMPTS = 2;
const ACCEPTED_OUTPUT_RETRY_ANOMALIES = new Set([
  'healthy_collection_publication_not_advanced',
  'significant_drop_count_collapse',
  'unexpected_zero_customer_visible_output',
  'unexpected_zero_valid_output',
]);

function normalizeStateIds(values = []) {
  return [...new Set(values
    .flatMap((value) => String(value || '').split(','))
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^[A-Z]{2}(?:-[A-Z0-9]+)*$/.test(value)))].sort();
}

function deterministicFailure(record) {
  const evidence = [
    record?.collection?.status,
    record?.fallback?.reason,
    ...(record?.anomalyCodes || []),
  ].filter(Boolean).join(' ');
  return /(?:validation|contract|schema|invalid|misconfig|policy_block|immutable|quality regression|deterministic_collection_failure)/iu.test(evidence);
}

function retryableState(record) {
  if (!record || record.health === 'blocked' || record.recoveryAction !== 'retry_state_collection') return false;
  if (!['degraded', 'stale_useful'].includes(record.health)) return false;
  if ((record.anomalyCodes || []).some((code) => ACCEPTED_OUTPUT_RETRY_ANOMALIES.has(code))) return true;
  if (record.fallback?.status && record.fallback.status !== 'none') return !deterministicFailure(record);
  const evidence = [
    record.collection?.status,
    record.fallback?.reason,
    ...(record.anomalyCodes || []),
  ].filter(Boolean).join(' ');
  if (/(?:timeout|timed out|rate.?limit|http_?(?:408|425|429|500|502|503|504)|network|econn|eai_again|enet|epipe|temporary|transient|unreachable)/iu.test(evidence)) {
    return !deterministicFailure(record);
  }
  return !deterministicFailure(record);
}

export function buildStateRecoveryPlan(contract, {
  failedStateIds = null,
  attempt = 0,
  maxAttempts = MAX_STATE_RECOVERY_ATTEMPTS,
} = {}) {
  const boundedMax = Math.min(MAX_STATE_RECOVERY_ATTEMPTS, Math.max(1, Number(maxAttempts) || MAX_STATE_RECOVERY_ATTEMPTS));
  const currentAttempt = Math.max(0, Number(attempt) || 0);
  const byState = new Map((contract?.states || []).map((record) => [String(record.state).toUpperCase(), record]));
  const requestedStateIds = normalizeStateIds(failedStateIds === null
    ? (contract?.summary?.retryStateIds || [])
    : failedStateIds);
  const retryStateIds = [];
  const skipped = [];

  for (const state of requestedStateIds) {
    const record = byState.get(state);
    if (!record) skipped.push({ state, reason: 'missing_operating_record' });
    else if (record.health === 'blocked') skipped.push({ state, reason: 'blocked_deterministic_validation' });
    else if (!retryableState(record)) skipped.push({ state, reason: 'not_retryable_or_degraded' });
    else if (currentAttempt >= boundedMax) skipped.push({ state, reason: 'attempt_cap_reached' });
    else retryStateIds.push(state);
  }

  return {
    contractVersion: STATE_RECOVERY_PLAN_VERSION,
    operatingContractVersion: contract?.contractVersion || null,
    attempt: currentAttempt,
    nextAttempt: retryStateIds.length ? currentAttempt + 1 : currentAttempt,
    maxAttempts: boundedMax,
    requestedStateIds,
    retryStateIds,
    skipped,
  };
}

export { normalizeStateIds as normalizeRecoveryStateIds };
