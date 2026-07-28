import { createHash } from 'node:crypto';

import {
  isAllowedMississippiBottleFormat,
  MISSISSIPPI_RETAILER_SOURCES,
} from './collectors/mississippi-retailer-surfaces.mjs';
import { normalizeCityHivePremises } from './collectors/cityhive-surfaces.mjs';

function sourceForSignal(signal) {
  const permitNumber = String(signal?.permitNumber || signal?.raw?.permitNumber || '');
  const source = MISSISSIPPI_RETAILER_SOURCES.find((entry) => entry.permitNumber === permitNumber);
  if (!source) return null;
  const sourceLabelHash = createHash('sha256').update(String(signal.sourceLabel || '')).digest('hex');
  return sourceLabelHash === source.sourceLabelHash ? source : null;
}

function same(value, expected) {
  return String(value || '').trim() === String(expected || '').trim();
}

function samePremises(value, expected) {
  return normalizeCityHivePremises(value) === normalizeCityHivePremises(expected);
}

function exactProductUrl(signal, source) {
  try {
    const url = new URL(String(signal.sourceUrl || ''));
    if (url.protocol !== 'https:' || url.hostname !== source.hostname || url.username || url.password || url.hash) return false;
    if (source.platform === 'gotoliquorstore') {
      if (url.search) return false;
      const productId = url.pathname.match(/^\/p\/[^/]+\/(\d+)\/?$/iu)?.[1];
      return Boolean(productId) && productId === String(signal.productId || '');
    }
    if (source.platform === 'cityhive') {
      const parts = url.pathname.split('/').filter(Boolean);
      const query = [...url.searchParams.entries()];
      return parts.length === 4
        && parts[0] === 'shop'
        && parts[1] === 'product'
        && parts[3] === String(signal.productId || '')
        && query.length === 1
        && query[0][0] === 'option-id'
        && query[0][1] === String(signal.variantId || '');
    }
    if (source.platform === 'moonshine') {
      return !url.search
        && /^\/shop\/[a-z0-9][a-z0-9-]*-\d+\/?$/iu.test(url.pathname)
        && url.pathname.replace(/\/$/u, '').endsWith(`-${String(signal.productId || '')}`)
        && Boolean(String(signal.variantId || '').trim());
    }
    return false;
  } catch {
    return false;
  }
}

export function isMississippiRetailerSignalIdentity(signal) {
  const source = sourceForSignal(signal);
  if (!source) return false;
  return signal?.state === 'MS'
    && source.autonomousFetchAllowed !== false
    && source.sourcePolicyStatus === 'allowed'
    && same(signal.stateCode, 'MS')
    && same(signal.sourceLabel, source.sourceLabel)
    && same(signal.sourceChain, source.id)
    && same(signal.sourceRuntimeId, source.sourceRuntimeId)
    && same(signal.merchantId, source.merchantId)
    && same(signal.storeId, source.id)
    && same(signal.permitNumber, source.permitNumber)
    && same(signal.storeName || signal.locationName, source.name)
    && same(signal.city || signal.storeCity, source.city)
    && same(signal.county, source.county)
    && same(signal.regionId, source.regionId)
    && same(signal.zip || signal.postalCode, source.zip)
    && samePremises(signal.storeAddress, source.address)
    && same(signal.raw?.chain, source.id)
    && same(signal.raw?.merchantId, source.merchantId)
    && same(signal.raw?.controlStoreId || null, source.controlStoreId || null)
    && same(signal.raw?.displayedMerchantId, source.merchantId)
    && same(signal.raw?.platformStoreId, source.platformStoreId)
    && same(signal.raw?.permitNumber, source.permitNumber)
    && exactProductUrl(signal, source);
}

export function isMississippiRetailerInventoryEvidence(signal) {
  return /^(?:cityhive_store_inventory_result|retailer_store_inventory_result)$/iu.test(String(signal?.eventType || signal?.type || ''))
    && signal.sourceAvailabilityVerified === true
    && signal.pickupOfferVerified === true
    && signal.premisesVerified === true
    && signal.quantity === 0
    && signal.quantityIsExact === false
    && signal.inventorySemantics === 'binary_retailer_orderable_no_exact_count'
    && Boolean(String(signal.productId || '').trim())
    && Boolean(String(signal.canonicalBottleId || '').trim())
    && Boolean(String(signal.canonicalName || '').trim())
    && isAllowedMississippiBottleFormat(signal.rawName)
    && signal.stale !== true
    && signal.sourceStale !== true
    && signal.quarantined !== true
    && signal.raw?.sourceRuntimeNonAlertable !== true;
}

export function isMississippiRetailerInventory(signal) {
  return isMississippiRetailerSignalIdentity(signal) && isMississippiRetailerInventoryEvidence(signal);
}
