import { createHash } from 'node:crypto';

import {
  FLORIDA_STAR_LIQUORS_REGISTRY_SHA256,
  FLORIDA_STAR_LIQUORS_SOURCE,
} from '../collectors/florida-retailer-surfaces.mjs';
import { isFloridaRetailerInventory, isFloridaRetailerOutOfStockObservation } from '../florida-retailer-policy.mjs';

export const FLORIDA_STAR_EXPANSION_BASELINE_STORE_IDS_SHA256 = '608c32a62b1c603b0c723991036f339372052c0284241735fd8338ad5c64067a';
export const FLORIDA_STAR_EXPANSION_BASELINE_PREMISES_SHA256 = '1bfcac588e3ad40361125f67b6fc4a557e72eef8189d16001545bd40b3c44571';
export const FLORIDA_STAR_EXPANSION_BASELINE_STORE_COUNT = 180;
export const FLORIDA_STAR_EXPANSION_MINIMUM_NET_NEW_STORES = 20;
export const FLORIDA_STAR_EXPANSION_REGISTRY_STORE_COUNT = 24;

function assert(condition, message, sample = null) {
  if (!condition) throw new Error(`${message}${sample ? `\n${JSON.stringify(sample, null, 2).slice(0, 3000)}` : ''}`);
}

function normalizedPremise(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/gu, ' ').trim();
}

function freshLiveSignal(signal, nowMs, maximumAgeMs) {
  const observedAt = new Date(signal?.observedAt || 0).getTime();
  return signal?.state === 'FL'
    && /^(?:retailer|cityhive)_store_inventory_result$/iu.test(String(signal.eventType || signal.type || ''))
    && signal.locationPrecision === 'store_level'
    && signal.canAlertAsInventory === true
    && signal.sourceAvailabilityVerified === true
    && signal.availabilityStatus === 'in_stock'
    && Boolean(signal.storeId)
    && /,\s*FL\s+\d{5}/iu.test(String(signal.storeAddress || ''))
    && Number.isFinite(observedAt)
    && observedAt <= nowMs
    && nowMs - observedAt <= maximumAgeMs;
}

