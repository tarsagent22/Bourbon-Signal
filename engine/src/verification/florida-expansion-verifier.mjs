import { createHash } from 'node:crypto';

import {
  FLORIDA_ABC_STORES,
  FLORIDA_ABC_STORE_REGISTRY_SHA256,
  FLORIDA_EXPANSION_STORE_TARGETS,
} from '../collectors/florida-15-20-expansion.mjs';
import { isFloridaRetailerInventory, isFloridaRetailerOutOfStockObservation } from '../florida-retailer-policy.mjs';

export const FLORIDA_EXPANSION_BASELINE_STORE_IDS_SHA256 = '947b15aeb247b25ff09e8e98f475a552a605c6eee1f83c39e1b09dce40b2fcfb';
export const FLORIDA_EXPANSION_TARGET_STORE_COUNT = 136;
export const FLORIDA_ABC_TARGET_STORE_COUNT = 126;

function assert(condition, message, sample = null) {
  if (!condition) throw new Error(`${message}${sample ? `\n${JSON.stringify(sample, null, 2).slice(0, 2500)}` : ''}`);
}

function signalIdentityMismatch(signal, target) {
  if (!target
    || signal.sourceLabel !== target.sourceLabel
    || signal.sourceChain !== target.sourceChain
    || String(signal.merchantId || '') !== target.merchantId
    || signal.storeName !== target.name
    || signal.storeAddress !== target.address
    || signal.city !== target.city
    || String(signal.postalCode || signal.zip || '') !== target.zip) return true;
  return target.platform === 'abc-searchspring'
    && (Number(signal.lat) !== target.lat || Number(signal.lng) !== target.lng);
}

