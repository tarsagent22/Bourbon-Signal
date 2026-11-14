export const williston = Object.freeze({
  state: 'ND', stateCode: 'ND', storeId: 'albertsons:28', merchantId: '28', name: 'Albertsons Williston',
  street: '20 26th St E', address: '20 26th St E, Williston, ND 58801', city: 'Williston', zip: '58801',
  lat: 48.167667, lng: -103.622448,
  locator: 'https://local.albertsons.com/nd/williston/20-26th-st-e/Beer-Wine-Liquor.html',
  sourceLabel: 'Albertsons Williston first-party in-store availability',
});
export const groceryId = 'research:nd:albertsons-xapi';
export const allowedTiers = new Set(['limited', 'allocated', 'unicorn']);

function matchesNorthDakotaGroceryProof(row, { preview }) {
  const proof = row?.sourceProductBinding, item = proof?.productSnapshot, inventory = item?.channelInventory;
  const count = inventory?.instoreItemQty ?? inventory?.inStoreItemQty;
  return Boolean(row?.state === 'ND' && row.sourceRuntimeId === groceryId && row.storeId === williston.storeId
    && row.storeName === williston.name && row.storeAddress === williston.address && row.city === williston.city && row.zip === williston.zip
    && row.lat === williston.lat && row.lng === williston.lng && row.merchantId === williston.merchantId
    && row.sourceLabel === williston.sourceLabel && row.locationPrecision === 'store_level'
    && /^\d+$/.test(row.productId) && row.variantId === row.productId
    && row.sourceUrl === `https://www.albertsons.com/shop/product-details.${row.productId}.html`
    && row.availabilityStatus === 'in_stock' && row.sourceAvailabilityVerified === true
    && row.quantity === 0 && row.quantityIsExact === false && allowedTiers.has(row.tier)
    && Number.isFinite(row.price) && row.price > 0 && Number.isFinite(Date.parse(row.observedAt))
    && proof?.schemaVersion === 1 && proof.source === 'grocery-xapi' && proof.shadowOnly === true
    && proof.premisesVerified === true && proof.inStoreChannelVerified === true
    && proof.storeId === row.storeId && proof.storeAddress === row.storeAddress && proof.merchantId === row.merchantId
    && proof.productId === row.productId && proof.variantId === row.variantId && proof.observedAt === row.observedAt
    && proof.canonicalBottleId === row.canonicalBottleId && proof.price === row.price
    && String(item?.id) === row.productId && String(item.pid) === row.variantId
    && String(item.name || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() === row.rawName
    && String(item.storeId) === row.merchantId && /^\d{12,14}$/.test(String(item.upc))
    && item.containsAlcohol === true && Number(item.price) === row.price && item.channelEligibility?.inStore === true
    && String(inventory?.instore ?? inventory?.inStore) === '1'
    && (count == null || (String(count).trim() && Number.isFinite(Number(count)) && Number(count) > 0))
    && row.eligibleForOnSite === preview && row.eligibleForDropFeed === preview
    && (preview ? row.previewOnly === true : row.previewOnly !== true) && row.stale !== true && row.sourceStale !== true && row.source_stale !== true
    && row.can_alert_as_inventory !== true && row.can_alert_as_watch !== true && row.deliveryEligible !== true
    && ['alertable', 'canAlertAsInventory', 'canAlertAsWatch', 'eligibleForDelivery', 'eligibleForWatch', 'eligibleForEmail', 'eligibleForSms'].every(key => row[key] === false));
}

export function isNorthDakotaGroceryResearchInventory(row) {
  return matchesNorthDakotaGroceryProof(row, { preview: false });
}

export function isNorthDakotaGroceryCanaryPreview(row, nowMs = Date.now()) {
  const age = nowMs - Date.parse(row?.observedAt ?? '');
  return Number.isFinite(age) && age >= 0 && age <= 2 * 60 * 60_000
    && matchesNorthDakotaGroceryProof(row, { preview: true });
}
