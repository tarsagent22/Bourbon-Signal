export const OREGON_DAILY_INVENTORY_URL = 'https://www.olcc.state.or.us/pdfs/DailyStoreInventory.csv';
export const OREGON_DAILY_PRODUCTION_RUNTIME_ID = 'or:olcc-daily-inventory';
export const OREGON_DAILY_PRODUCTION_COHORT_SHA256 = '8c1a4bd03f5f5bd6ca3ed6259f4f16001adf191a27c7a8a547bc297d9ba9098d';

const sha256 = /^[a-f0-9]{64}$/i;
const dateMs = value => Date.parse(String(value || ''));

/** Client-safe customer evidence check; deliberately has no Node-only imports. */
export function isOregonDailyProductionEvidence(drop = {}) {
  const binding = drop.sourceProductBinding && typeof drop.sourceProductBinding === 'object' ? drop.sourceProductBinding : {};
  return drop.state === 'OR' && drop.sourceRuntimeId === OREGON_DAILY_PRODUCTION_RUNTIME_ID
    && drop.previewOnly !== true && drop.sourceUrl === OREGON_DAILY_INVENTORY_URL
    && drop.sourceAvailabilityVerified === true && drop.sourceStale !== true && drop.stale !== true
    && drop.locationPrecision === 'store_level' && Boolean(String(drop.storeId || '').trim() && String(drop.storeAddress || '').trim())
    && drop.quantityIsExact === true && Number.isSafeInteger(drop.quantity) && drop.quantity > 0
    && drop.canonicalBottleId === binding.canonicalBottleId && drop.quantity === binding.sourceQuantity
    && drop.observedAt === binding.observedAt && drop.lastConfirmedAt === binding.observedAt
    && binding.source === 'olcc-daily-report' && binding.cohortSha256 === OREGON_DAILY_PRODUCTION_COHORT_SHA256
    && sha256.test(String(binding.reportSha256 || ''))
    && Number.isFinite(dateMs(binding.reportGeneratedAt))
    && drop.canAlertAsInventory === false && drop.canAlertAsWatch === false && drop.alertable === false
    && drop.eligibleForOnSite === true && drop.eligibleForDropFeed === true && drop.eligibleForWatch === false
    && drop.eligibleForDelivery === false && drop.deliveryEligible === false && drop.eligibleForEmail === false && drop.eligibleForSms === false;
}
