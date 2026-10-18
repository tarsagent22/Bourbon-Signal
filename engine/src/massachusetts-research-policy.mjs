import { MA_JULIOS_SOURCE as store } from './collectors/massachusetts-retailer-surfaces.mjs';

// This admits an isolated research export only. It grants no state activation,
// site publication or delivery authority.
export function isMassachusettsResearchInventory(row, { nowMs = Date.now() } = {}) {
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
