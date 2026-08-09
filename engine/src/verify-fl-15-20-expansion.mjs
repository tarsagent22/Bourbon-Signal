import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

import { FLORIDA_EXPANSION_STORE_TARGETS } from './collectors/florida-15-20-expansion.mjs';
import { isFloridaRetailerInventory } from './florida-retailer-policy.mjs';

const EXPECTED_BASELINE_STORE_IDS_SHA256 = '947b15aeb247b25ff09e8e98f475a552a605c6eee1f83c39e1b09dce40b2fcfb';

function assert(condition, message, sample = null) {
  if (!condition) throw new Error(`${message}${sample ? `\n${JSON.stringify(sample, null, 2).slice(0, 2500)}` : ''}`);
}

const statePath = process.env.BOURBON_SIGNAL_FL_15_20_VERIFY_FILE || process.env.BOURBON_SIGNAL_FL_VERIFY_FILE || 'out/states/FL.json';
const baselinePath = process.env.BOURBON_SIGNAL_FL_15_20_BASELINE_FILE || 'data/florida-15-20-baseline.json';
const state = JSON.parse(await readFile(statePath, 'utf8'));
const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
const now = Date.now();
const maxInventoryAgeMs = Math.min(90 * 60_000, Math.max(15 * 60_000, Number(process.env.BOURBON_SIGNAL_FL_MAX_INVENTORY_AGE_MS) || 90 * 60_000));
const targetByStoreId = new Map(FLORIDA_EXPANSION_STORE_TARGETS.map((store) => [store.storeId, store]));
const baselineContractIds = Array.isArray(baseline.inventoryStoreIds) ? baseline.inventoryStoreIds.map(String).sort() : null;
assert(baseline.contractVersion === 'bourbon-signal/florida-expansion-baseline@1', 'Invalid immutable Florida expansion baseline contract version.');
assert(baselineContractIds, 'Immutable Florida expansion baseline must contain inventoryStoreIds.');
assert(baseline.inventoryStoreIdsSha256 === EXPECTED_BASELINE_STORE_IDS_SHA256, 'Immutable Florida expansion baseline does not match the pinned pre-expansion digest.');
const baselineDigest = createHash('sha256').update(baselineContractIds.join('\n')).digest('hex');
assert(baselineDigest === baseline.inventoryStoreIdsSha256, 'Immutable Florida expansion baseline store-ID digest mismatch.');
const baselineInventoryStoreIds = new Set(baselineContractIds);
const alreadyLive = FLORIDA_EXPANSION_STORE_TARGETS.filter((store) => baselineInventoryStoreIds.has(store.storeId));
const inventory = (state.signals || []).filter((signal) => targetByStoreId.has(String(signal.storeId || ''))
  && /^(?:retailer|cityhive)_store_inventory_result$/i.test(String(signal.eventType || '')));
const freshTrusted = inventory.filter((signal) => {
  const observedAt = new Date(signal.observedAt || 0).getTime();
  return Number.isFinite(observedAt)
    && observedAt <= now
    && now - observedAt <= maxInventoryAgeMs
    && isFloridaRetailerInventory(signal);
});
const trustedStoreIds = new Set(freshTrusted.map((signal) => signal.storeId));
const missing = FLORIDA_EXPANSION_STORE_TARGETS.filter((store) => !trustedStoreIds.has(store.storeId));
const identityMismatches = freshTrusted.filter((signal) => {
  const target = targetByStoreId.get(signal.storeId);
  return !target
    || signal.sourceLabel !== target.sourceLabel
    || signal.sourceChain !== target.sourceChain
    || String(signal.merchantId || '') !== target.merchantId
    || signal.storeName !== target.name
    || signal.storeAddress !== target.address
    || signal.city !== target.city
    || String(signal.postalCode || signal.zip || '') !== target.zip;
});

assert(state.status === 'useful' && state.stale !== true, `Expected a fresh useful Florida state report; got status=${state.status}, stale=${state.stale}.`);
assert(FLORIDA_EXPANSION_STORE_TARGETS.length === 15, `Frozen Florida expansion registry must contain exactly 15 stores; got ${FLORIDA_EXPANSION_STORE_TARGETS.length}.`);
assert(targetByStoreId.size === 15, `Frozen Florida expansion store IDs must be unique; got ${targetByStoreId.size}.`);
assert(!alreadyLive.length, 'Frozen Florida expansion contains a store that was already live inventory in the immutable baseline.', alreadyLive);
assert(!FLORIDA_EXPANSION_STORE_TARGETS.some((store) => store.platform === 'target' || store.sourceChain === 'target'), 'Frozen Florida expansion must not contain Target stores.');
assert(trustedStoreIds.size === 15, `Expected fresh trusted inventory from all 15 frozen Florida expansion stores; got ${trustedStoreIds.size}.`, missing);
assert(!missing.length, 'Florida expansion state report is missing a frozen exact-store identity.', missing);
assert(!identityMismatches.length, 'Florida expansion state report contains an identity mismatch.', identityMismatches);

console.log(JSON.stringify({
  status: 'ok',
  stateStatus: state.status,
  stores: trustedStoreIds.size,
  inventorySignals: freshTrusted.length,
  baselineInventoryStores: baselineInventoryStoreIds.size,
  netNewLiveStores: trustedStoreIds.size,
  platforms: Object.fromEntries([...new Set(FLORIDA_EXPANSION_STORE_TARGETS.map((store) => store.platform))]
    .sort()
    .map((platform) => [platform, new Set(FLORIDA_EXPANSION_STORE_TARGETS.filter((store) => store.platform === platform).map((store) => store.storeId)).size])),
  storeIds: [...trustedStoreIds].sort(),
  maximumAgeMinutes: maxInventoryAgeMs / 60_000,
}, null, 2));
