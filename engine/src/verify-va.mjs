import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isVirginiaRegularInventoryExpired, minimumVirginiaSiteLocationCount } from './collectors/virginia-inventory-recovery.mjs';

const OUT = path.resolve('out');
const VIRGINIA_INVENTORY_MAX_AGE_MS = Math.max(60 * 60_000, Number(process.env.BOURBON_SIGNAL_VA_INVENTORY_MAX_AGE_MS || 24 * 60 * 60_000));

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function assert(condition, message, detail = null) {
  if (!condition) {
    const error = new Error(message);
    error.detail = detail;
    throw error;
  }
}

function groupBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item) || 'missing';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

async function main() {
  const snapshot = await readJson(path.join(OUT, 'current-snapshot.json'));
  const drops = await readJson(path.join(OUT, 'site', 'drops.json'));
  const alerts = await readJson(path.join(OUT, 'site', 'alerts.json'));
  const locations = await readJson(path.join(OUT, 'site', 'locations.json'));
  const state = await readJson(path.join(OUT, 'states', 'VA.json'));

  const signals = (snapshot.signals || []).filter((signal) => signal.state === 'VA');
  const vaDrops = (drops.drops || []).filter((drop) => drop.state === 'VA');
  const vaLocations = (locations.locations || []).filter((location) => location.state === 'VA');
  const storeSignals = signals.filter((signal) => signal.locationPrecision === 'store_level');
  const nowMs = Date.now();
  const expiredInventorySignals = storeSignals.filter((signal) => isVirginiaRegularInventoryExpired(signal, nowMs, VIRGINIA_INVENTORY_MAX_AGE_MS));
  const expiredInventoryIds = new Set(expiredInventorySignals.flatMap((signal) => [signal.sourceSignalId, signal.key].filter(Boolean)));
  const inventorySignals = signals.filter((signal) => signal.canAlertAsInventory);
  const positiveSignals = signals.filter((signal) => signal.eventType === 'store_inventory_result' && Number(signal.quantity || 0) > 0 && !signal.sourceStale && !expiredInventoryIds.has(signal.sourceSignalId || signal.key));
  const productCodes = new Set(signals.map((signal) => signal.productCode || String(signal.sourceUrl || '').match(/productCode=([^&]+)/)?.[1]).filter(Boolean));
  const canonicalNames = new Set(signals.map((signal) => signal.canonicalName).filter(Boolean));
  const bad1792 = signals.filter((signal) => /1792\s+Small\s+Batch/i.test(String(signal.rawName || '')) && /Full\s+Proof/i.test(String(signal.canonicalName || '')));
  const invalidOriginRoadblocks = (state.roadblocks || []).filter((roadblock) => /No Store exists/i.test(String(roadblock.error || '')));
  const directPage403s = (state.roadblocks || []).filter((roadblock) => Number(roadblock.status) === 403 && /abc\.virginia\.gov\/products/i.test(String(roadblock.url || '')));
  const rateLimitRoadblocks = (state.roadblocks || []).filter((roadblock) => Number(roadblock.status) === 429);
  const rollingFreshnessRoadblocks = (state.roadblocks || []).filter((roadblock) => roadblock.source === 'Virginia ABC rolling inventory freshness');
  const staleAlertableSignals = signals.filter((signal) => (signal.stale || signal.sourceStale || expiredInventoryIds.has(signal.sourceSignalId || signal.key))
    && (signal.alertable || signal.canAlertAsInventory || signal.canAlertAsWatch));
  const stateAlertableSignals = signals.filter((signal) => signal.alertable || signal.canAlertAsInventory || signal.canAlertAsWatch);
  const alertableDrops = vaDrops.filter((drop) => drop.alertable || drop.canAlertAsInventory || drop.canAlertAsWatch);
  const expiredAlertableDrops = alertableDrops.filter((drop) => expiredInventoryIds.has(drop.sourceSignalId || drop.sourceSignalKey || drop.key || drop.id));
  const eligibleAlertCandidates = (alerts.alerts || []).filter((candidate) => candidate.state === 'VA'
    && (candidate.eligibleForDelivery || candidate.eligibleForOnSite || candidate.eligibleForEmail || candidate.eligibleForSms));
  const supportedOriginStoreIds = new Set((state.precisionMetadata?.virginia?.supportedOriginStoreIds || []).map(String));
  const verifiedPriorityStoreIds = new Set((state.precisionMetadata?.virginia?.verifiedPriorityStoreIds || []).map(String));
  const rejectedPriorityStoreIds = (state.precisionMetadata?.virginia?.rejectedPriorityStoreIds || []).map(String);
  const requiredTargetStoreId = String(process.env.BOURBON_SIGNAL_VA_REQUIRED_STORE_ID || '').trim();
  const targetStoreSignals = signals.filter((signal) => String(signal.storeId || '') === '49'
    && signal.locationPrecision === 'store_level'
    && signal.stale !== true
    && signal.sourceStale !== true
    && !expiredInventoryIds.has(signal.sourceSignalId || signal.key));
  const targetStoreDrops = vaDrops.filter((drop) => String(drop.storeId || '') === '49'
    && drop.locationPrecision === 'store_level'
    && drop.stale !== true
    && drop.sourceStale !== true
    && Number(drop.quantity || 0) > 0);
  const regularProductCoverage = new Map();
  for (const signal of signals) {
    if (signal.sourceStale || expiredInventoryIds.has(signal.sourceSignalId || signal.key) || signal.productLimitedCaveat !== false || !signal.storeId) continue;
    const code = signal.productCode || String(signal.sourceUrl || '').match(/productCode=([^&]+)/)?.[1];
    if (!code) continue;
    if (!regularProductCoverage.has(code)) regularProductCoverage.set(code, new Set());
    regularProductCoverage.get(code).add(String(signal.storeId));
  }
  const undercoveredRegularProducts = [...regularProductCoverage.entries()]
    .filter(([, stores]) => stores.size < 390)
    .map(([code, stores]) => ({ code, storeCount: stores.size }));
  const missingSupportedStores = [...regularProductCoverage.entries()]
    .map(([code, stores]) => ({ code, missingStoreIds: [...supportedOriginStoreIds].filter((storeId) => !stores.has(storeId)) }))
    .filter((entry) => entry.missingStoreIds.length);
  const unexpectedSupportedStores = [...regularProductCoverage.entries()]
    .map(([code, stores]) => ({ code, unexpectedStoreIds: [...stores].filter((storeId) => !supportedOriginStoreIds.has(storeId)) }))
    .filter((entry) => entry.unexpectedStoreIds.length);
  const allowSafeStaleFallback = process.argv.includes('--allow-safe-stale-fallback');

  if (!requiredTargetStoreId && allowSafeStaleFallback && /^stale_/i.test(String(state.status || ''))) {
    assert(state.stale === true, 'VA degraded status must remain explicitly stale', { status: state.status, stale: state.stale });
    assert(Boolean(state.staleReason), 'VA degraded status must explain why the last trusted report was retained');
    assert(signals.length >= 700, 'VA retained signal count below safe degraded-lane threshold', signals.length);
    assert(storeSignals.length >= 700, 'VA retained store-level signal count below safe degraded-lane threshold', storeSignals.length);
    assert(!stateAlertableSignals.length, 'VA degraded lane must mark every retained signal non-alertable', stateAlertableSignals.slice(0, 10));
    assert(!alertableDrops.length, 'VA degraded lane must mark every public drop non-alertable', alertableDrops.slice(0, 10));
    assert(!eligibleAlertCandidates.length, 'VA degraded lane must export zero eligible alert candidates', eligibleAlertCandidates.slice(0, 10));
    console.log(`VA safely isolated as ${state.status}: ${signals.length} retained signals and zero alertable signals, drops, or candidates. Other fresh states may publish while bounded Virginia recovery continues.`);
    return;
  }

  assert(state.status === 'useful', `VA state status must be useful, got ${state.status}`, { status: state.status, stale: state.stale, staleReason: state.staleReason });
  assert(!state.stale, 'VA must not be using stale fallback data', { status: state.status, staleReason: state.staleReason, staleFallbackAt: state.staleFallbackAt });
  assert(signals.length >= 700, 'VA signal count below definition-of-done threshold', signals.length);
  assert(storeSignals.length >= 700, 'VA store-level signal count below definition-of-done threshold', storeSignals.length);
  assert(inventorySignals.length >= 20, 'VA inventory-alertable signal count below current official-store availability threshold', inventorySignals.length);
  assert(positiveSignals.length >= 20, 'VA positive store inventory signal count below current official-store availability threshold', positiveSignals.length);
  assert(vaDrops.length >= 45, 'VA site drops below current customer-visible official-store availability threshold', vaDrops.length);
  const minimumSiteLocations = minimumVirginiaSiteLocationCount(state.precisionMetadata?.virginia?.supportedOriginStoreIds?.length);
  assert(vaLocations.length >= minimumSiteLocations, 'VA site locations below dynamic supported-store threshold', {
    actual: vaLocations.length,
    minimum: minimumSiteLocations,
    supportedOriginStores: state.precisionMetadata?.virginia?.supportedOriginStoreIds?.length || 0,
  });
  assert(productCodes.size >= 12, 'VA product-code coverage below expanded top-performer baseline', [...productCodes]);
  assert(!staleAlertableSignals.length, 'VA stale cache rows must never remain inventory-alertable', staleAlertableSignals.slice(0, 10));
  assert(!expiredAlertableDrops.length, 'VA public drops derived from expired inventory must remain non-alertable', expiredAlertableDrops.slice(0, 10));
  assert(state.precisionMetadata?.virginia?.storeUniverseVerified === true && supportedOriginStoreIds.size >= 390, 'VA supported-store universe is not verified', state.precisionMetadata?.virginia || null);
  assert(verifiedPriorityStoreIds.has('49') && !rejectedPriorityStoreIds.length, 'VA Ballston Store 49 official premises identity was not verified for first-priority probing', state.precisionMetadata?.virginia || null);
  if (requiredTargetStoreId) {
    assert(requiredTargetStoreId === '49', 'VA targeted recovery requested an unsupported exact-store publication gate', requiredTargetStoreId);
    assert(targetStoreSignals.some((signal) => signal.productLimitedCaveat === false && Number(signal.quantity || 0) > 0 && signal.canAlertAsInventory === true), 'VA Ballston Store 49 has no fresh positive regular-product inventory proof', targetStoreSignals);
    assert(targetStoreDrops.length > 0, 'VA Ballston Store 49 has no fresh customer-visible inventory card', targetStoreDrops);
  }
  assert(regularProductCoverage.size >= 10, 'VA fresh regular-product coverage is incomplete', [...regularProductCoverage.keys()]);
  assert(!undercoveredRegularProducts.length, 'VA regular products do not cover the statewide supported-store floor', undercoveredRegularProducts);
  assert(!missingSupportedStores.length, 'VA regular products are missing supported store identities', missingSupportedStores);
  assert(!unexpectedSupportedStores.length, 'VA regular products contain unsupported store identities', unexpectedSupportedStores);
  assert(canonicalNames.has('Buffalo Trace Bourbon'), 'VA Buffalo Trace canonical identity missing', [...canonicalNames]);
  assert(!canonicalNames.has('1792 Full Proof') || !bad1792.length, 'VA 1792 Small Batch is being misidentified as 1792 Full Proof', bad1792.slice(0, 10));
  assert(!invalidOriginRoadblocks.length, 'VA has stale/invalid store-origin roadblocks', invalidOriginRoadblocks.slice(0, 10));
  assert(!rateLimitRoadblocks.length, 'VA still has unresolved source rate-limit roadblocks', rateLimitRoadblocks.slice(0, 10));
  if (!allowSafeStaleFallback && rollingFreshnessRoadblocks.length) {
    assert(!staleAlertableSignals.length && !expiredAlertableDrops.length, 'VA retained product partitions must remain visible context only and never alertable', {
      rollingFreshnessRoadblocks,
      staleAlertableSignals: staleAlertableSignals.slice(0, 10),
      expiredAlertableDrops: expiredAlertableDrops.slice(0, 10)
    });
  }
  assert(directPage403s.length <= 4, 'VA has more direct product-page 403 roadblocks than expected', directPage403s.slice(0, 10));

  console.log(`VA verified: ${signals.length} signals, ${storeSignals.length} store-level, ${inventorySignals.length} inventory-alertable, ${positiveSignals.length} positive inventory, ${vaDrops.length} site drops, ${vaLocations.length} locations, ${productCodes.size} product codes. Event types: ${JSON.stringify(groupBy(signals, (s) => s.eventType))}`);
}

main().catch((error) => {
  console.error(error.message || error);
  if (error.detail) console.error(JSON.stringify(error.detail, null, 2));
  process.exit(1);
});
