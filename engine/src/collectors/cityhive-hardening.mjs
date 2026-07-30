export function oldestSourceEvidenceCohort(sources, signals, cohortSize, sourceKey = (source) => String(source?.[0] || '')) {
  if (!Array.isArray(sources) || sources.length === 0) return [];
  const latestByKey = new Map();
  for (const signal of signals || []) {
    const key = String(signal?.raw?.sourceKey || signal?.merchantId || '').trim();
    const timestamp = Date.parse(signal?.raw?.lastSuccessfulRefreshAt || signal?.raw?.lastAttemptAt || signal?.observedAt || '');
    if (!key || !Number.isFinite(timestamp)) continue;
    latestByKey.set(key, Math.max(latestByKey.get(key) || 0, timestamp));
  }
  return sources
    .map((source, index) => ({ source, index, refreshedAt: latestByKey.get(String(sourceKey(source))) || 0 }))
    .sort((left, right) => left.refreshedAt - right.refreshedAt || left.index - right.index)
    .slice(0, Math.max(1, Math.min(sources.length, Number(cohortSize) || 1)))
    .map((entry) => entry.source);
}

export function rotatingSourceCohort(sources, observedAt, cohortSize, rotationMs) {
  if (!Array.isArray(sources) || sources.length === 0) return [];
  const safeSize = Math.max(1, Math.min(sources.length, Number(cohortSize) || 1));
  const safeRotationMs = Math.max(1, Number(rotationMs) || 1);
  const slot = Math.floor(new Date(observedAt).getTime() / safeRotationMs);
  const start = (slot * safeSize) % sources.length;
  return Array.from({ length: safeSize }, (_, index) => sources[(start + index) % sources.length]);
}

export function normalizeCityHiveReportedQuantity(value) {
  const parsed = Number(value);
  const reportedQuantity = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  const binaryAvailability = reportedQuantity >= 100;
  return { reportedQuantity, binaryAvailability, quantity: binaryAvailability ? 1 : reportedQuantity };
}

export function reconcileCityHiveRateLimitsWithCache({ roadblocks = [], sources = [], retainedSignals = [] } = {}) {
  const sourceLabelById = new Map((sources || []).map((source) => [source.id, source.sourceLabel]));
  const recoveredSourceIds = new Set((retainedSignals || [])
    .filter((signal) => signal?.eventType === 'cityhive_store_inventory_result'
      && Number(signal?.quantity || 0) > 0
      && signal?.raw?.cacheFallback === true)
    .map((signal) => signal?.raw?.chain)
    .filter((sourceId) => sourceLabelById.has(sourceId)));
  const recoveredLabels = new Set([...recoveredSourceIds].map((sourceId) => sourceLabelById.get(sourceId)));
  const failedLabels = new Set((roadblocks || [])
    .filter((roadblock) => Number.isFinite(Number(roadblock?.status)) && Number(roadblock.status) >= 400)
    .map((roadblock) => roadblock?.source)
    .filter(Boolean));
  const isReachabilitySummary = (roadblock) => /^(?:reachable_no_safe_inventory_rows|reachable_no_inventory_rows)$/i.test(String(roadblock?.status || ''));
  const isRecoveredNoise = (roadblock) => Number(roadblock?.status) === 429 || isReachabilitySummary(roadblock);

  return {
    recoveredSourceIds: [...recoveredSourceIds].sort(),
    roadblocks: (roadblocks || []).filter((roadblock) => !(
      isRecoveredNoise(roadblock) && recoveredLabels.has(roadblock?.source)
    ) && !(isReachabilitySummary(roadblock) && failedLabels.has(roadblock?.source))),
  };
}

export function freshCityHivePositiveSignals(signals = [], sourceIds = [], observedAt = new Date().toISOString(), maxAgeMs = 0) {
  const allowedSources = new Set(sourceIds);
  const now = new Date(observedAt).getTime();
  const ageLimit = Math.max(0, Number(maxAgeMs) || 0);
  if (!Number.isFinite(now) || ageLimit <= 0) return [];
  return (signals || []).filter((signal) => {
    const sourceId = signal?.raw?.chain || signal?.sourceChain;
    const observed = new Date(signal?.observedAt || 0).getTime();
    return allowedSources.has(sourceId)
      && signal?.eventType === 'cityhive_store_inventory_result'
      && Number(signal?.quantity || 0) > 0
      && Number.isFinite(observed)
      && now >= observed
      && now - observed <= ageLimit;
  });
}
