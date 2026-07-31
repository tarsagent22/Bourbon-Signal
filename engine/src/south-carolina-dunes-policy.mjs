const DUNES_SOURCE_LABEL = 'Dunes Liquor Myrtle Beach integrated-cart inventory';
const DUNES_RUNTIME_ID = 'retailer:sc:dunes:6178';
const DUNES_STORE_ID = 'dunes-liquor:dunes-liquor-myrtle-beach';
const DUNES_ADDRESS = '980 cipriana drive unit a5 b myrtle beach sc 29572';
const DUNES_MAX_AGE_MS = 6 * 60 * 60_000;

function normalizedIdentity(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function hasExactDunesProductUrl(signal) {
  try {
    const url = new URL(String(signal.sourceUrl || ''));
    const sku = String(signal.sku || signal.raw?.sku || '').trim();
    return url.protocol === 'https:'
      && url.hostname === 'www.dunesliquor.com'
      && url.pathname === '/ListManage/ItemDescriptionPage'
      && url.searchParams.size === 1
      && url.searchParams.get('ItemID') === sku
      && /^\d+$/.test(sku);
  } catch {
    return false;
  }
}

export function isSouthCarolinaDunesInventory(signal, nowMs = Date.now()) {
  const eventType = String(signal?.eventType || signal?.signalType || signal?.type || '');
  const quantity = typeof signal?.quantity === 'number' ? signal.quantity : Number.NaN;
  const storeQty = typeof signal?.storeQty === 'number' ? signal.storeQty : Number.NaN;
  const price = typeof signal?.price === 'number' ? signal.price : Number.NaN;
  const observedMs = Date.parse(String(signal?.observedAt || ''));
  const ageMs = nowMs - observedMs;
  return signal?.state === 'SC'
    && signal?.stateCode === 'SC'
    && eventType === 'retailer_store_inventory_result'
    && signal?.sourceLabel === DUNES_SOURCE_LABEL
    && signal?.sourceRuntimeId === 'precision:sc'
    && (signal?.leafSourceRuntimeId || signal?.raw?.leafSourceRuntimeId) === DUNES_RUNTIME_ID
    && signal?.storeId === DUNES_STORE_ID
    && signal?.storeName === 'Dunes Liquor'
    && signal?.city === 'Myrtle Beach'
    && String(signal?.postalCode || signal?.zip || '') === '29572'
    && normalizedIdentity(signal?.storeAddress) === DUNES_ADDRESS
    && signal?.locationPrecision === 'store_level'
    && hasExactDunesProductUrl(signal)
    && String(signal?.runtimeStoreId || signal?.raw?.runtimeStoreId || '') === '6178'
    && (signal?.integratedCartVerified ?? signal?.raw?.integratedCartVerified) === true
    && (signal?.raw?.quantitySemantics == null || signal.raw.quantitySemantics === 'exact_retailer_in_store_quantity')
    && signal?.quantitySemantics === 'exact_retailer_in_store_quantity'
    && Number.isSafeInteger(quantity)
    && quantity > 0
    && storeQty === quantity
    && signal?.quantityIsExact === true
    && Number.isFinite(price)
    && price > 0
    && signal?.availabilityStatus === 'in_stock'
    && signal?.sourceAvailabilityVerified === true
    && signal?.premisesVerified === true
    && signal?.pickupOfferVerified === true
    && signal?.orderabilityOfferVerified === true
    && signal?.deliveryOfferVerified === false
    && signal?.fulfillmentGuaranteed === false
    && signal?.stale !== true
    && signal?.sourceStale !== true
    && Number.isFinite(observedMs)
    && ageMs >= -5 * 60_000
    && ageMs <= DUNES_MAX_AGE_MS;
}

export function isSouthCarolinaDunesSignal(signal) {
  let sourceHost = '';
  try { sourceHost = new URL(String(signal?.sourceUrl || '')).hostname.toLowerCase(); } catch {}
  return signal?.sourceLabel === DUNES_SOURCE_LABEL
    || signal?.sourceRuntimeId === DUNES_RUNTIME_ID
    || signal?.leafSourceRuntimeId === DUNES_RUNTIME_ID
    || signal?.raw?.leafSourceRuntimeId === DUNES_RUNTIME_ID
    || signal?.storeId === DUNES_STORE_ID
    || sourceHost === 'dunesliquor.com'
    || sourceHost === 'www.dunesliquor.com';
}
