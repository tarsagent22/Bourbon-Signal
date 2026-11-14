export const WYOMING_GROCERY_HOST = 'www.albertsons.com';
export const WYOMING_GROCERY_RESEARCH_RUNTIME = 'research:wy:albertsons-xapi';
export const WYOMING_GROCERY_LABEL = 'Wyoming Albertsons in-store bourbon research';
export const WYOMING_GROCERY_STORES = Object.freeze([
  ['62', '2625 E 2nd St', 'Casper', '82609', 42.848022, -106.292475, '2625-e-2nd-st'],
  ['2061', '1825 17th St', 'Cody', '82414', 44.51785779999999, -109.055448, '1825-17th-st'],
  ['67', '2610 S Douglas Hwy', 'Gillette', '82718', 44.270564, -105.495935, '2610-s-douglas-hwy'],
  ['3435', '1005 W Coulter Ave', 'Powell', '82435', 44.748234, -108.771633, '1005-w-coulter-ave'],
].map(([merchantId, street, city, zip, lat, lng, slug]) => Object.freeze({
  state: 'WY', hostname: WYOMING_GROCERY_HOST, merchantId, street, city, zip, lat, lng,
  storeId: `albertsons:${merchantId}`, address: `${street}, ${city}, WY ${zip}`,
  locator: `https://local.albertsons.com/wy/${city.toLowerCase()}/${slug}/Beer-Wine-Liquor.html`,
})));

export function isWyomingGroceryCanaryPreview(row) {
  const store = WYOMING_GROCERY_STORES.find(store => store.storeId === row?.storeId);
  const proof = row?.sourceProductBinding;
  const product = proof?.productSnapshot;
  return Boolean(store && row.state === 'WY' && row.stateCode === 'WY'
    && row.previewOnly === true && row.sourceRuntimeId === WYOMING_GROCERY_RESEARCH_RUNTIME
    && row.sourceLabel === WYOMING_GROCERY_LABEL && row.sourceChain === 'albertsons'
    && (row.type ?? row.eventType) === 'retailer_store_inventory_result'
    && row.locationPrecision === 'store_level' && row.storeAddress === store.address
    && row.city === store.city && row.lat === store.lat && row.lng === store.lng
    && row.merchantId === store.merchantId && /^\d+$/.test(row.productId)
    && row.variantId === row.productId
    && row.sourceUrl === `https://${WYOMING_GROCERY_HOST}/shop/product-details.${row.productId}.html`
    && row.availabilityStatus === 'in_stock' && row.sourceAvailabilityVerified === true
    && row.stale !== true && row.sourceStale !== true && row.source_stale !== true
    && row.quantity === 0 && row.quantityIsExact === false
    && row.inventorySemantics === 'binary_retailer_in_store_availability'
    && ['limited', 'allocated', 'unicorn'].includes(row.tier)
    && Number.isFinite(row.price) && row.price > 0 && Number.isFinite(Date.parse(row.observedAt))
    && (!row.lastConfirmedAt || row.lastConfirmedAt === row.observedAt)
    && proof?.schemaVersion === 1 && proof.source === 'grocery-xapi' && proof.shadowOnly === true
    && proof.premisesVerified === true && proof.inStoreChannelVerified === true
    && proof.storeId === row.storeId && proof.storeAddress === row.storeAddress
    && proof.merchantId === row.merchantId && proof.productId === row.productId && proof.variantId === row.variantId
    && proof.observedAt === row.observedAt && proof.canonicalBottleId === row.canonicalBottleId && proof.price === row.price
    && String(product?.id) === row.productId && String(product?.pid) === row.variantId
    && String(product?.storeId) === row.merchantId && Number(product?.price) === row.price
    && product?.containsAlcohol === true && product.channelEligibility?.inStore === true
    && String(product.channelInventory?.instore ?? product.channelInventory?.inStore) === '1'
    && row.eligibleForOnSite === true && row.eligibleForDropFeed === true
    && row.alertable === false && row.canAlertAsInventory === false && row.canAlertAsWatch === false
    && row.can_alert_as_inventory !== true && row.can_alert_as_watch !== true && row.deliveryEligible !== true
    && row.eligibleForWatch === false && row.eligibleForDelivery === false
    && row.eligibleForEmail === false && row.eligibleForSms === false);
}
