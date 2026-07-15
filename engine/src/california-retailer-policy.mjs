import { CALIFORNIA_SAN_DIEGO_SHOPIFY_SOURCES } from './collectors/california-san-diego-surfaces.mjs';

const TRUSTED_SOURCES = new Map(CALIFORNIA_SAN_DIEGO_SHOPIFY_SOURCES.map((source) => [source.id, source]));

function sourceLabel(signal) {
  return String(signal?.sourceLabel || signal?.source || '');
}

function eventType(signal) {
  return String(signal?.eventType || signal?.type || '');
}

function stateCode(signal) {
  return String(signal?.stateCode || signal?.state || '').toUpperCase();
}

function hostname(value) {
  try { return new URL(String(value || '')).hostname.toLowerCase(); } catch { return ''; }
}

function sourceForSignal(signal) {
  const explicit = String(signal?.sourceChain || signal?.raw?.chain || '').trim();
  if (TRUSTED_SOURCES.has(explicit)) return TRUSTED_SOURCES.get(explicit);
  return CALIFORNIA_SAN_DIEGO_SHOPIFY_SOURCES.find((source) => sourceLabel(signal).includes(source.chainName)) || null;
}

export function isCaliforniaRetailerSignalIdentity(signal) {
  const source = sourceForSignal(signal);
  if (!source || stateCode(signal) !== 'CA') return false;
  if (hostname(signal?.sourceUrl) !== source.host) return false;
  if (String(signal?.storeId || '') !== source.store.id) return false;
  if (String(signal?.merchantId || '') !== source.merchantId) return false;
  if (String(signal?.storeAddress || '') !== source.store.address) return false;
  if (String(signal?.city || '').toLowerCase() !== source.store.city.toLowerCase()) return false;
  if (!sourceLabel(signal).includes(source.chainName)) return false;
  return true;
}

export function isCaliforniaRetailerInventory(signal) {
  const source = sourceForSignal(signal);
  if (!source?.inventoryEligible || !isCaliforniaRetailerSignalIdentity(signal)) return false;
  if (eventType(signal) !== 'retailer_store_inventory_result') return false;
  if (signal?.locationPrecision !== 'store_level') return false;
  if (!String(signal?.productId || '').trim() || !String(signal?.variantId || '').trim()) return false;
  if (signal?.sourceAvailabilityVerified !== true) return false;
  if (signal?.raw?.fulfillmentPolicyVerified !== true) return false;
  if (signal?.inventorySemantics !== 'binary_retailer_orderable_no_exact_count') return false;
  if (Number(signal?.quantity || 0) !== 0) return false;
  return true;
}

export const CALIFORNIA_RETAILER_POLICY = Object.freeze({
  id: 'california_san_diego_first_party_retailer',
  confidenceFloor: 0.82,
  caveat: 'First-party retailer availability is binary and not an exact shelf count. Verify pickup availability with the retailer before driving.',
});
