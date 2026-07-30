export function floridaCityHiveProductIdentity(option, product) {
  const productId = String(option?.product_id || product?.id || '').trim();
  const variantId = String(option?.option_id || '').trim();
  return productId && variantId ? { productId, variantId } : null;
}

export function floridaCityHiveSignalIdentityParts({ sourceId, merchantId, productId, variantId }) {
  return ['FL', 'cityhive-store-inventory', sourceId, merchantId, productId || '', variantId || ''];
}

export function mergeFloridaTargetProbeHistory(existingSignals = [], currentSignals = []) {
  const previousProbeRows = existingSignals.filter((signal) => signal?.sourceChain === 'target' && signal?.eventType === 'retailer_store_probe_status');
  const currentProbeRows = currentSignals.filter((signal) => signal?.sourceChain === 'target' && signal?.eventType === 'retailer_store_probe_status');
  const currentNonProbeRows = currentSignals.filter((signal) => signal?.eventType !== 'retailer_store_probe_status');
  const probesById = new Map([...previousProbeRows, ...currentProbeRows].map((signal) => [signal.id, signal]));
  return [...currentNonProbeRows, ...probesById.values()];
}

export function markFloridaCityHiveFallbackNonAlertable(signal) {
  return {
    ...signal,
    stale: true,
    sourceStale: true,
    alertable: false,
    availabilityStatus: 'stale',
    availabilityLabel: 'Stale cached evidence; not alertable',
    sourceAvailabilityVerified: false,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    inventorySemantics: `stale_non_alertable_cache_fallback: ${signal.inventorySemantics || 'previous positive inventory evidence'}`,
    raw: {
      ...(signal.raw || {}),
      sourceAvailabilityVerified: false,
      sourceRuntimeNonAlertable: true,
      staleFallback: true,
      cacheFallback: true,
      cacheFallbackReason: 'fresh_previous_partition',
      staleNonAlertable: true,
    },
  };
}
