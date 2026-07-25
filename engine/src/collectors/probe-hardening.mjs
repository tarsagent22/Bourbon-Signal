const TERMINAL_CLIENT_STATUSES = new Set([400, 401, 403, 404, 410, 429]);

export function isTerminalProbeFailure(status) {
  return TERMINAL_CLIENT_STATUSES.has(Number(status));
}

export function summarizeRepeatedPlatformFailures(failures = [], {
  state = null,
  source = 'Shared first-party retailer platform',
  configuredProbeCount = failures.length,
  nextRoute = null,
} = {}) {
  const rows = (failures || []).filter(Boolean);
  if (rows.length < 2) return rows;
  const status = Number(rows[0]?.status);
  if (!isTerminalProbeFailure(status) || rows.some((row) => Number(row?.status) !== status)) return rows;

  const attemptedUrls = [...new Set(rows.map((row) => row?.url).filter(Boolean))];
  const configuredCount = Math.max(rows.length, Number(configuredProbeCount) || 0);
  const skippedProbeCount = Math.max(0, configuredCount - rows.length);
  return [{
    state: state || rows[0]?.state || null,
    source,
    url: attemptedUrls[0] || rows[0]?.url || null,
    status,
    error: `${rows.length} representative configured probes returned HTTP ${status}; skipped ${skippedProbeCount} redundant probe${skippedProbeCount === 1 ? '' : 's'} after the repeated platform failure.`,
    nextRoute: nextRoute || rows[0]?.nextRoute || 'Retry the bounded first-party probes at the next cadence without bypassing source controls.',
    evidence: {
      attemptedUrls,
      attemptedSources: [...new Set(rows.map((row) => row?.source).filter(Boolean))],
      configuredProbeCount: configuredCount,
      attemptedProbeCount: rows.length,
      skippedProbeCount,
    },
  }];
}

export function configuredStoreId(chain, store) {
  const sourceChain = String(chain || '').trim();
  const storeId = String(store?.id || '').trim();
  if (!sourceChain || !storeId || !store?.name || !store?.address || !store?.city || !store?.zip) {
    throw new TypeError('Configured exact-store identity requires chain, id, name, address, city, and zip.');
  }
  return `${sourceChain}:${storeId}`;
}

export function attachConfiguredStoreIdentity(signal, chain, store, stateCode) {
  return {
    ...signal,
    stateCode,
    locationPrecision: 'store_level',
    locationName: store.name,
    storeName: store.name,
    storeId: configuredStoreId(chain, store),
    storeAddress: store.address,
    city: store.city,
    postalCode: store.zip,
    zip: store.zip,
    raw: { ...(signal?.raw || {}), chain },
  };
}
