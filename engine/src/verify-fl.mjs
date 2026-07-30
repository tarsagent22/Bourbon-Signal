import { readFile } from 'node:fs/promises';
import { isFloridaRetailerInventory, isFloridaRetailerSignalIdentity } from './florida-retailer-policy.mjs';

function assert(condition, message, sample = null) {
  if (!condition) throw new Error(`${message}${sample ? `\n${JSON.stringify(sample, null, 2).slice(0, 2000)}` : ''}`);
}

const allowSafeStaleFallback = process.argv.includes('--allow-safe-stale-fallback');
const maxInventoryAgeMs = Math.min(90 * 60_000, Math.max(15 * 60_000, Number(process.env.BOURBON_SIGNAL_FL_MAX_INVENTORY_AGE_MS) || 90 * 60_000));
const now = Date.now();
const state = JSON.parse(await readFile(process.env.BOURBON_SIGNAL_FL_VERIFY_FILE || 'out/states/FL.json', 'utf8'));
const signals = state.signals || [];
const inventory = signals.filter((signal) => /^(retailer_store_inventory_result|cityhive_store_inventory_result)$/.test(signal.eventType));
const hasStaleMarker = (signal) => signal.stale === true
  || signal.sourceStale === true
  || signal.availabilityStatus === 'stale'
  || signal.raw?.staleNonAlertable === true
  || signal.raw?.staleFallback === true
  || signal.raw?.sourceStale === true
  || signal.raw?.cacheFallback === true;
const isFresh = (signal) => {
  const observedAt = new Date(signal.observedAt || 0).getTime();
  return Number.isFinite(observedAt) && observedAt <= now && now - observedAt <= maxInventoryAgeMs;
};
const staleFallbacks = inventory.filter(hasStaleMarker);
const activeInventory = inventory.filter((signal) => !hasStaleMarker(signal));
const trusted = activeInventory.filter((signal) => isFresh(signal) && isFloridaRetailerInventory(signal));
const trustedStores = new Set(trusted.map((signal) => signal.storeId));
const trustedCities = new Set(trusted.map((signal) => signal.city));
const configuredLocations = signals.filter((signal) => signal.eventType === 'retailer_store_location' && signal.raw?.configuredStoreIdentity === true);
const unsafe = activeInventory.filter((signal) => !isFresh(signal)
  || !isFloridaRetailerSignalIdentity(signal)
  || signal.state !== 'FL'
  || signal.stateCode !== 'FL'
  || !/,\s*FL\s+\d{5}/i.test(signal.storeAddress || '')
  || signal.locationPrecision !== 'store_level'
  || !signal.storeId
  || Number(signal.quantity || 0) < 0
  || (Number(signal.raw?.reportedQuantity || 0) >= 100 && Number(signal.quantity || 0) > 1)
  || signal.sourceAvailabilityVerified !== true
  || signal.canAlertAsInventory !== true
  || signal.availabilityStatus !== 'in_stock');
const unsafeFallbacks = staleFallbacks.filter((signal) => signal.canAlertAsInventory === true
  || signal.canAlertAsWatch === true
  || signal.sourceAvailabilityVerified === true
  || signal.availabilityStatus !== 'stale');
const smallFormats = signals.filter((signal) => (signal.canAlertAsInventory || signal.canAlertAsWatch) && /\b(?:50|100|187|200|250|375)\s*ml\b/i.test(signal.rawName || ''));
const minimumStoreCount = allowSafeStaleFallback ? 20 : 30;
const minimumCityCount = allowSafeStaleFallback ? 15 : 24;
const minimumSourceCount = allowSafeStaleFallback ? 5 : 8;

const allowedStatuses = allowSafeStaleFallback ? ['useful', 'useful_retained_not_due'] : ['useful'];
assert(allowedStatuses.includes(state.status), `Expected Florida status ${allowedStatuses.join(' or ')}; got ${state.status}`);
assert(!state.stale, `Florida collector must not publish stale state fallback: ${state.staleReason || 'stale=true'}`);
assert(configuredLocations.length >= 34, `Expected at least 34 reviewed Florida CityHive store locations; got ${configuredLocations.length}.`);
assert(trusted.length > 0, 'Expected guarded Florida retailer inventory signals.');
assert(trustedStores.size >= minimumStoreCount, `Expected at least ${minimumStoreCount} fresh exact Florida inventory stores; got ${trustedStores.size}.`);
assert(trustedCities.size >= minimumCityCount, `Expected at least ${minimumCityCount} Florida inventory cities; got ${trustedCities.size}.`);
assert(new Set(trusted.map((signal) => signal.sourceLabel)).size >= minimumSourceCount, `Expected at least ${minimumSourceCount} live Florida retailer inventory sources.`);
assert(trustedCities.has('Kissimmee') || trustedCities.has('Orlando'), 'Expected verified Central Florida inventory.');
assert([...trustedCities].some((city) => ['Tampa', 'Clearwater', 'Riverview', 'Largo', 'Saint Petersburg', 'Brandon', 'Wesley Chapel', 'Lutz'].includes(city)), 'Expected verified Tampa Bay inventory.');
if (!allowSafeStaleFallback) {
  for (const city of ['Jacksonville', 'Sarasota', 'Gainesville', 'West Palm Beach', 'Fort Lauderdale']) {
    assert(trustedCities.has(city), `Expected fresh exact-store Florida expansion inventory in ${city}.`);
  }
  assert([...trustedCities].some((city) => ['Pensacola', 'Gulf Breeze', 'Fort Walton Beach', 'Destin', 'Crestview', 'Panama City Beach'].includes(city)), 'Expected fresh exact-store Panhandle inventory.');
}
const liquorDepotWatches = signals.filter((signal) => signal.sourceLabel === 'Liquor Depot Tampa online quantity watch');
assert(liquorDepotWatches.length > 0, 'Expected Liquor Depot Tampa chain-level online quantity watches.');
assert(liquorDepotWatches.every((signal) => signal.canAlertAsInventory === false && signal.locationPrecision === 'store_aggregate'), 'Liquor Depot chain quantities must never masquerade as exact-store inventory.', liquorDepotWatches);
assert(!unsafe.length, 'Florida inventory contains unsafe provenance, geography, freshness, or quantity semantics.', unsafe);
assert(!unsafeFallbacks.length, 'Florida stale cache fallback must remain visibly stale and non-alertable.', unsafeFallbacks);
assert(!smallFormats.length, 'Florida inventory and watch rows should exclude miniature formats.', smallFormats);

console.log(JSON.stringify({
  status: 'ok',
  mode: allowSafeStaleFallback ? 'scheduled-safe-fallback' : 'targeted-strict',
  stateStatus: state.status,
  inventorySignals: trusted.length,
  stores: trustedStores.size,
  configuredStores: configuredLocations.length,
  cities: [...trustedCities].sort(),
  sources: [...new Set(trusted.map((signal) => signal.sourceLabel))].sort(),
  staleNonAlertableFallbacks: staleFallbacks.length,
  maxInventoryAgeMinutes: maxInventoryAgeMs / 60_000,
  sample: trusted.slice(0, 6).map((signal) => ({ bottle: signal.canonicalName, price: signal.price, store: signal.storeName, availability: signal.availabilityLabel })),
}, null, 2));
