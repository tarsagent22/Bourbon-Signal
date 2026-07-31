export const STALE_RETAINED_AVAILABILITY_LABEL = 'Stale retained evidence; not alertable';

export function markSignalStaleNonAlertable(signal = {}, reason, now = new Date().toISOString()) {
  return {
    ...signal,
    stale: true,
    sourceStale: true,
    staleReason: reason,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    alertable: false,
    availabilityStatus: 'stale',
    availabilityLabel: STALE_RETAINED_AVAILABILITY_LABEL,
    sourceAvailabilityVerified: false,
    raw: {
      ...(signal.raw || {}),
      sourceAvailabilityVerified: false,
      sourceRuntimeNonAlertable: true,
      staleFallback: true,
      staleNonAlertable: true,
      staleReason: reason,
      staleFallbackAt: now,
    },
  };
}

export function isExplicitSafeStaleSignal(signal = {}) {
  return signal.stale === true
    && signal.sourceStale === true
    && signal.canAlertAsInventory === false
    && signal.canAlertAsWatch === false
    && signal.alertable === false
    && signal.availabilityStatus === 'stale'
    && signal.availabilityLabel === STALE_RETAINED_AVAILABILITY_LABEL
    && signal.sourceAvailabilityVerified === false
    && signal.raw?.sourceAvailabilityVerified === false
    && signal.raw?.sourceRuntimeNonAlertable === true
    && signal.raw?.staleFallback === true
    && signal.raw?.staleNonAlertable === true;
}
