import { MA_JULIOS_SOURCE as store } from './collectors/massachusetts-retailer-surfaces.mjs';
import { MA_ESPLANDA_PRODUCTS } from './collectors/massachusetts-esplanda.mjs';
import { isCentralCityHiveCanaryOnSiteSignal } from './central-cityhive-policy.mjs';

// This admits an isolated research export only. It grants no state activation,
// site publication or delivery authority.
export function isMassachusettsResearchInventory(row, { nowMs = Date.now() } = {}) {
  const esplanda = MA_ESPLANDA_PRODUCTS.find(source => source.id === row?.raw?.esplandaSourceId);
  if (esplanda) {
    if (row.state !== 'MA' || row.eventType !== 'retailer_store_inventory_result'
      || row.sourceChain !== 'massachusetts-esplanda' || row.sourceRuntimeId !== `precision:ma:esplanda:${esplanda.id}`
      || row.storeId !== esplanda.storeId || row.storeName !== esplanda.storeName || row.storeAddress !== esplanda.address
      || row.city !== esplanda.city || row.county !== esplanda.county || row.locationPrecision !== 'store_level'
      || row.merchantId !== esplanda.storeRef || row.productId !== esplanda.productId || row.variantId !== esplanda.formatId
      || row.canonicalBottleId !== (esplanda.identity.canonicalBottleId) || row.confidence !== 1
      || row.sourceAvailabilityVerified !== true || row.availabilityStatus !== 'orderable'
      || row.inventorySemantics !== 'binary_retailer_orderable_no_exact_count'
      || row.quantity !== 0 || row.quantityIsExact !== false || row.canAlertAsInventory !== true
      || row.canAlertAsWatch !== false || row.raw?.shadowOnly !== true || row.raw?.premisesVerified !== true
      || row.raw?.pickupOfferVerified !== true || row.raw?.sourceMatchStatus !== esplanda.identity.identityMethod
      || row.stale !== false || row.sourceStale !== false || !Number.isFinite(row.price) || row.price <= 0
      || ['alertable', 'eligibleForOnSite', 'eligibleForDelivery', 'eligibleForEmail', 'eligibleForSms'].some(key => row[key] !== false)) return false;
    const observedMs = Date.parse(row.observedAt);
    if (!Number.isFinite(nowMs) || !Number.isFinite(observedMs) || nowMs - observedMs > 2 * 60 * 60_000 || observedMs - nowMs > 5 * 60_000) return false;
    try {
      const url = new URL(row.sourceUrl);
      return url.href === esplanda.requestUrl && url.protocol === 'https:' && url.hostname === esplanda.hostname
        && !url.port && !url.username && !url.password && !url.hash;
    } catch { return false; }
  }
  if (!row || row.state !== 'MA' || row.eventType !== 'cityhive_store_inventory_result'
    || row.sourceChain !== store.id || row.merchantId !== store.merchantId
    || row.storeId !== store.storeId || row.storeAddress !== store.address
    || row.city !== store.city || row.county !== store.county || row.locationPrecision !== 'store_level'
    || !/^precision:ma:julios-westborough:[01]$/.test(row.sourceRuntimeId || '')
    || row.confidence !== 1 || !row.canonicalBottleId || !row.rawName
    || row.sourceAvailabilityVerified !== true || row.availabilityStatus !== 'orderable'
    || row.inventorySemantics !== 'binary_retailer_orderable_no_exact_count'
    || row.quantity !== 0 || row.quantityIsExact !== false || row.canAlertAsInventory !== true
    || row.canAlertAsWatch !== false || row.raw?.shadowOnly !== true
    || row.raw?.premisesVerified !== true || row.raw?.pickupOfferVerified !== true
    || row.raw?.sourceMatchStatus !== 'exact_bible_match'
    || row.stale !== false || row.sourceStale !== false || row.raw?.staleFallback
    || !Number.isFinite(row.price) || row.price <= 0
    || ['alertable', 'eligibleForOnSite', 'eligibleForDelivery', 'eligibleForEmail', 'eligibleForSms'].some(key => row[key] !== false)
    || /\b(?:cream|liqueur|cordial|cocktail|rtd|nip|nips|pack|bundle|gift|pre[ -]?order|back[ -]?order)\b/i.test(row.rawName)) return false;
  const observedMs = Date.parse(row.observedAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(observedMs) || nowMs - observedMs > 2 * 60 * 60_000 || observedMs - nowMs > 5 * 60_000) return false;
  try {
    const url = new URL(row.sourceUrl);
    return /^[a-z0-9_-]{2,120}$/i.test(row.productId || '') && /^[a-z0-9_-]{2,120}$/i.test(row.variantId || '')
      && url.protocol === 'https:' && url.hostname === store.hostname && !url.port && !url.username && !url.password
      && url.pathname.startsWith('/shop/product/') && url.pathname.split('/').filter(Boolean).at(-1) === row.productId
      && url.searchParams.getAll('option-id').length === 1 && url.searchParams.get('option-id') === row.variantId
      && [...url.searchParams.keys()].every(key => key === 'option-id') && !url.hash;
  } catch { return false; }
}