export function verifyFloridaExpansionArtifact({ state, baseline, now = Date.now(), maxInventoryAgeMs = 90 * 60_000 } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const maximumAgeMs = Math.min(90 * 60_000, Math.max(15 * 60_000, Number(maxInventoryAgeMs) || 90 * 60_000));
  const targetByStoreId = new Map(FLORIDA_EXPANSION_STORE_TARGETS.map((store) => [store.storeId, store]));
  const baselineContractIds = Array.isArray(baseline?.inventoryStoreIds) ? baseline.inventoryStoreIds.map(String).sort() : null;

  assert(Number.isFinite(nowMs), 'Florida expansion verifier requires a valid current time.');
  assert(baseline?.contractVersion === 'bourbon-signal/florida-expansion-baseline@1', 'Invalid immutable Florida expansion baseline contract version.');
  assert(baselineContractIds, 'Immutable Florida expansion baseline must contain inventoryStoreIds.');
  assert(baseline?.inventoryStoreIdsSha256 === FLORIDA_EXPANSION_BASELINE_STORE_IDS_SHA256, 'Immutable Florida expansion baseline does not match the pinned pre-expansion digest.');
  const baselineDigest = createHash('sha256').update(baselineContractIds.join('\n')).digest('hex');
  assert(baselineDigest === baseline.inventoryStoreIdsSha256, 'Immutable Florida expansion baseline store-ID digest mismatch.');

  assert(state?.status === 'useful' && state?.stale !== true, `Expected a fresh useful Florida state report; got status=${state?.status}, stale=${state?.stale}.`);
  assert(FLORIDA_ABC_STORE_REGISTRY_SHA256 === 'd56369e11b4883b59d7dcadd4de48f4388bbc489b2549b8c3016744ab717e1cc', 'Immutable Florida ABC registry digest mismatch.');
  assert(FLORIDA_ABC_STORES.length === FLORIDA_ABC_TARGET_STORE_COUNT, `Immutable Florida ABC registry must contain exactly ${FLORIDA_ABC_TARGET_STORE_COUNT} stores; got ${FLORIDA_ABC_STORES.length}.`);
  assert(new Set(FLORIDA_ABC_STORES.map((store) => store.storeNumber)).size === FLORIDA_ABC_TARGET_STORE_COUNT, 'Immutable Florida ABC store codes must be unique.');
  assert(FLORIDA_EXPANSION_STORE_TARGETS.length === FLORIDA_EXPANSION_TARGET_STORE_COUNT, `Frozen Florida expansion registry must contain exactly ${FLORIDA_EXPANSION_TARGET_STORE_COUNT} stores; got ${FLORIDA_EXPANSION_STORE_TARGETS.length}.`);
  assert(targetByStoreId.size === FLORIDA_EXPANSION_TARGET_STORE_COUNT, `Frozen Florida expansion store IDs must be unique; got ${targetByStoreId.size}.`);
  assert(!FLORIDA_EXPANSION_STORE_TARGETS.some((store) => store.platform === 'target' || store.sourceChain === 'target'), 'Frozen Florida expansion must not contain Target stores.');

  const baselineInventoryStoreIds = new Set(baselineContractIds);
  const alreadyLive = FLORIDA_EXPANSION_STORE_TARGETS.filter((store) => baselineInventoryStoreIds.has(store.storeId));
  assert(!alreadyLive.length, 'Frozen Florida expansion contains a store that was already live inventory in the immutable baseline.', alreadyLive);

  const inventory = (state?.signals || []).filter((signal) => targetByStoreId.has(String(signal.storeId || ''))
    && /^(?:retailer|cityhive)_store_inventory_result$/i.test(String(signal.eventType || '')));
  const freshObserved = inventory.filter((signal) => {
    const observedAt = new Date(signal.observedAt || 0).getTime();
    return Number.isFinite(observedAt)
      && observedAt <= nowMs
      && nowMs - observedAt <= maximumAgeMs
      && (isFloridaRetailerInventory(signal) || isFloridaRetailerOutOfStockObservation(signal));
  });
  const freshTrustedInventory = freshObserved.filter(isFloridaRetailerInventory);
  const observedStoreIds = new Set(freshObserved.map((signal) => signal.storeId));
  const liveInventoryStoreIds = new Set(freshTrustedInventory.map((signal) => signal.storeId));
  const missing = FLORIDA_EXPANSION_STORE_TARGETS.filter((store) => !observedStoreIds.has(store.storeId));
  const identityMismatches = freshObserved.filter((signal) => signalIdentityMismatch(signal, targetByStoreId.get(signal.storeId)));
  assert(observedStoreIds.size === FLORIDA_EXPANSION_TARGET_STORE_COUNT, `Expected fresh trusted observation from all ${FLORIDA_EXPANSION_TARGET_STORE_COUNT} frozen Florida expansion stores; got ${observedStoreIds.size}.`, missing);
  assert(!missing.length, 'Florida expansion state report is missing a frozen exact-store identity.', missing);
  assert(!identityMismatches.length, 'Florida expansion state report contains an identity mismatch.', identityMismatches);

  return {
    status: 'ok',
    stateStatus: state.status,
    stores: observedStoreIds.size,
    abcStores: new Set(freshObserved.filter((signal) => String(signal.storeId || '').startsWith('abc-fine-wine-spirits:')).map((signal) => signal.storeId)).size,
    nonAbcStores: new Set(freshObserved.filter((signal) => !String(signal.storeId || '').startsWith('abc-fine-wine-spirits:')).map((signal) => signal.storeId)).size,
    inventorySignals: freshTrustedInventory.length,
    outOfStockObservations: freshObserved.length - freshTrustedInventory.length,
    baselineInventoryStores: baselineInventoryStoreIds.size,
    netNewLiveStores: liveInventoryStoreIds.size,
    abcRegistrySha256: FLORIDA_ABC_STORE_REGISTRY_SHA256,
    platforms: Object.fromEntries([...new Set(FLORIDA_EXPANSION_STORE_TARGETS.map((store) => store.platform))]
      .sort()
      .map((platform) => [platform, new Set(FLORIDA_EXPANSION_STORE_TARGETS.filter((store) => store.platform === platform).map((store) => store.storeId)).size])),
    storeIds: [...observedStoreIds].sort(),
    maximumAgeMinutes: maximumAgeMs / 60_000,
  };
}
