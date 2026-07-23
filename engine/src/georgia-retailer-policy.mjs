import {
  GEORGIA_CITYHIVE_SOURCES,
  GEORGIA_GOTOLIQUOR_STORES,
  GEORGIA_LIGHTSPEED_STORES,
  isAllowedGeorgiaBourbonIdentity,
  isAllowedGeorgiaBottleFormat,
} from './collectors/georgia-retailer-surfaces.mjs';

const CITYHIVE_BY_LABEL = new Map(GEORGIA_CITYHIVE_SOURCES.map((source) => [source.sourceLabel, source]));
const GOTOLIQUOR_BY_LABEL = new Map(GEORGIA_GOTOLIQUOR_STORES.map((store) => [store.sourceLabel, store]));
const LIGHTSPEED_BY_LABEL = new Map(GEORGIA_LIGHTSPEED_STORES.map((store) => [store.sourceLabel, store]));

function hostname(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.hostname.toLowerCase() : '';
  } catch { return ''; }
}

function sourceUrl(signal) {
  try { return new URL(String(signal?.sourceUrl || '')); } catch { return null; }
}

function sourceName(signal) {
  return String(signal?.sourceLabel || signal?.source || '');
}

function exactNonEmptyValues(values, expected) {
  const present = values.map((value) => String(value || '')).filter(Boolean);
  return present.length > 0 && present.every((value) => value === expected);
}

function chainMatches(signal, expected) {
  return exactNonEmptyValues([signal?.sourceChain, signal?.raw?.chain], expected);
}

function merchantMatches(signal, expected) {
  return exactNonEmptyValues([signal?.merchantId, signal?.raw?.merchantId, signal?.raw?.option?.merchant_id], expected);
}

function resolvedMerchantId(signal) {
  return String(signal?.merchantId || signal?.raw?.merchantId || signal?.raw?.option?.merchant_id || '');
}

function exactStoreIdentity(signal, store) {
  return chainMatches(signal, store.chain)
    && merchantMatches(signal, store.merchantId)
    && hostname(signal.sourceUrl) === store.hostname
    && String(signal.storeId || '') === store.storeId
    && exactNonEmptyValues([signal.storeName, signal.locationName], store.name)
    && String(signal.storeAddress || '') === store.address
    && exactNonEmptyValues([signal.city, signal.storeCity], store.city)
    && exactNonEmptyValues([signal.postalCode, signal.storePostalCode, signal.zip], store.postalCode || store.zip);
}

function resolvedReportedQuantity(signal) {
  const present = [signal?.reportedQuantity, signal?.raw?.reportedQuantity, signal?.raw?.option?.quantity]
    .filter((value) => value !== undefined && value !== null && value !== '')
    .map(Number);
  if (!present.length || present.some((value) => !Number.isFinite(value) || !Number.isInteger(value) || value <= 0)) return NaN;
  return present.every((value) => value === present[0]) ? present[0] : NaN;
}

function formatDescription(signal) {
  const optionSize = signal?.raw?.option?.option_params?.size;
  return [
    signal?.rawName,
    signal?.size,
    signal?.raw?.size,
    optionSize?.quantity && optionSize?.measure ? `${optionSize.quantity}${optionSize.measure}` : '',
    JSON.stringify(signal?.raw?.option?.option_params || {}),
    JSON.stringify(signal?.raw?.option?.option_display_data || {}),
  ].filter(Boolean).join(' ');
}

function hasCoherentProductIdentity(signal) {
  // CityHive's parent product id and merchant option product_id are distinct by design.
  // The collector publishes the merchant option id as productId, so compare only
  // representations of that same source identity.
  const values = [signal?.productId, signal?.raw?.productId, signal?.raw?.option?.product_id]
    .map((value) => String(value || ''))
    .filter(Boolean);
  return values.length > 0 && values.every((value) => value === values[0]);
}

function isGuardedGeorgiaBourbon(signal) {
  const hasBottleIdentity = Boolean(signal?.canonicalBottleId || signal?.bottleId || signal?.canonicalId)
    && Boolean(signal?.canonicalName || signal?.bottleName);
  if (!hasBottleIdentity) return false;
  return isAllowedGeorgiaBourbonIdentity(signal?.rawName, signal?.canonicalName || signal?.bottleName);
}