export function verifyFloridaStarExpansionArtifact({ state, baseline, now = Date.now(), maxInventoryAgeMs = 90 * 60_000 } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const maximumAgeMs = Math.min(90 * 60_000, Math.max(15 * 60_000, Number(maxInventoryAgeMs) || 90 * 60_000));
  const baselineIds = Array.isArray(baseline?.inventoryStoreIds) ? baseline.inventoryStoreIds.map(String).sort() : null;
  const baselinePremises = Array.isArray(baseline?.inventoryPremises)
    ? baseline.inventoryPremises.map((premise) => ({ storeId: String(premise?.storeId || ''), address: String(premise?.address || '') }))
    : null;
  const starStores = [...FLORIDA_STAR_LIQUORS_SOURCE.merchants.values()];
  const starStoreIds = new Set(starStores.map((store) => `${FLORIDA_STAR_LIQUORS_SOURCE.id}:${store.id}`));

  assert(Number.isFinite(nowMs), 'Florida Star expansion verifier requires a valid current time.');
  assert(baseline?.contractVersion === 'bourbon-signal/florida-star-expansion-baseline@1', 'Invalid immutable Florida Star expansion baseline contract version.');
  assert(baselineIds?.length === FLORIDA_STAR_EXPANSION_BASELINE_STORE_COUNT, `Immutable Florida baseline must contain exactly ${FLORIDA_STAR_EXPANSION_BASELINE_STORE_COUNT} store IDs.`);
  assert(new Set(baselineIds).size === FLORIDA_STAR_EXPANSION_BASELINE_STORE_COUNT, 'Immutable Florida baseline contains duplicate store IDs.');
  assert(baselinePremises?.length === FLORIDA_STAR_EXPANSION_BASELINE_STORE_COUNT, `Immutable Florida baseline must contain exactly ${FLORIDA_STAR_EXPANSION_BASELINE_STORE_COUNT} premises.`);
  assert(baseline?.inventoryStoreIdsSha256 === FLORIDA_STAR_EXPANSION_BASELINE_STORE_IDS_SHA256, 'Immutable Florida Star expansion baseline digest is not pinned.');
  assert(createHash('sha256').update(baselineIds.join('\n')).digest('hex') === FLORIDA_STAR_EXPANSION_BASELINE_STORE_IDS_SHA256, 'Immutable Florida Star expansion baseline store-ID digest mismatch.');
  const canonicalPremises = [...baselinePremises].sort((a, b) => a.storeId.localeCompare(b.storeId));
  const baselinePremisesSha256 = createHash('sha256').update(JSON.stringify(canonicalPremises)).digest('hex');
  assert(baseline?.inventoryPremisesSha256 === FLORIDA_STAR_EXPANSION_BASELINE_PREMISES_SHA256, 'Immutable Florida Star expansion premise digest is not pinned.');
  assert(baselinePremisesSha256 === FLORIDA_STAR_EXPANSION_BASELINE_PREMISES_SHA256, 'Immutable Florida Star expansion premise digest mismatch.');
  assert(Number(baseline.minimumNetNewStores) === FLORIDA_STAR_EXPANSION_MINIMUM_NET_NEW_STORES, 'Immutable Florida Star expansion minimum net-new target mismatch.');

  assert(FLORIDA_STAR_LIQUORS_REGISTRY_SHA256 === '88a77fc4eeccc115f8c8d7004a285db284b28723654dc5a371ccfcdf15ae76e8', 'Immutable Star Liquors registry digest mismatch.');
  assert(starStores.length === FLORIDA_STAR_EXPANSION_REGISTRY_STORE_COUNT && starStoreIds.size === FLORIDA_STAR_EXPANSION_REGISTRY_STORE_COUNT, 'Immutable Star Liquors registry must contain exactly 24 unique stores.');
  const baselineIdSet = new Set(baselineIds);
  const baselinePremiseIdSet = new Set(baselinePremises.map((premise) => premise.storeId));
  assert(baselinePremiseIdSet.size === baselineIdSet.size && [...baselineIdSet].every((storeId) => baselinePremiseIdSet.has(storeId)), 'Immutable Florida baseline premise IDs drifted from the store-ID set.');
  const baselinePremiseByStoreId = new Map(baselinePremises.map((premise) => [premise.storeId, normalizedPremise(premise.address)]));
  assert(![...starStoreIds].some((storeId) => baselineIdSet.has(storeId)), 'Star Liquors registry overlaps a baseline store ID.');
  const baselineAddressSet = new Set(baselinePremises.map((premise) => normalizedPremise(premise.address)));
  assert(baselineAddressSet.size === FLORIDA_STAR_EXPANSION_BASELINE_STORE_COUNT, 'Immutable Florida baseline contains duplicate physical premises.');
  assert(!starStores.some((store) => baselineAddressSet.has(normalizedPremise(store.address))), 'Star Liquors registry overlaps a baseline physical premise.');

  assert(state?.state === 'FL' && state?.status === 'useful' && state?.stale !== true, `Expected a fresh useful Florida state report; got state=${state?.state}, status=${state?.status}, stale=${state?.stale}.`);
  const inventorySignals = (state.signals || []).filter((signal) => freshLiveSignal(signal, nowMs, maximumAgeMs) && isFloridaRetailerInventory(signal));
  const observedSignals = (state.signals || []).filter((signal) => {
    const observedAt = new Date(signal?.observedAt || 0).getTime();
    return Number.isFinite(observedAt)
      && observedAt <= nowMs
      && nowMs - observedAt <= maximumAgeMs
      && (isFloridaRetailerInventory(signal) || isFloridaRetailerOutOfStockObservation(signal));
  });
  const currentStoreIds = new Set(inventorySignals.map((signal) => String(signal.storeId)));
  const observedStoreIds = new Set(observedSignals.map((signal) => String(signal.storeId)));
  const retainedBaselineStoreIds = new Set(observedSignals
    .filter((signal) => baselineIdSet.has(String(signal.storeId))
      && normalizedPremise(signal.storeAddress) === baselinePremiseByStoreId.get(String(signal.storeId)))
    .map((signal) => String(signal.storeId)));
  const removed = baselineIds.filter((storeId) => !retainedBaselineStoreIds.has(storeId));
  assert(!removed.length, `Florida expansion removed ${removed.length} immutable baseline store(s).`, removed);

  const freshTrustedStarSignals = inventorySignals.filter((signal) => starStoreIds.has(String(signal.storeId)) && isFloridaRetailerInventory(signal));
  const trustedStarStoreIds = new Set(freshTrustedStarSignals.map((signal) => String(signal.storeId)));
  assert(trustedStarStoreIds.size >= FLORIDA_STAR_EXPANSION_MINIMUM_NET_NEW_STORES, `Expected fresh trusted inventory from at least ${FLORIDA_STAR_EXPANSION_MINIMUM_NET_NEW_STORES} Star Liquors stores; got ${trustedStarStoreIds.size}.`);

  const netNewStoreIds = [...currentStoreIds].filter((storeId) => !baselineIdSet.has(storeId));
  assert(netNewStoreIds.length >= FLORIDA_STAR_EXPANSION_MINIMUM_NET_NEW_STORES, `Expected at least ${FLORIDA_STAR_EXPANSION_MINIMUM_NET_NEW_STORES} net-new Florida live-inventory stores; got ${netNewStoreIds.length}.`);

  return {
    status: 'ok',
    stateStatus: state.status,
    baselineStores: baselineIdSet.size,
    currentStores: currentStoreIds.size,
    observedStores: observedStoreIds.size,
    netNewStores: netNewStoreIds.length,
    starStores: trustedStarStoreIds.size,
    removedStores: removed.length,
    inventorySignals: inventorySignals.length,
    observedStoreSignals: observedSignals.length,
    starInventorySignals: freshTrustedStarSignals.length,
    maximumAgeMinutes: maximumAgeMs / 60_000,
    baselineStoreIdsSha256: FLORIDA_STAR_EXPANSION_BASELINE_STORE_IDS_SHA256,
    starRegistrySha256: FLORIDA_STAR_LIQUORS_REGISTRY_SHA256,
    netNewStoreIds: netNewStoreIds.sort(),
    starStoreIds: [...trustedStarStoreIds].sort(),
  };
}
