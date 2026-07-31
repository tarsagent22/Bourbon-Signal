const SOUTHERN_SPIRITS_SOURCE = 'Southern Spirits Shopify products feed';
const SOUTHERN_SPIRITS_STORE_ID = 'southern-spirits:southern-spirits-indian-land';
const SOUTHERN_SPIRITS_ADDRESS = '9989 charlotte hwy indian land sc 29707';
const SOUTHERN_SPIRITS_MAX_AGE_MS = 2 * 60 * 60_000;
const MAX_FUTURE_SKEW_MS = 5 * 60_000;

function normalizedIdentity(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function exactProductUrl(signal, handle) {
  try {
    const url = new URL(String(signal?.sourceUrl || ''));
    return url.protocol === 'https:'
      && url.hostname === 'southernspirits.com'
      && url.pathname === `/products/${handle}`
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

export function isSouthCarolinaSouthernSpiritsInventory(signal, nowMs = Date.now()) {
  const eventType = String(signal?.eventType || signal?.type || '');
  const sourceChain = String(signal?.sourceChain || signal?.raw?.chain || '');
  const productId = String(signal?.productId || signal?.raw?.product?.id || '').trim();
  const productHandle = String(signal?.productHandle || signal?.raw?.product?.handle || '').trim();
  const variantId = String(signal?.variantId || signal?.raw?.variant?.id || '').trim();
  const variantAvailable = signal?.variantAvailable ?? signal?.raw?.variant?.available;
  const quantity = Number(signal?.quantity || 0);
  const storeQty = Number(signal?.storeQty || 0);
  const observedAt = Date.parse(String(signal?.observedAt || signal?.lastConfirmedAt || signal?.firstSeenAt || ''));
  const ageMs = nowMs - observedAt;
  return signal?.state === 'SC'
    && (signal?.stateCode == null || signal.stateCode === 'SC')
    && eventType === 'retailer_store_inventory_result'
    && signal?.sourceLabel === SOUTHERN_SPIRITS_SOURCE
    && sourceChain === 'southern-spirits'
    && signal?.locationPrecision === 'store_level'
    && signal?.storeId === SOUTHERN_SPIRITS_STORE_ID
    && signal?.storeName === 'Southern Spirits'
    && signal?.city === 'Indian Land'
    && String(signal?.postalCode || signal?.zip || '') === '29707'
    && normalizedIdentity(signal?.storeAddress) === SOUTHERN_SPIRITS_ADDRESS
    && Boolean(signal?.canonicalBottleId || signal?.canonicalId)
    && Boolean(String(signal?.rawName || signal?.bottleName || signal?.canonicalName || '').trim())
    && productId.length > 0
    && productHandle.length > 0
    && variantId.length > 0
    && (signal?.raw?.product?.id == null || String(signal.raw.product.id) === productId)
    && (signal?.raw?.product?.handle == null || String(signal.raw.product.handle) === productHandle)
    && (signal?.raw?.variant?.id == null || String(signal.raw.variant.id) === variantId)
    && variantAvailable === true
    && exactProductUrl(signal, productHandle)
    && quantity === 0
    && storeQty === 0
    && signal?.quantityIsExact === false
    && signal?.quantitySemantics === 'binary_retailer_in_stock'
    && signal?.sourceAvailabilityVerified === true
    && signal?.availabilityStatus === 'in_stock'
    && signal?.stale !== true
    && signal?.sourceStale !== true
    && Number.isFinite(observedAt)
    && ageMs >= -MAX_FUTURE_SKEW_MS
    && ageMs <= SOUTHERN_SPIRITS_MAX_AGE_MS;
}

export function isSouthCarolinaSouthernSpiritsSignal(signal) {
  let sourceHost = '';
  try { sourceHost = new URL(String(signal?.sourceUrl || '')).hostname.toLowerCase(); } catch {}
  const sourceLabel = String(signal?.sourceLabel || signal?.source || '');
  const sourceChain = String(signal?.sourceChain || '');
  const rawChain = String(signal?.raw?.chain || '');
  const storeId = String(signal?.storeId || '');
  return sourceLabel === SOUTHERN_SPIRITS_SOURCE
    || sourceLabel.toLowerCase().startsWith('southern spirits')
    || sourceChain.startsWith('southern-spirits')
    || rawChain.startsWith('southern-spirits')
    || sourceHost === 'southernspirits.com'
    || sourceHost === 'www.southernspirits.com'
    || storeId === SOUTHERN_SPIRITS_STORE_ID
    || storeId.startsWith('southern-spirits:');
}

export function hasSouthCarolinaPositiveInventoryEvidence(signal) {
  if (isSouthCarolinaSouthernSpiritsSignal(signal)) return isSouthCarolinaSouthernSpiritsInventory(signal);
  return Number(signal?.quantity || 0) > 0;
}
