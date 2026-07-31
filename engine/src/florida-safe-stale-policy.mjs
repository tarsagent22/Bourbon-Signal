export const STALE_RETAINED_AVAILABILITY_LABEL = 'Stale retained evidence; not alertable';

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
