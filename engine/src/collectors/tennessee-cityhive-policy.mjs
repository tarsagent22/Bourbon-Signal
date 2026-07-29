function timestamp(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : null;
}

export function tennesseeCityHiveSignalSourceId(signal) {
  return String(signal?.sourceChain || signal?.raw?.chain || '').trim();
}

export function hasReviewedTennesseeCityHivePayload(registeredMerchantIds = [], payloadMerchantIds = [], hasProductPayload = false) {
  if (!hasProductPayload) return false;
  const reviewed = new Set([...registeredMerchantIds].map((value) => String(value || '').trim()).filter(Boolean));
  return [...payloadMerchantIds].some((value) => reviewed.has(String(value || '').trim()));
}

function evidenceTimestamp(signal) {
  return timestamp(signal?.lastConfirmedAt || signal?.observedAt || signal?.fetchedAt);
}

export function tennesseeCityHiveSourceRefreshAt(cache = {}) {
  const result = new Map();
  for (const [sourceId, value] of Object.entries(cache?.sourceRefreshAt || {})) {
    const parsed = timestamp(value);
    if (sourceId && parsed != null) result.set(sourceId, parsed);
  }
  for (const signal of cache?.signals || []) {
    const sourceId = tennesseeCityHiveSignalSourceId(signal);
    const observedAt = evidenceTimestamp(signal);
    if (!sourceId || observedAt == null) continue;
    result.set(sourceId, Math.max(result.get(sourceId) || 0, observedAt));
  }
  return result;
}

export function tennesseeCityHiveSourceAttemptAt(cache = {}) {
  const result = new Map(tennesseeCityHiveSourceRefreshAt(cache));
  for (const [sourceId, value] of Object.entries(cache?.sourceAttemptAt || {})) {
    const parsed = timestamp(value);
    if (sourceId && parsed != null) result.set(sourceId, parsed);
  }
  return result;
}

export function selectTennesseeCityHiveSourceCohort(sources = [], {
  cache = {},
  cohortSize = 4,
  forceAll = false,
  requestedSourceIds = new Set(),
} = {}) {
  const requested = requestedSourceIds instanceof Set ? requestedSourceIds : new Set(requestedSourceIds || []);
  if (requested.size) return sources.filter((source) => requested.has(source.id));
  if (forceAll) return [...sources];
  const attemptAt = tennesseeCityHiveSourceAttemptAt(cache);
  const indexed = sources.map((source, index) => ({ source, index, attemptedAt: attemptAt.get(source.id) || 0 }));
  indexed.sort((left, right) => left.attemptedAt - right.attemptedAt || left.index - right.index);
  const size = Math.max(1, Math.min(sources.length, Number(cohortSize) || 1));
  return indexed.slice(0, size).map((entry) => entry.source);
}

export function mergeTennesseeCityHiveCacheSignals({
  liveSignals = [],
  cachedSignals = [],
  selectedSourceIds = new Set(),
  failedSourceIds = new Set(),
  observedAt = new Date().toISOString(),
  maxAgeMs,
  validate = () => true,
} = {}) {
  const nowMs = timestamp(observedAt);
  const ageLimit = Math.max(0, Number(maxAgeMs) || 0);
  const selected = selectedSourceIds instanceof Set ? selectedSourceIds : new Set(selectedSourceIds || []);
  const failed = failedSourceIds instanceof Set ? failedSourceIds : new Set(failedSourceIds || []);
  const retained = (cachedSignals || []).filter((signal) => {
    if (!validate(signal)) return false;
    const sourceId = tennesseeCityHiveSignalSourceId(signal);
    const observedMs = evidenceTimestamp(signal);
    if (!sourceId || nowMs == null || observedMs == null || observedMs > nowMs + 5 * 60_000 || nowMs - observedMs > ageLimit) return false;
    return !selected.has(sourceId) || failed.has(sourceId);
  });
  const rows = [...retained, ...(liveSignals || []).filter(validate)];
  const deduped = new Map();
  for (const signal of rows) {
    const key = String(signal?.id || [
      tennesseeCityHiveSignalSourceId(signal),
      signal?.merchantId || signal?.raw?.merchantId,
      signal?.productId,
      signal?.variantId,
      signal?.storeId,
    ].join('|'));
    const previous = deduped.get(key);
    const previousTime = evidenceTimestamp(previous) || 0;
    const nextTime = evidenceTimestamp(signal) || 0;
    if (!previous || nextTime >= previousTime) deduped.set(key, signal);
  }
  return [...deduped.values()];
}

export function updateTennesseeCityHiveSourceRefreshAt(cache = {}, completedSourceIds = new Set(), observedAt = new Date().toISOString()) {
  const result = Object.fromEntries([...tennesseeCityHiveSourceRefreshAt(cache)].map(([sourceId, value]) => [sourceId, new Date(value).toISOString()]));
  for (const sourceId of completedSourceIds || []) result[sourceId] = observedAt;
  return result;
}

export function updateTennesseeCityHiveSourceAttemptAt(cache = {}, attemptedSourceIds = new Set(), observedAt = new Date().toISOString()) {
  const result = Object.fromEntries([...tennesseeCityHiveSourceAttemptAt(cache)].map(([sourceId, value]) => [sourceId, new Date(value).toISOString()]));
  for (const sourceId of attemptedSourceIds || []) result[sourceId] = observedAt;
  return result;
}
