import { NEVADA_RETAILER_SOURCES } from './collectors/nevada-retailer-surfaces.mjs';

const TRUSTED_SOURCES = new Map(NEVADA_RETAILER_SOURCES.map((source) => [source.id, source]));

function sourceLabel(signal) { return String(signal?.sourceLabel || signal?.source || ''); }
function eventType(signal) { return String(signal?.eventType || signal?.type || ''); }
function stateCode(signal) { return String(signal?.stateCode || signal?.state || '').toUpperCase(); }
function hostname(value) { try { return new URL(String(value || '')).hostname.toLowerCase(); } catch { return ''; } }

function sourceForSignal(signal) {
  const explicit = String(signal?.sourceChain || signal?.raw?.chain || '').trim();
  if (TRUSTED_SOURCES.has(explicit)) return TRUSTED_SOURCES.get(explicit);
  return NEVADA_RETAILER_SOURCES.find((source) => sourceLabel(signal) === source.sourceLabel) || null;
}

export function isNevadaRetailerSignalIdentity(signal) {
  const source = sourceForSignal(signal);
  if (!source || stateCode(signal) !== 'NV') return false;
  if (hostname(signal?.sourceUrl) !== source.host) return false;
  if (String(signal?.storeId || '') !== source.store.id) return false;
  if (String(signal?.merchantId || signal?.raw?.merchantId || '') !== source.merchantId) return false;
  if (String(signal?.storeAddress || '') !== source.store.address) return false;
  if (String(signal?.city || '').toLowerCase() !== source.store.city.toLowerCase()) return false;
  if (sourceLabel(signal) !== source.sourceLabel) return false;
  return true;
}

export function isNevadaRetailerInventory(signal) {
  const source = sourceForSignal(signal);
  if (!source?.inventoryEligible || !isNevadaRetailerSignalIdentity(signal)) return false;
  if (eventType(signal) !== 'retailer_store_inventory_result') return false;
  if (signal?.locationPrecision !== 'store_level') return false;
  if (!String(signal?.productId || '').trim()) return false;
  if (signal?.sourceAvailabilityVerified !== true || signal?.raw?.fulfillmentPolicyVerified !== true) return false;
  const semantics = String(signal?.inventorySemantics || '');
  const quantity = Number(signal?.quantity || 0);
  if (source.platform === 'cityhive') {
    if (!String(signal?.optionId || signal?.variantId || '').trim()) return false;
    if (semantics === 'exact_retailer_quantity') return Number.isFinite(quantity) && quantity > 0 && quantity < 100;
    return semantics === 'binary_retailer_orderable_no_exact_count' && quantity === 0;
  }
  if (source.platform === 'albertsons-xapi') {
    if (!String(signal?.variantId || '').trim()) return false;
    if (semantics === 'exact_retailer_quantity') return Number.isFinite(quantity) && quantity > 0 && quantity < 100;
    return semantics === 'binary_retailer_orderable_no_exact_count' && quantity === 0;
  }
  if (!String(signal?.variantId || '').trim()) return false;
  return semantics === 'binary_retailer_orderable_no_exact_count' && quantity === 0;
}

export const NEVADA_RETAILER_POLICY = Object.freeze({
  id: 'nevada_first_party_retailer',
  confidenceFloor: 0.82,
  caveat: 'First-party Nevada retailer availability may be binary rather than an exact shelf count. Verify pickup availability with the retailer before driving.',
});
