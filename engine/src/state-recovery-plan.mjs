export const STATE_RECOVERY_PLAN_VERSION = 'bourbon-signal-state-recovery-v1';
export const MAX_STATE_RECOVERY_ATTEMPTS = 2;

function normalizeStateIds(values = []) {
  return [...new Set(values
    .flatMap((value) => String(value || '').split(','))
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^[A-Z]{2}(?:-[A-Z0-9]+)*$/.test(value)))].sort();
}

function transientState(record) {
  if (!record || record.health === 'blocked' || record.recoveryAction !== 'retry_state_collection') return false;
  if (!['degraded', 'stale_useful'].includes(record.health)) return false;
  const evidence = [
    record.collection?.status,
    record.fallback?.reason,
    ...(record.anomalyCodes || []),
  ].filter(Boolean).join(' ');
  return /(?:timeout|timed out|rate.?limit|http_?(?:408|425|429|500|502|503|504)|network|econn|eai_again|enet|epipe|temporary|transient|unreachable)/iu.test(evidence)
    && !/(?:validation|contract|schema|invalid|misconfig|policy_block|immutable|quality regression)/iu.test(evidence);
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
    else if (!transientState(record)) skipped.push({ state, reason: 'not_transient_or_degraded' });
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
