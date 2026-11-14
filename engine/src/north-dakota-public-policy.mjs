import { isCentralCityHiveInventory } from './central-cityhive-policy.mjs';
import { isNorthDakotaGroceryResearchInventory, williston } from './north-dakota-retail-policy.mjs';

export const NORTH_DAKOTA_PUBLIC_COHORT_SHA256 = 'e4fe87fee52a06bd2ae78fa3c541dbc2b578321961a374acf6ae9a62760b767c';
export const NORTH_DAKOTA_PUBLIC_RUNTIME_IDS = Object.freeze({
  cityHive: 'nd:rock-cityhive',
  albertsons: 'nd:albertsons-xapi',
});

function isCurrent(row, nowMs) {
  const observedAt = Date.parse(row?.observedAt || '');
  const age = nowMs - observedAt;
  return Number.isFinite(observedAt) && age >= 0 && age <= 2 * 60 * 60_000;
}

function hasNoAlertOrDelivery(row) {
  return row?.canAlertAsInventory === false && row?.canAlertAsWatch === false && row?.alertable === false
    && row?.eligibleForOnSite === true && row?.eligibleForDropFeed === true && row?.eligibleForWatch === false
    && row?.eligibleForDelivery === false && row?.deliveryEligible === false
    && row?.eligibleForEmail === false && row?.eligibleForSms === false
    && row?.can_alert_as_inventory !== true && row?.can_alert_as_watch !== true;
}

function hasProductionBinding(row) {
  const proof = row?.sourceProductBinding;
  return Boolean(proof?.shadowOnly === false && proof.productionOnSiteOnly === true
    && proof.productionCohortSha256 === NORTH_DAKOTA_PUBLIC_COHORT_SHA256
    && row?.raw?.shadowOnly !== true && row?.raw?.staleFallback !== true
    && row?.previewOnly !== true && row?.quarantined !== true
    && row?.stale !== true && row?.sourceStale !== true && row?.source_stale !== true
    && ['limited', 'allocated', 'unicorn'].includes(row?.tier)
    && row?.quantity === 0 && row?.quantityIsExact === false
    && typeof row?.price === 'number' && Number.isFinite(row.price) && row.price > 0
    && hasNoAlertOrDelivery(row));
}

function isGrandForksProductionInventory(row, nowMs) {
  return Boolean(row?.state === 'ND' && row.eventType === 'retailer_store_inventory_result'
    && row.sourceRuntimeId === NORTH_DAKOTA_PUBLIC_RUNTIME_IDS.cityHive
    && row.storeId === 'rock-bottle-shop:67c8a2e465e7a028cb538073'
    && row.sourceLabel === 'The Rock Bottle Shop first-party pickup inventory'
    && isCurrent(row, nowMs) && hasProductionBinding(row)
    && isCentralCityHiveInventory(row, { nowMs }));
}

function isWillistonProductionInventory(row, nowMs) {
  const proof = row?.sourceProductBinding;
  const item = proof?.productSnapshot;
  const reviewShape = { ...row, sourceRuntimeId: 'research:nd:albertsons-xapi', eligibleForOnSite: false,
    eligibleForDropFeed: false, sourceProductBinding: { ...proof, shadowOnly: true } };
  return Boolean(row?.state === 'ND' && row.eventType === 'retailer_store_inventory_result'
    && row.sourceRuntimeId === NORTH_DAKOTA_PUBLIC_RUNTIME_IDS.albertsons
    && row.storeId === williston.storeId && row.merchantId === williston.merchantId
    && row.storeAddress === williston.address && row.city === williston.city && row.zip === williston.zip
    && row.lat === williston.lat && row.lng === williston.lng
    && isCurrent(row, nowMs) && hasProductionBinding(row)
    && isNorthDakotaGroceryResearchInventory(reviewShape)
    && String(item?.storeId) === williston.merchantId && String(item?.id) === row.productId
    && String(item?.pid) === row.variantId && item?.channelEligibility?.inStore === true
    && String(item?.channelInventory?.instore ?? item?.channelInventory?.inStore) === '1');
}

// This browser-safe projection predicate imports only pure identity policies,
// never the filesystem/network-backed ND collector.
export function isNorthDakotaProductionOnSiteInventory(row, { nowMs = Date.now() } = {}) {
  return isGrandForksProductionInventory(row, nowMs) || isWillistonProductionInventory(row, nowMs);
}
