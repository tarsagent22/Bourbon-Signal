const SOUTHERN_SPIRITS_SOURCE = 'Southern Spirits Shopify products feed';
const SOUTHERN_SPIRITS_STORE_ID = 'southern-spirits:southern-spirits-indian-land';
const SOUTHERN_SPIRITS_ADDRESS = '9989 charlotte hwy indian land sc 29707';
const SOUTHERN_SPIRITS_MAX_AGE_MS = 2 * 60 * 60_000;
const ALL_AMERICAN_SOURCE = 'All American Liquor Mauldin WooCommerce in-store availability';
const ALL_AMERICAN_STORE_ID = 'all-american-liquor:all-american-liquor-mauldin';
const ALL_AMERICAN_ADDRESS = '121 w butler rd mauldin sc 29662';
const ALL_AMERICAN_MAX_AGE_MS = 2 * 60 * 60_000;
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

function exactAllAmericanProductUrl(signal) {
  try {
    const url = new URL(String(signal?.sourceUrl || ''));
    return url.protocol === 'https:'
      && url.hostname === 'www.aalmauldin.com'
      && /^\/product\/[a-z0-9-]+\/$/.test(url.pathname)
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

export function isSouthCarolinaAllAmericanInventory(signal, nowMs = Date.now()) {
  const eventType = String(signal?.eventType || signal?.type || '');
  const sourceChain = String(signal?.sourceChain || '');
  const productId = String(signal?.productId || '').trim();
  const sku = String(signal?.sku || '').trim();
  const rawProduct = signal?.raw?.product;
  const observedAt = Date.parse(String(signal?.observedAt || signal?.lastConfirmedAt || signal?.firstSeenAt || ''));
  const ageMs = nowMs - observedAt;
  return signal?.state === 'SC'
    && signal?.stateCode === 'SC'
    && eventType === 'retailer_store_inventory_result'
    && signal?.sourceLabel === ALL_AMERICAN_SOURCE
    && sourceChain === 'all-american-liquor'
    && (signal?.raw == null || signal.raw.chain === 'all-american-liquor')
    && signal?.locationPrecision === 'store_level'
    && signal?.storeId === ALL_AMERICAN_STORE_ID
    && signal?.storeName === 'All American Liquor'
    && signal?.city === 'Mauldin'
    && String(signal?.postalCode || signal?.zip || '') === '29662'
    && normalizedIdentity(signal?.storeAddress) === ALL_AMERICAN_ADDRESS
    && Boolean(signal?.canonicalBottleId || signal?.canonicalId)
    && Boolean(String(signal?.rawName || signal?.bottleName || signal?.canonicalName || '').trim())
    && productId.length > 0
    && sku.length > 0
    && signal?.sourceProductProofId === productId
    && signal?.sourceProductProofSku === sku
    && signal?.sourceProductInStock === true
    && signal?.sourceProductBackordered === false
    && (rawProduct == null || (String(rawProduct.id ?? '') === productId
      && String(rawProduct.sku ?? '') === sku
      && rawProduct.is_in_stock === true
      && rawProduct.is_on_backorder === false))
    && exactAllAmericanProductUrl(signal)
    && signal?.quantity === 0
    && signal?.storeQty === 0
    && signal?.quantityIsExact === false
    && signal?.quantitySemantics === 'binary_retailer_in_stock'
    && signal?.sourceAvailabilityVerified === true
    && signal?.availabilityStatus === 'in_stock'
    && signal?.orderabilityOfferVerified === false
    && signal?.stale !== true
    && signal?.sourceStale !== true
    && Number.isFinite(observedAt)
    && ageMs >= -MAX_FUTURE_SKEW_MS
    && ageMs <= ALL_AMERICAN_MAX_AGE_MS;
}

export function isSouthCarolinaAllAmericanSignal(signal) {
  let sourceHost = '';
  try { sourceHost = new URL(String(signal?.sourceUrl || '')).hostname.toLowerCase(); } catch {}
  const sourceLabel = String(signal?.sourceLabel || signal?.source || '');
  const sourceChain = String(signal?.sourceChain || '');
  const rawChain = String(signal?.raw?.chain || '');
  const storeId = String(signal?.storeId || signal?.sourceStoreId || signal?.id || '');
  return sourceLabel === ALL_AMERICAN_SOURCE
    || sourceLabel.toLowerCase().startsWith('all american liquor')
    || sourceChain.startsWith('all-american-liquor')
    || rawChain.startsWith('all-american-liquor')
    || sourceHost === 'aalmauldin.com'
    || sourceHost === 'www.aalmauldin.com'
    || storeId === ALL_AMERICAN_STORE_ID
    || storeId.startsWith('all-american-liquor:');
}

export function hasSouthCarolinaAllAmericanRawSourceProof(signal) {
  const productId = String(signal?.productId || '').trim();
  const sku = String(signal?.sku || '').trim();
  return signal?.raw?.chain === 'all-american-liquor'
    && String(signal?.raw?.product?.id ?? '') === productId
    && String(signal?.raw?.product?.sku ?? '') === sku
    && signal?.raw?.product?.is_in_stock === true
    && signal?.raw?.product?.is_on_backorder === false;
}

export function isSouthCarolinaAllAmericanLocation(signal) {
  const observedAt = Date.parse(String(signal?.observedAt || ''));
  const ageMs = Date.now() - observedAt;
  return signal?.state === 'SC'
    && signal?.stateCode === 'SC'
    && signal?.eventType === 'retailer_store_location'
    && signal?.sourceLabel === ALL_AMERICAN_SOURCE
    && signal?.sourceUrl === 'https://www.aalmauldin.com'
    && signal?.locationPrecision === 'store_level'
    && signal?.storeId === ALL_AMERICAN_STORE_ID
    && signal?.storeName === 'All American Liquor'
    && normalizedIdentity(signal?.storeAddress) === ALL_AMERICAN_ADDRESS
    && signal?.city === 'Mauldin'
    && String(signal?.postalCode || signal?.zip || '') === '29662'
    && signal?.canAlertAsInventory === false
    && signal?.canAlertAsWatch === false
    && signal?.raw?.chain === 'all-american-liquor'
    && signal?.raw?.store?.id === 'all-american-liquor-mauldin'
    && signal?.raw?.store?.name === 'All American Liquor'
    && normalizedIdentity(signal?.raw?.store?.address) === ALL_AMERICAN_ADDRESS
    && signal?.raw?.store?.city === 'Mauldin'
    && String(signal?.raw?.store?.zip || '') === '29662'
    && Number.isFinite(observedAt)
    && ageMs >= -MAX_FUTURE_SKEW_MS
    && ageMs <= ALL_AMERICAN_MAX_AGE_MS;
}

export function isSouthCarolinaAllAmericanStoreExport(store) {
  return store?.id === ALL_AMERICAN_STORE_ID
    && store?.sourceStoreId === ALL_AMERICAN_STORE_ID
    && store?.state === 'SC'
    && store?.name === 'All American Liquor'
    && normalizedIdentity(store?.address) === ALL_AMERICAN_ADDRESS
    && store?.city === 'Mauldin'
    && String(store?.zip || '') === '29662'
    && store?.source === ALL_AMERICAN_SOURCE
    && Number(store?.signalCount || 0) > 0
    && store?.hasSignals === true
    && store?.collectorAttached === true
    && store?.sourceAvailabilityVerified === true;
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
  if (isSouthCarolinaAllAmericanSignal(signal)) return isSouthCarolinaAllAmericanInventory(signal);
  if (isSouthCarolinaSouthernSpiritsSignal(signal)) return isSouthCarolinaSouthernSpiritsInventory(signal);
  return Number(signal?.quantity || 0) > 0;
}