// This separate policy accepts only already prepared canary rows. It does not
// grant production or alert eligibility; the workflow preparer must first
// replay the original source bodies and attach the reviewed immutable binding.
export function isMassachusettsCanaryOnSiteSignal(row, { nowMs = Date.now() } = {}) {
  if (!row || row.state !== 'MA' || row.previewOnly !== true || row.locationPrecision !== 'store_level'
    || row.type !== 'retailer_store_inventory_result' && row.type !== 'cityhive_store_inventory_result'
    || row.canAlertAsInventory !== false || row.can_alert_as_inventory === true
    || row.canAlertAsWatch !== false || row.can_alert_as_watch === true || row.alertable === true
    || row.eligibleForOnSite !== true || row.eligibleForDropFeed !== true || row.eligibleForWatch !== false
    || row.eligibleForDelivery !== false || row.eligibleForEmail !== false || row.eligibleForSms !== false
    || row.deliveryEligible === true || row.quantity !== undefined && row.quantity !== null && row.quantity !== 0
    || row.quantityIsExact !== false || !['binary_retailer_orderable_no_exact_count'].includes(row.quantitySemantics || row.inventorySemantics)
    || row.sourceAvailabilityVerified !== true
    || row.stale === true || row.sourceStale === true || !Number.isFinite(row.price) || row.price <= 0) return false;
  const proof = row.sourceProductBinding;
  if (!proof || proof.schemaVersion !== 1 || proof.storeId !== row.storeId || proof.storeAddress !== row.storeAddress
    || proof.productId !== row.productId || proof.optionId !== row.variantId || proof.rawName !== row.rawName
    || proof.canonicalBottleId !== row.canonicalBottleId || proof.canonicalName !== row.canonicalName
    || proof.price !== row.price || proof.observedAt !== row.observedAt || proof.premisesVerified !== true
    || proof.pickupOfferVerified !== true || proof.quantitySemantics !== 'binary_retailer_orderable_no_exact_count') return false;
  if (proof.source === 'central-cityhive') return isCentralCityHiveCanaryOnSiteSignal(row, { nowMs });
  if (proof.source === 'massachusetts-esplanda') {
    const source = MA_ESPLANDA_PRODUCTS.find(candidate => candidate.id === proof.sourceId);
    if (!source || row.type !== 'retailer_store_inventory_result' || row.sourceChain !== 'massachusetts-esplanda'
      || row.sourceRuntimeId !== `precision:ma:esplanda:${source.id}` || row.sourceUrl !== source.requestUrl
      || row.sourceLabel !== `${source.storeName} public pickup inventory` || row.storeId !== source.storeId
      || row.storeName !== source.storeName || row.storeAddress !== source.address || row.city !== source.city
      || row.zip != null && row.zip !== source.zip || row.merchantId !== source.storeRef || row.productId !== source.productId
      || row.variantId !== source.formatId || row.canonicalBottleId !== source.identity.canonicalBottleId
      || proof.merchantId !== source.storeRef || proof.sourceUrl !== source.requestUrl
      || proof.identityMethod !== source.identity.identityMethod || row.availabilityStatus !== 'orderable') return false;
    return Number.isFinite(Date.parse(row.observedAt)) && nowMs - Date.parse(row.observedAt) >= 0
      && nowMs - Date.parse(row.observedAt) <= 2 * 60 * 60_000;
  }
  if (proof.source === 'massachusetts-julios') {
    if (row.type !== 'cityhive_store_inventory_result' || row.sourceChain !== store.id
      || row.sourceRuntimeId?.startsWith('precision:ma:julios-westborough:') !== true
      || row.storeId !== store.storeId || row.storeName !== store.storeName || row.storeAddress !== store.address
      || row.city !== store.city || row.merchantId !== store.merchantId || proof.merchantId !== store.merchantId
      || proof.sourceUrl !== row.sourceUrl || row.availabilityStatus !== 'orderable') return false;
    try {
      const url = new URL(row.sourceUrl);
      const proofUrl = new URL(proof.sourceUrl);
      return url.origin === store.baseUrl && proofUrl.href === url.href && !url.username && !url.password && !url.hash
        && url.pathname.split('/').filter(Boolean).length === 4 && url.pathname.split('/').filter(Boolean)[0] === 'shop'
        && url.pathname.split('/').filter(Boolean)[1] === 'product' && url.pathname.split('/').filter(Boolean).at(-1) === row.productId
        && [...url.searchParams.keys()].every(key => key === 'option-id') && url.searchParams.get('option-id') === row.variantId
        && Number.isFinite(Date.parse(row.observedAt)) && nowMs - Date.parse(row.observedAt) >= 0
        && nowMs - Date.parse(row.observedAt) <= 2 * 60 * 60_000;
    } catch { return false; }
  }
  return false;
}
