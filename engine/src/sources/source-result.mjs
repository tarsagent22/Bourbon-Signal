import { serializeSourceError } from './source-error.mjs';

export const SOURCE_RESULT_CONTRACT_VERSION = 'bourbon-signal-source-result-v1';

function nonAlertableSignal(signal, reason, stale) {
  return {
    ...signal,
    ...(stale ? { stale: true, staleReason: reason } : {}),
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    alertable: false,
    raw: {
      ...(signal?.raw || {}),
      sourceRuntimeNonAlertable: true,
      sourceRuntimeReason: reason,
      ...(stale ? { staleFallback: true } : {}),
    },
  };
}

export function markSourceValueNonAlertable(value, reason, { stale = false } = {}) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((entry) => nonAlertableSignal(entry, reason, stale));
  const cloned = { ...value };
  for (const key of ['signals', 'records', 'rows', 'items']) {
    if (Array.isArray(value[key])) cloned[key] = value[key].map((entry) => nonAlertableSignal(entry, reason, stale));
  }
  return cloned;
}

export function statusForSourceError(error) {
  return {
    timeout: 'timeout',
    malformed: 'malformed',
    collapsed: 'collapsed',
    transient: 'transient_error',
    permanent: 'permanent_error',
    circuit_open: 'circuit_open',
    unexpected: 'failed',
  }[error?.kind] || 'failed';
}

export function createSourceSuccessResult({ adapter, value, startedAt, finishedAt, attemptCount, quarantined = false, schedule = null }) {
  const reason = quarantined ? `Source ${adapter.id} is quarantined` : null;
  return {
    contractVersion: SOURCE_RESULT_CONTRACT_VERSION,
    sourceId: adapter.id,
    sourceLabel: adapter.label,
    sourceUrl: adapter.url,
    status: quarantined ? 'quarantined' : 'success',
    ok: true,
    stale: false,
    quarantined,
    alertable: !quarantined,
    attemptCount,
    startedAt,
    finishedAt,
    checkedAt: finishedAt,
    lastGoodAt: finishedAt,
    value: quarantined ? markSourceValueNonAlertable(value, reason) : value,
    error: null,
    schedule,
  };
}

export function createSourceFailureResult({ adapter, error, previous = null, startedAt, finishedAt, attemptCount, schedule = null }) {
  const serialized = serializeSourceError(error);
  const fallbackAvailable = previous?.value !== undefined && previous?.value !== null && Boolean(previous?.lastGoodAt);
  const reason = `${serialized.kind}: ${serialized.message}`;
  return {
    contractVersion: SOURCE_RESULT_CONTRACT_VERSION,
    sourceId: adapter.id,
    sourceLabel: adapter.label,
    sourceUrl: adapter.url,
    status: statusForSourceError(serialized),
    ok: false,
    stale: fallbackAvailable,
    quarantined: false,
    alertable: false,
    attemptCount,
    startedAt,
    finishedAt,
    checkedAt: finishedAt,
    lastGoodAt: fallbackAvailable ? previous.lastGoodAt : null,
    value: fallbackAvailable ? markSourceValueNonAlertable(previous.value, reason, { stale: true }) : null,
    error: serialized,
    schedule,
  };
}

export function createSourceSkippedResult({ adapter, previous = null, status, now, schedule = null, error = null }) {
  const retained = previous?.value !== undefined && previous?.value !== null;
  const circuitOpen = status === 'circuit_open';
  const disabled = status === 'disabled';
  const nonAlertable = circuitOpen || disabled;
  const reason = circuitOpen ? `Source ${adapter.id} circuit is open` : `Source ${adapter.id} was ${status}`;
  return {
    contractVersion: SOURCE_RESULT_CONTRACT_VERSION,
    sourceId: adapter.id,
    sourceLabel: adapter.label,
    sourceUrl: adapter.url,
    status,
    ok: false,
    stale: circuitOpen && retained,
    quarantined: false,
    alertable: !nonAlertable && previous?.alertable === true,
    attemptCount: 0,
    startedAt: now,
    finishedAt: now,
    checkedAt: circuitOpen ? now : previous?.checkedAt || null,
    lastGoodAt: previous?.lastGoodAt || null,
    value: nonAlertable && retained ? markSourceValueNonAlertable(previous.value, reason, { stale: circuitOpen }) : previous?.value ?? null,
    error: error ? serializeSourceError(error) : null,
    schedule,
  };
}

export function summarizeSourceResult(result) {
  const { value: _value, ...summary } = result;
  return summary;
}

export function isSourceResult(value) {
  return value?.contractVersion === SOURCE_RESULT_CONTRACT_VERSION && typeof value.sourceId === 'string' && typeof value.status === 'string';
}
