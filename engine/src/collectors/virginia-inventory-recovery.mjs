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

export function minimumVirginiaSiteLocationCount(supportedOriginStoreCount) {
  const supportedCount = Number.isFinite(Number(supportedOriginStoreCount))
    ? Math.max(0, Number(supportedOriginStoreCount))
    : 0;
  if (!supportedCount) return 300;
  return Math.min(supportedCount, Math.max(300, Math.ceil(supportedCount * 0.75)));
}

export function virginiaProductCode(signal) {
  const directCode = signal?.productCode;
  if (directCode != null && String(directCode).trim()) return String(directCode).trim();
  const rawCode = signal?.raw?.product?.code;
  if (rawCode != null && String(rawCode).trim()) return String(rawCode).trim();
  return String(signal?.sourceUrl || '').match(/[?&]productCode=([^&]+)/)?.[1] || null;
}

export function seedVirginiaInventoryCacheSignals(stateReport) {
  const signals = (stateReport?.signals || [])
    .filter((signal) => signal?.state === 'VA'
      && signal?.sourceRuntimeId === 'precision:va'
      && signal?.locationPrecision === 'store_level'
      && signal?.storeId
      && virginiaProductCode(signal))
    .map((signal) => ({
      ...signal,
      stale: true,
      sourceStale: true,
      staleSourceCaveat: true,
      alertable: false,
      canAlertAsInventory: false,
      canAlertAsWatch: false,
      raw: {
        ...(signal.raw || {}),
        staleFallback: true,
        staleReason: signal.staleReason || signal.raw?.staleReason || stateReport?.staleReason || 'state_report_cache_seed'
      }
    }));
  return {
    generatedAt: stateReport?.finishedAt || stateReport?.generatedAt || null,
    signals
  };
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

export function isVirginiaRetiredOriginFailure(failure) {
  return Number(failure?.status) === 400
    && /no\s+store\s+exists\s+for\s+store\s+number/i.test(String(failure?.error || ''));
}

export function selectVirginiaOriginStoreRows(json, originStoreId, productCode = null) {
  const expectedOrigin = String(originStoreId || '').trim();
  const expectedProduct = String(productCode || '').trim();
  if (!expectedOrigin) return [];
  const rows = [];
  for (const productRow of json?.products || []) {
    if (expectedProduct && String(productRow?.productId || '') !== expectedProduct) continue;
    const store = productRow?.storeInfo;
    const storeId = store?.storeId ?? store?.storeNumber ?? store?.id;
    if (storeId == null || String(storeId) !== expectedOrigin) continue;
    rows.push(store);
  }
  return rows;
}

export function sanitizeVirginiaInventoryCacheSignals(signals = []) {
  const deduped = new Map();
  for (const signal of signals) {
    const storeId = String(signal?.storeId || '').trim();
    const productCode = virginiaProductCode(signal) || 'unknown-product';
    const key = storeId ? `${productCode}|${storeId}` : `${productCode}|${signal?.id || deduped.size}`;
    const raw = signal?.raw || {};
    const selectedOriginVerified = storeId
      && String(raw.originStoreId || '') === storeId
      && raw.sourceQuantityReported === true
      && raw.sourceAvailabilityVerified === true
      && Number(raw.virginiaCacheSchemaVersion) === 2;
    const migrated = selectedOriginVerified ? signal : {
      ...signal,
      alertable: false,
      canAlertAsInventory: false,
      sourceStale: true,
      stale: true,
      staleReason: 'Legacy Virginia cache row predates selected-origin provenance and must be refreshed before alerting.',
      raw: {
        ...raw,
        legacyVirginiaCache: true,
        staleFallback: true,
        staleReason: 'legacy_selected_origin_unverified'
      }
    };
    const previous = deduped.get(key);
    const migratedObservedAt = finiteTimestamp(migrated?.observedAt || migrated?.fetchedAt) || 0;
    const previousObservedAt = finiteTimestamp(previous?.observedAt || previous?.fetchedAt) || 0;
    if (!previous || migratedObservedAt >= previousObservedAt) deduped.set(key, migrated);
  }
  return [...deduped.values()];
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

export function summarizeVirginiaProductErrors(errors) {
  const failures = (errors || []).filter(Boolean);
  if (!failures.length) return null;
  const counts = new Map();
  for (const failure of failures) {
    const status = Number(failure.status) || 0;
    counts.set(status, (counts.get(status) || 0) + 1);
  }
  const statuses = [...counts.entries()]
    .sort(([left], [right]) => left - right)
    .map(([status, count]) => `${count} HTTP ${status || 'transport'}`)
    .join(', ');
  const representative = String(failures[0].error || 'Virginia ABC inventory request failed.')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
  return {
    status: counts.size === 1 ? [...counts.keys()][0] : 0,
    url: failures[0].url || null,
    error: `${failures.length} store-origin probe failure(s) (${statuses}); representative error: ${representative}`
  };
}

export function isVirginiaRegularInventoryExpired(signal, nowMs = Date.now(), maxInventoryAgeMs = 24 * 60 * 60_000) {
  const limitedCaveat = typeof signal?.productLimitedCaveat === 'boolean'
    ? signal.productLimitedCaveat
    : signal?.raw?.product?.limitedCaveat;
  if (!/store_inventory/i.test(String(signal?.eventType || '')) || limitedCaveat !== false) return false;
  const observedAt = finiteTimestamp(signal?.observedAt);
  return observedAt == null || nowMs - observedAt > maxInventoryAgeMs;
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

export function validateVirginiaGlobalQuality(stateReport, signals) {
  const rows = signals || [];
  const storeRows = rows.filter((signal) => signal.locationPrecision === 'store_level');
  const inventoryRows = rows.filter((signal) => signal.canAlertAsInventory === true);
  const alertableRows = rows.filter((signal) => signal.alertable || signal.canAlertAsInventory || signal.canAlertAsWatch);
  const bad1792 = rows.filter((signal) => /1792\s+Small\s+Batch/i.test(String(signal.rawName || '')) && /Full\s+Proof/i.test(String(signal.canonicalName || '')));
  const safeStale = stateReport?.stale === true && /^stale_/i.test(String(stateReport?.status || ''));
  const problems = [];

  if (rows.length < 700) problems.push(`VA signal count below threshold: ${rows.length}`);
  if (storeRows.length < 700) problems.push(`VA store-level signal count below threshold: ${storeRows.length}`);
  if (safeStale) {
    if (alertableRows.length) problems.push(`VA safe stale fallback contains ${alertableRows.length} alertable row(s)`);
  } else {
    if (stateReport?.stale === true || stateReport?.status !== 'useful') problems.push(`VA state must be useful or an explicitly safe stale fallback, got ${stateReport?.status || 'missing'}`);
    if (inventoryRows.length < 20) problems.push(`VA inventory-alertable signal count below threshold: ${inventoryRows.length}`);
  }
  if (bad1792.length) problems.push(`VA 1792 Small Batch is misidentified as 1792 Full Proof in ${bad1792.length} row(s)`);

  return {
    ok: problems.length === 0,
    safeStale,
    problems,
    counts: { signals: rows.length, storeRows: storeRows.length, inventoryRows: inventoryRows.length, alertableRows: alertableRows.length },
  };
}
