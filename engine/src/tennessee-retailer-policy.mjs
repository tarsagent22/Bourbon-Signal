import { registeredTennesseeStore } from './collectors/tennessee-retailer-surfaces.mjs';

const FORMAT_DENIAL_RE = /\b\d+\s*(?:-|x|\u00d7)\s*\d+\s*(?:ml|milliliters?)\b|\b(?:50|100|200|250|300|375)\s*(?:ml|milliliters?)\b|\b(?:mini|airplane|sample)\b|\b(?:\d+\s*(?:pack|pk)|pack\s+of\s+\d+|case\s+of\s+\d+|bundle|gift\s*set|sampler)\b|\b(?:candle|tumbler|glassware|ornament|merchandise)\b/i;
const POSITIVE_STATUS_RE = /^(?:in[_ ]stock|binary_retailer_in_stock|shopify_available|listed[_ ]for[_ ]pickup|available|orderable)$/i;

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function exact(value, expected) {
  return normalize(value) === normalize(expected);
}

function signalHost(signal) {
  try {
    const url = new URL(String(signal.sourceUrl || ''));
    return url.protocol === 'https:' ? url.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

function expectedProductPath(platform, value, productId) {
  try {
    const url = new URL(String(value || ''));
    const path = url.pathname;
    if (platform === 'cityhive') return /\/(?:shop\/)?product\//i.test(path);
    if (platform === 'shopify') return /\/products\//i.test(path);
    if (platform === 'bottlecapps') return /\/s\/1000-1057\/i\//i.test(path);
    if (platform === 'grabbl') return /\/products\//i.test(path);
    if (url.username || url.password || url.port || url.search || url.hash) return false;
    if (platform === 'lightspeed') return /^\/[a-z0-9-]+\.html$/i.test(path) && /^\d+$/.test(productId);
    if (platform === 'galaxy') return /^[a-z0-9_]+$/i.test(productId) && path === `/portfolio/${productId}`;
    return false;
  } catch {
    return false;
  }
}

export function isAllowedTennesseeBottleFormat(value) {
  const text = String(value || '').trim();
  return Boolean(text) && !FORMAT_DENIAL_RE.test(text);
}

export function isAllowedTennesseeCityHiveOption(option) {
  const sizes = [option?.option_params?.size, option?.option_display_data?.size].filter(Boolean);
  const volumes = sizes.map(({ measure, quantity }) => {
    const unit = String(measure || '').toLowerCase();
    if (unit === 'ml') return Number(quantity);
    if (unit === 'l') return Number(quantity) * 1_000;
    return NaN;
  });
  return !option?.preorder_details && volumes.length > 0 && [700, 750, 1_000, 1_750].includes(volumes[0])
    && volumes.every((volume) => volume === volumes[0]);
}

export function normalizeTennesseeCityHiveQuantity(value) {
  const reportedQuantity = Math.max(0, Math.floor(Number(value) || 0));
  const binaryAvailability = reportedQuantity >= 100;
  return {
    reportedQuantity,
    quantity: binaryAvailability ? 0 : reportedQuantity,
    quantityIsExact: !binaryAvailability,
    binaryAvailability,
  };
}

export function isTennesseeRetailerSignalIdentity(signal) {
  if (!signal || signal.state !== 'TN' || String(signal.stateCode || 'TN').toUpperCase() !== 'TN') return false;
  if (!/^(?:cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(String(signal.eventType || signal.type || ''))) return false;
  const sourceId = String(signal.sourceChain || signal.raw?.chain || '');
  const merchantId = String(signal.merchantId || signal.raw?.merchantId || signal.raw?.option?.merchant_id || '');
  const store = registeredTennesseeStore(sourceId, merchantId);
  if (!store) return false;
  if (!exact(signal.sourceLabel || signal.source, store.sourceLabel)) return false;
  if (signalHost(signal) !== store.hostname.toLowerCase() || !expectedProductPath(store.platform, signal.sourceUrl, signal.productId)) return false;
  if (!exact(signal.sourceChain || signal.raw?.chain, store.sourceId)) return false;
  if (!exact(signal.merchantId || signal.raw?.merchantId || signal.raw?.option?.merchant_id, store.merchantId)) return false;
  if (!exact(signal.storeId, store.storeId)) return false;
  if (!exact(signal.storeName || signal.locationName, store.name)) return false;
  if (!exact(signal.storeAddress, store.address)) return false;
  if (![store.city, ...store.cityAliases].some((city) => exact(signal.city || signal.storeCity, city))) return false;
  if (!exact(signal.zip || signal.postalCode, store.zip)) return false;
  if (!String(signal.productId || '').trim()) return false;
  const option = signal.raw?.option;
  if (store.platform === 'cityhive' && option && !isAllowedTennesseeCityHiveOption(option)) return false;
  return isAllowedTennesseeBottleFormat(signal.rawName || signal.bottleName || signal.canonicalName);
}

export function isTennesseeRetailerInventory(signal) {
  if (!isTennesseeRetailerSignalIdentity(signal)) return false;
  if (signal.sourceAvailabilityVerified !== true) return false;
  if (!POSITIVE_STATUS_RE.test(String(signal.availabilityStatus || signal.availabilityLabel || '').trim())) return false;
  const store = registeredTennesseeStore(
    String(signal.sourceChain || signal.raw?.chain || ''),
    String(signal.merchantId || signal.raw?.merchantId || signal.raw?.option?.merchant_id || ''),
  );
  if (!store) return false;
  const quantity = Number(signal.quantity || 0);
  const binary = signal.inventorySemantics === 'binary_retailer_orderable_no_exact_count'
    || signal.raw?.binaryAvailability === true
    || store.platform === 'shopify'
    || store.platform === 'grabbl'
    || store.platform === 'lightspeed'
    || store.platform === 'galaxy';
  if (binary) {
    return quantity === 0
      && signal.quantityIsExact === false
      && Number.isSafeInteger(Number(signal.reportedQuantity ?? signal.raw?.reportedQuantity))
      && Number(signal.reportedQuantity ?? signal.raw?.reportedQuantity) >= 1;
  }
  return Number.isFinite(quantity)
    && quantity > 0
    && signal.quantityIsExact === true
    && Number(signal.reportedQuantity ?? signal.raw?.reportedQuantity ?? quantity) === quantity;
}

export function tennesseeOperationalInventoryProof(signal) {
  if (!isTennesseeRetailerInventory(signal)) return {};
  return {
    reportedQuantity: Number(signal.reportedQuantity ?? signal.raw?.reportedQuantity ?? signal.quantity),
    inventorySemantics: signal.quantityIsExact
      ? 'exact_retailer_reported_quantity'
      : 'binary_retailer_orderable_no_exact_count',
  };
}
