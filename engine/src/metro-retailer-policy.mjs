import {
  COLORADO_RETAILER_SOURCES,
  NEW_YORK_RETAILER_SOURCES,
  isAllowedMetroBottle,
  normalizeMetroPremises,
} from './collectors/metro-retailer-surfaces.mjs';

const SOURCES = Object.freeze([...NEW_YORK_RETAILER_SOURCES, ...COLORADO_RETAILER_SOURCES]);
const SOURCE_BY_LABEL = new Map(SOURCES.map((source) => [source.sourceLabel, source]));

function sourceName(signal) {
  return String(signal?.sourceLabel || signal?.source || '').trim();
}

function exactNonEmptyValues(values, expected) {
  const present = values
    .filter((value) => value !== undefined && value !== null && value !== '')
    .map((value) => String(value));
  return present.length > 0 && present.every((value) => value === String(expected));
}

function exactNormalizedValues(values, expected) {
  const present = values
    .filter((value) => value !== undefined && value !== null && value !== '')
    .map(normalizeMetroPremises);
  const normalizedExpected = normalizeMetroPremises(expected);
  return present.length > 0 && present.every((value) => value === normalizedExpected);
}

function sourceUrl(signal) {
  try {
    const url = new URL(String(signal?.sourceUrl || ''));
    return url.protocol === 'https:' && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function chainMatches(signal, expected) {
  return exactNonEmptyValues([signal?.sourceChain, signal?.raw?.chain], expected);
}

function merchantMatches(signal, expected) {
  return exactNonEmptyValues([signal?.merchantId, signal?.raw?.merchantId], expected);
}

function productIdentityIsCoherent(signal) {
  const products = [signal?.productId, signal?.raw?.product?.id]
    .filter((value) => value !== undefined && value !== null && value !== '')
    .map(String);
  const variants = [signal?.variantId, signal?.raw?.variant?.id]
    .filter((value) => value !== undefined && value !== null && value !== '')
    .map(String);
  return products.length > 0
    && variants.length > 0
    && products.every((value) => value === products[0])
    && variants.every((value) => value === variants[0]);
}

function exactLocationName(signal, store) {
  if (!signal?.locationName) return false;
  const value = normalizeMetroPremises(signal.locationName);
  const storeName = normalizeMetroPremises(store.name);
  const address = normalizeMetroPremises(store.address);
  return value === storeName || (value.includes(storeName) && value.includes(address));
}

function exactProductUrl(signal, source) {
  const url = sourceUrl(signal);
  if (!url || url.origin !== new URL(source.baseUrl).origin) return false;
  if (source.platform === 'cityhive') {
    const parts = url.pathname.split('/').filter(Boolean);
    const query = [...url.searchParams.entries()];
    const variantId = String(signal.variantId || '');
    const productId = String(signal.productId || '');
    const itemListIdentityMode = String(signal?.raw?.productIdentityMode || '') === 'cityhive_itemlist_option_id';
    return parts.length === 4
      && parts[0] === 'shop'
      && parts[1] === 'product'
      && !url.hash
      && query.length === 1
      && query[0][0] === 'option-id'
      && query[0][1] === variantId
      && (
        parts[3] === productId
        || (itemListIdentityMode && parts[3] === 'null' && productId === variantId)
      );
  }
  const handle = String(signal?.productHandle || signal?.raw?.product?.handle || '').trim();
  if (!handle || url.search || url.hash || !/^\/products\/[a-z0-9][a-z0-9-]*$/u.test(url.pathname)) return false;
  return url.pathname === `/products/${handle}`;
}

function resolvedReportedQuantity(signal) {
  const present = [signal?.reportedQuantity, signal?.raw?.reportedQuantity]
    .filter((value) => value !== undefined && value !== null && value !== '')
    .map(Number);
  if (!present.length && signal?.quantityIsExact === true) present.push(Number(signal?.storeQty));
  if (!present.length || present.some((value) => !Number.isFinite(value) || !Number.isInteger(value) || value <= 0)) return NaN;
  return present.every((value) => value === present[0]) ? present[0] : NaN;
}

function formatDescription(signal) {
  return [
    signal?.rawName,
    signal?.canonicalName,
    signal?.size,
    signal?.raw?.product?.type,
    signal?.raw?.product?.tags,
    signal?.raw?.variant?.size,
  ].filter(Boolean).join(' ');
}

function sourceAndStore(signal) {
  const source = SOURCE_BY_LABEL.get(sourceName(signal));
  if (!source) return {};
  const merchantId = String(signal?.merchantId || signal?.raw?.merchantId || '').trim();
  const store = source.stores.find((candidate) => candidate.merchantId === merchantId);
  return { source, store, merchantId };
}

export function isMetroRetailerSignalIdentity(signal) {
  const { source, store, merchantId } = sourceAndStore(signal);
  if (!source || !store || !merchantId) return false;
  if (!exactNonEmptyValues([signal?.state, signal?.stateCode], source.stateCode)) return false;
  if (!exactNonEmptyValues([signal?.sourceLabel, signal?.source], source.sourceLabel)) return false;
  if (!/^(cityhive_store_inventory_result|retailer_store_inventory_result)$/iu.test(String(signal?.eventType || signal?.type || ''))) return false;
  if (!chainMatches(signal, source.id) || !merchantMatches(signal, merchantId)) return false;
  if (signal?.raw?.platform && signal.raw.platform !== source.platform) return false;
  if (!exactProductUrl(signal, source) || !productIdentityIsCoherent(signal)) return false;
  if (String(signal?.storeId || '') !== store.id || String(signal?.storeName || '') !== store.name) return false;
  if (!exactNormalizedValues([signal?.storeAddress, signal?.address], store.address)) return false;
  if (!exactNonEmptyValues([signal?.city, signal?.storeCity], store.city)) return false;
  if (!exactNonEmptyValues([signal?.postalCode, signal?.storePostalCode, signal?.zip], store.zip)) return false;
  if (signal?.area != null && signal.area !== source.area) return false;
  return exactLocationName(signal, store);
}

export function isMetroRetailerInventory(signal) {
  if (!isMetroRetailerSignalIdentity(signal)) return false;
  const { source } = sourceAndStore(signal);
  if (source.inventoryEligible !== true) return false;
  if (signal.locationPrecision !== 'store_level') return false;
  if (signal.availabilityStatus !== 'in_stock' || signal.sourceAvailabilityVerified !== true) return false;
  const rawName = String(signal.rawName || '').trim();
  const canonicalName = String(signal.canonicalName || signal.bottleName || '').trim();
  if (!rawName || !String(signal.canonicalBottleId || signal.bottleId || signal.canonicalId || '').trim()) return false;
  if (!canonicalName
    || !isAllowedMetroBottle(rawName)
    || !isAllowedMetroBottle(canonicalName)
    || !isAllowedMetroBottle(formatDescription(signal))) return false;
  if (/\brye\b/iu.test(rawName) !== /\brye\b/iu.test(canonicalName)) return false;
  if (signal.stale === true || signal.sourceStale === true || signal.raw?.staleFallback === true || signal.raw?.sourceRuntimeNonAlertable === true) return false;
  if (signal.canAlertAsInventory === false) return false;
  const observedMs = Date.parse(String(signal.observedAt || signal.fetchedAt || ''));
  const ageMs = Date.now() - observedMs;
  if (!Number.isFinite(observedMs) || ageMs < 0 || ageMs > 4 * 60 * 60_000) return false;
  if (typeof signal.quantity !== 'number' || !Number.isFinite(signal.quantity)) return false;

  if (source.platform === 'shopify') {
    const fulfillmentVerified = signal.fulfillmentPolicyVerified === true || signal.raw?.fulfillmentPolicyVerified === true;
    const premisesVerified = signal.premisesVerified === true || signal.raw?.premisesVerified === true;
    const availabilityProofs = [signal.variantAvailable, signal.raw?.variant?.available]
      .filter((value) => value !== undefined && value !== null);
    return fulfillmentVerified
      && premisesVerified
      && availabilityProofs.length > 0
      && availabilityProofs.every((value) => value === true)
      && signal.quantity === 0
      && signal.quantityIsExact === false
      && signal.inventorySemantics === 'binary_retailer_orderable_no_exact_count';
  }

  if (signal.pickupOfferVerified === false || signal.raw?.pickupOfferVerified === false) return false;
  if (signal.premisesVerified === false || signal.raw?.premisesVerified === false) return false;
  const reportedQuantity = resolvedReportedQuantity(signal);
  const binaryAvailability = signal.variantAvailable === true
    && signal.quantity === 0
    && signal.quantityIsExact === false;
  if (!Number.isFinite(reportedQuantity) && !binaryAvailability) return false;
  const binary = (reportedQuantity >= 100 || binaryAvailability)
    && signal.quantity === 0
    && signal.quantityIsExact === false
    && (signal.inventorySemantics === 'binary_retailer_orderable_no_exact_count'
      || signal.variantAvailable === true);
  const exact = reportedQuantity < 100
    && signal.quantity === reportedQuantity
    && signal.quantity > 0
    && signal.quantityIsExact === true
    && (signal.inventorySemantics === 'exact_retailer_reported_quantity'
      || signal.quantityIsExact === true);
  return binary || exact;
}

export function metroRetailerArea(signal) {
  if (!isMetroRetailerSignalIdentity(signal)) return null;
  return sourceAndStore(signal)?.source?.area || null;
}

export { SOURCE_BY_LABEL as METRO_RETAILER_IDENTITIES };
