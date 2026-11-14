import { isCentralCityHiveCanaryOnSiteSignal } from './central-cityhive-policy.mjs';

// Keep this browser bundle policy data-only. The Node collectors import
// node:fs/path and must never enter the Next client graph.
const ESPLANDA = Object.freeze({
  sourceId: 'wildduck-boston-eagle-rare-10', storeId: 'ma:wildduck-boston',
  storeName: 'The Wild Duck Liquor Store', storeAddress: '86 Massachusetts Ave, Boston, MA 02117, USA',
  city: 'Boston', zip: '02117', merchantId: 'https://www.wildduckliquors.com/#store',
  productId: '58473338', optionId: '59718348',
  sourceUrl: 'https://www.wildduckliquors.com/product/10-year-bourbon-eagle-rare/58473338?format=59718348',
  sourceLabel: 'The Wild Duck Liquor Store public pickup inventory',
  rawName: 'Eagle Rare 10 Year Bourbon 750 ML', canonicalBottleId: 'bb_d0fe561ac45db2d5',
  canonicalName: 'Eagle Rare 10 Year', identityMethod: 'exact-bible-name-and-store-product-id',
});

const JULIOS = Object.freeze({
  sourceId: 'julios-westborough', storeId: 'ma-julios-westborough', storeName: "Julio's Liquors",
  storeAddress: '140 Turnpike Road, Westborough, MA 01581, USA', city: 'Westborough',
  merchantId: '5defe30f3916d12203336bcf', productId: '56553d8e69702d2923120000',
  optionId: 'b56a6adeb1ad500184602447d60e35e0600270238ba5ee3cc53632f7a2ff4a3c',
  rawName: 'WILD TURKEY RARE BREED', canonicalBottleId: 'bb_22604f9ddde2b6ba',
  canonicalName: 'Wild Turkey Rare Breed Straight Bourbon', baseUrl: 'https://juliosliquors.com',
});

export function isMassachusettsCanaryOnSiteSignal(row, { nowMs = Date.now() } = {}) {
  if (!row || row.state !== 'MA' || row.previewOnly !== true || row.locationPrecision !== 'store_level'
    || row.type !== 'retailer_store_inventory_result' && row.type !== 'cityhive_store_inventory_result'
    || row.canAlertAsInventory !== false || row.can_alert_as_inventory === true
    || row.canAlertAsWatch !== false || row.can_alert_as_watch === true || row.alertable === true
    || row.eligibleForOnSite !== true || row.eligibleForDropFeed !== true || row.eligibleForWatch !== false
    || row.eligibleForDelivery !== false || row.eligibleForEmail !== false || row.eligibleForSms !== false
    || row.deliveryEligible === true || row.quantity !== undefined && row.quantity !== null && row.quantity !== 0
    || row.quantityIsExact !== false || row.quantitySemantics !== 'binary_retailer_orderable_no_exact_count'
    && row.inventorySemantics !== 'binary_retailer_orderable_no_exact_count'
    || row.sourceAvailabilityVerified !== true || row.stale === true || row.sourceStale === true
    || !Number.isFinite(row.price) || row.price <= 0) return false;
  const proof = row.sourceProductBinding;
  if (!proof || proof.schemaVersion !== 1 || proof.storeId !== row.storeId || proof.storeAddress !== row.storeAddress
    || proof.productId !== row.productId || proof.optionId !== row.variantId || proof.rawName !== row.rawName
    || proof.canonicalBottleId !== row.canonicalBottleId || proof.canonicalName !== row.canonicalName
    || proof.price !== row.price || proof.observedAt !== row.observedAt || proof.premisesVerified !== true
    || proof.pickupOfferVerified !== true || proof.quantitySemantics !== 'binary_retailer_orderable_no_exact_count') return false;
  if (proof.source === 'central-cityhive') return isCentralCityHiveCanaryOnSiteSignal(row, { nowMs });
  if (proof.source === 'massachusetts-esplanda') {
    if (proof.sourceId !== ESPLANDA.sourceId || row.type !== 'retailer_store_inventory_result'
      || row.sourceChain !== 'massachusetts-esplanda' || row.sourceRuntimeId !== `precision:ma:esplanda:${ESPLANDA.sourceId}`
      || row.sourceUrl !== ESPLANDA.sourceUrl || row.sourceLabel !== ESPLANDA.sourceLabel
      || row.storeId !== ESPLANDA.storeId || row.storeName !== ESPLANDA.storeName || row.storeAddress !== ESPLANDA.storeAddress
      || row.city !== ESPLANDA.city || row.zip != null && row.zip !== ESPLANDA.zip || row.merchantId !== ESPLANDA.merchantId
      || row.productId !== ESPLANDA.productId || row.variantId !== ESPLANDA.optionId
      || row.rawName !== ESPLANDA.rawName || row.canonicalBottleId !== ESPLANDA.canonicalBottleId
      || row.canonicalName !== ESPLANDA.canonicalName || proof.merchantId !== ESPLANDA.merchantId
      || proof.sourceUrl !== ESPLANDA.sourceUrl || proof.identityMethod !== ESPLANDA.identityMethod
      || row.availabilityStatus !== 'orderable') return false;
    const age = nowMs - Date.parse(row.observedAt);
    return Number.isFinite(age) && age >= 0 && age <= 2 * 60 * 60_000;
  }
  if (proof.source === 'massachusetts-julios') {
    if (proof.sourceId !== JULIOS.sourceId || row.type !== 'cityhive_store_inventory_result'
      || row.sourceChain !== 'julios-westborough' || !/^precision:ma:julios-westborough:[01]$/.test(row.sourceRuntimeId || '')
      || row.storeId !== JULIOS.storeId || row.storeName !== JULIOS.storeName || row.storeAddress !== JULIOS.storeAddress
      || row.city !== JULIOS.city || row.merchantId !== JULIOS.merchantId || proof.merchantId !== JULIOS.merchantId
      || row.productId !== JULIOS.productId || row.variantId !== JULIOS.optionId || row.rawName !== JULIOS.rawName
      || row.canonicalBottleId !== JULIOS.canonicalBottleId || row.canonicalName !== JULIOS.canonicalName
      || row.availabilityStatus !== 'orderable') return false;
    try {
      const url = new URL(row.sourceUrl);
      const proofUrl = new URL(proof.sourceUrl);
      const parts = url.pathname.split('/').filter(Boolean);
      const age = nowMs - Date.parse(row.observedAt);
      return url.origin === JULIOS.baseUrl && proofUrl.href === url.href && !url.username && !url.password && !url.hash
        && parts.length === 4 && parts[0] === 'shop' && parts[1] === 'product' && parts.at(-1) === JULIOS.productId
        && [...url.searchParams.keys()].length === 1 && url.searchParams.get('option-id') === JULIOS.optionId
        && Number.isFinite(age) && age >= 0 && age <= 2 * 60 * 60_000;
    } catch { return false; }
  }
  return false;
}