export function isGeorgiaRetailerSignalIdentity(signal) {
  if (signal?.state !== 'GA' || (signal?.stateCode && signal.stateCode !== 'GA')) return false;
  if (!/^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(String(signal.eventType || signal.type || ''))) return false;
  const source = sourceName(signal);
  if (!exactNonEmptyValues([signal?.sourceLabel, signal?.source], source)) return false;

  const cityHive = CITYHIVE_BY_LABEL.get(source);
  if (cityHive) {
    const id = resolvedMerchantId(signal);
    const store = cityHive.merchants.get(id);
    const url = sourceUrl(signal);
    return Boolean(store)
      && chainMatches(signal, cityHive.id)
      && merchantMatches(signal, id)
      && hostname(signal.sourceUrl) === new URL(cityHive.baseUrl).hostname.toLowerCase()
      && /\/shop\/product\//i.test(url?.pathname || '')
      && String(signal.storeId || '') === `${cityHive.id}:${id}`
      && exactNonEmptyValues([signal.storeName, signal.locationName], store.name)
      && String(signal.storeAddress || '') === store.address
      && exactNonEmptyValues([signal.city, signal.storeCity], store.city)
      && exactNonEmptyValues([signal.postalCode, signal.storePostalCode, signal.zip], store.postalCode || store.zip);
  }

  const goTo = GOTOLIQUOR_BY_LABEL.get(source);
  if (goTo) {
    const url = sourceUrl(signal);
    return exactStoreIdentity(signal, goTo)
      && !url.search
      && !url.hash
      && /^\/p\/[^/]+\/\d+\/?$/i.test(url.pathname);
  }
  const lightspeed = LIGHTSPEED_BY_LABEL.get(source);
  if (lightspeed) {
    const url = sourceUrl(signal);
    return exactStoreIdentity(signal, lightspeed)
      && !url.search
      && !url.hash
      && /\.html$/i.test(url.pathname)
      && !/\/cart\//i.test(url.pathname);
  }
  return false;
}

export function isGeorgiaRetailerInventory(signal) {
  if (!isGeorgiaRetailerSignalIdentity(signal)) return false;
  if (signal.locationPrecision !== 'store_level') return false;
  if (signal.availabilityStatus !== 'in_stock' || signal.sourceAvailabilityVerified !== true) return false;
  if (!String(signal.rawName || '').trim() || !hasCoherentProductIdentity(signal) || !isGuardedGeorgiaBourbon(signal)) return false;
  if (!isAllowedGeorgiaBottleFormat(formatDescription(signal))) return false;
  if (!/^.+,\s*GA\s+\d{5}(?:,\s*USA)?$/i.test(String(signal.storeAddress || ''))) return false;
  if (signal.stale === true || signal.sourceStale === true || signal.raw?.staleFallback === true) return false;

  const source = sourceName(signal);
  if (typeof signal.quantity !== 'number' || !Number.isFinite(signal.quantity)) return false;
  const quantity = Number(signal.quantity || 0);
  const binary = quantity === 0
    && signal.quantityIsExact === false
    && signal.inventorySemantics === 'binary_retailer_orderable_no_exact_count';
  const exactCityHive = CITYHIVE_BY_LABEL.has(source)
    && Number.isFinite(quantity)
    && Number.isInteger(quantity)
    && quantity > 0
    && quantity < 100
    && signal.quantityIsExact === true
    && signal.inventorySemantics === 'exact_retailer_reported_quantity';
  if (CITYHIVE_BY_LABEL.has(source)) {
    const reportedQuantity = resolvedReportedQuantity(signal);
    if (!Number.isFinite(reportedQuantity)) return false;
    if (binary && reportedQuantity < 100) return false;
    if (exactCityHive && reportedQuantity !== quantity) return false;
    if (!binary && !exactCityHive) return false;
  }
  if (GOTOLIQUOR_BY_LABEL.has(source) || LIGHTSPEED_BY_LABEL.has(source)) return binary;
  return binary || exactCityHive;
}

export { CITYHIVE_BY_LABEL as GEORGIA_CITYHIVE_IDENTITIES };
