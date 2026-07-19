function finiteTimestamp(value) {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function throwIfVirginiaAborted(signal) {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new Error('Virginia source runtime aborted');
}

export function virginiaAbortableDelay(ms, signal) {
  throwIfVirginiaAborted(signal);
  const delayMs = Math.max(0, Number(ms) || 0);
  if (!delayMs) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason instanceof Error ? signal.reason : new Error('Virginia source runtime aborted'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function virginiaProductCode(signal) {
  const rawCode = signal?.raw?.product?.code;
  if (rawCode != null && String(rawCode).trim()) return String(rawCode).trim();
  return String(signal?.sourceUrl || '').match(/[?&]productCode=([^&]+)/)?.[1] || null;
}

export function selectVirginiaProductsForRefresh(products, cachedSignals, nowMs = Date.now(), options = {}) {
  const maxProducts = Math.max(1, Number(options.maxProducts || 8));
  const regularIntervalMs = Math.max(1, Number(options.regularIntervalMs || 2 * 60 * 60_000));
  const limitedIntervalMs = Math.max(1, Number(options.limitedIntervalMs || 12 * 60 * 60_000));
  const force = options.force === true;
  const latestByProduct = new Map();

  for (const signal of cachedSignals || []) {
    const code = virginiaProductCode(signal);
    const observedAt = finiteTimestamp(signal?.observedAt);
    if (!code || observedAt == null) continue;
    latestByProduct.set(code, Math.max(latestByProduct.get(code) || 0, observedAt));
  }

  return (products || [])
    .map((product, index) => {
      const intervalMs = product.limitedCaveat ? limitedIntervalMs : regularIntervalMs;
      const lastObservedAt = latestByProduct.get(String(product.code)) || null;
      const ageMs = lastObservedAt == null ? Number.POSITIVE_INFINITY : Math.max(0, nowMs - lastObservedAt);
      return {
        product,
        index,
        due: force || lastObservedAt == null || ageMs >= intervalMs,
        score: lastObservedAt == null ? Number.POSITIVE_INFINITY : ageMs / intervalMs
      };
    })
    .filter((entry) => entry.due)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.product.limitedCaveat !== b.product.limitedCaveat) return a.product.limitedCaveat ? 1 : -1;
      if (a.product.bootstrapPriority !== b.product.bootstrapPriority) return a.product.bootstrapPriority ? -1 : 1;
      return a.index - b.index;
    })
    .slice(0, maxProducts)
    .map((entry) => entry.product);
}

export function evaluateVirginiaProductCoverage(signals, expectedStoreIds, options = {}) {
  const expected = new Set([...expectedStoreIds].map(String));
  const minimumExpectedStoreCount = Math.max(0, Number(options.minimumExpectedStoreCount || 0));
  const covered = new Set((signals || []).map((signal) => String(signal.storeId || '')).filter(Boolean));
  const missingStoreIds = [...expected].filter((storeId) => !covered.has(storeId));
  const unexpectedStoreIds = [...covered].filter((storeId) => !expected.has(storeId));
  return {
    complete: expected.size >= minimumExpectedStoreCount && expected.size > 0 && missingStoreIds.length === 0 && unexpectedStoreIds.length === 0,
    coveredStoreCount: expected.size - missingStoreIds.length,
    expectedStoreCount: expected.size,
    missingStoreIds,
    unexpectedStoreIds
  };
}

export function mergeVirginiaProductPartitions(cachedSignals, livePartitions, completedProductCodes) {
  const completed = new Set([...(completedProductCodes || [])].map(String));
  const retained = (cachedSignals || []).filter((signal) => {
    const code = virginiaProductCode(signal);
    return !code || !completed.has(code);
  });
  const refreshed = [];
  for (const code of completed) refreshed.push(...(livePartitions?.get(code) || []));
  return [...retained, ...refreshed];
}

export function applyVirginiaInventoryFreshness(signals, nowMs = Date.now(), maxInventoryAgeMs = 24 * 60 * 60_000) {
  return (signals || []).map((signal) => {
    const observedAt = finiteTimestamp(signal?.observedAt);
    const stale = observedAt == null || nowMs - observedAt > maxInventoryAgeMs;
    if (!stale) return { ...signal, sourceStale: false, staleSourceCaveat: null };
    const lastConfirmed = observedAt == null ? 'an unknown time' : new Date(observedAt).toISOString();
    return {
      ...signal,
      sourceStale: true,
      canAlertAsInventory: false,
      staleSourceCaveat: `Virginia ABC inventory was last confirmed at ${lastConfirmed}; retained for context only and not eligible for alerts.`
    };
  });
}
