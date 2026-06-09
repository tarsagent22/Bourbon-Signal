import { readFile } from 'node:fs/promises';

async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const state = await readJson('out/states/TN.json');
const cache = await readJson('out/browser/TN-cityhive-retailer-inventory.json', { signals: [], sourceChains: [] });
const storesExport = await readJson('out/site/stores.json', { stores: [] });
const locationsExport = await readJson('out/site/locations.json', { locations: [] });
const dropsExport = await readJson('out/site/drops.json', { drops: [] });

assert(state, 'Missing out/states/TN.json; run node src/run-state.mjs TN first');
assert(state.status === 'useful', `Unexpected TN state status: ${state.status}`);
assert(!state.stale, `TN must not be using stale fallback data: ${state.staleReason || 'stale=true'}`);

const signals = state.signals || [];
const cityHiveInventorySignals = signals.filter((signal) => signal.eventType === 'cityhive_store_inventory_result');
const positiveCityHiveSignals = cityHiveInventorySignals.filter((signal) => Number(signal.quantity || 0) > 0 && signal.storeId && signal.storeAddress && signal.canAlertAsInventory);
const retailerInventorySignals = signals.filter((signal) => signal.eventType === 'retailer_store_inventory_result');
const positiveRetailerSignals = retailerInventorySignals.filter((signal) => Number(signal.quantity || 0) > 0 && signal.storeId && signal.storeAddress && signal.canAlertAsInventory);
const positiveInventorySignals = [...positiveCityHiveSignals, ...positiveRetailerSignals];
const cityHiveStoreLocations = signals.filter((signal) => signal.eventType === 'retailer_store_location' && /CityHive/i.test(String(signal.sourceLabel || '')));
const inventorySources = new Set(positiveInventorySignals.map((signal) => signal.sourceLabel).filter(Boolean));
const cityHiveSources = new Set(positiveCityHiveSignals.map((signal) => signal.sourceLabel).filter(Boolean));
const nonCityHiveSources = new Set(positiveRetailerSignals.map((signal) => signal.sourceLabel).filter(Boolean));
const inventoryCities = new Set(positiveInventorySignals.map((signal) => String(signal.city || '').trim()).filter(Boolean));
const inventoryStores = new Set(positiveInventorySignals.map((signal) => signal.storeName || signal.storeId).filter(Boolean));
const unsafeCanonicalMatches = positiveInventorySignals.filter((signal) => {
  const raw = String(signal.rawName || '').toLowerCase();
  const canonical = String(signal.canonicalName || '').toLowerCase();
  if (/\brye\b/.test(raw) && !/\brye\b/.test(canonical)) return true;
  if (/limited edition|batch proof|barrel proof|single barrel|small batch select|full proof|bottled-in-bond|bottled in bond/.test(canonical)
    && !/limited edition|batch proof|barrel proof|single barrel|small batch select|full proof|bottled-in-bond|bottled in bond|store pick|private selection/.test(raw)) return true;
  return false;
});

const tnDrops = (dropsExport.drops || []).filter((drop) => drop.state === 'TN');
const cityHiveDrops = tnDrops.filter((drop) => drop.type === 'cityhive_store_inventory_result');
const retailerDrops = tnDrops.filter((drop) => drop.type === 'retailer_store_inventory_result');
const inventoryDrops = [...cityHiveDrops, ...retailerDrops];
const alertableDrops = inventoryDrops.filter((drop) => drop.canAlertAsInventory && Number(drop.quantity || 0) > 0 && drop.storeId && drop.storeAddress);
const cityHiveAlertableDrops = cityHiveDrops.filter((drop) => drop.canAlertAsInventory && Number(drop.quantity || 0) > 0 && drop.storeId && drop.storeAddress);
const retailerAlertableDrops = retailerDrops.filter((drop) => drop.canAlertAsInventory && Number(drop.quantity || 0) > 0 && drop.storeId && drop.storeAddress);
const dropSources = new Set(inventoryDrops.map((drop) => drop.source).filter(Boolean));
const dropCities = new Set(inventoryDrops.map((drop) => String(drop.city || '').trim()).filter(Boolean));
const tnStores = (storesExport.stores || []).filter((store) => store.state === 'TN');
const tnLocations = (locationsExport.locations || []).filter((location) => location.state === 'TN');

assert(positiveCityHiveSignals.length >= 60, `Expected at least 60 positive TN CityHive inventory rows; got ${positiveCityHiveSignals.length}`);
assert(positiveRetailerSignals.length >= 10, `Expected at least 10 positive non-CityHive TN retailer inventory rows; got ${positiveRetailerSignals.length}`);
assert(positiveInventorySignals.length >= 75, `Expected at least 75 positive TN inventory rows; got ${positiveInventorySignals.length}`);
assert(cityHiveSources.size >= 7, `Expected at least 7 TN CityHive inventory sources; got ${cityHiveSources.size}: ${[...cityHiveSources].join(', ')}`);
assert(nonCityHiveSources.size >= 1, `Expected at least 1 non-CityHive TN inventory source; got ${nonCityHiveSources.size}`);
assert(inventorySources.size >= 8, `Expected at least 8 TN inventory sources; got ${inventorySources.size}: ${[...inventorySources].join(', ')}`);
assert(inventoryCities.has('Nashville'), `Expected Nashville TN inventory coverage; got ${[...inventoryCities].join(', ')}`);
assert(inventoryCities.has('Memphis'), `Expected Memphis TN inventory coverage; got ${[...inventoryCities].join(', ')}`);
assert(inventoryCities.has('Knoxville'), `Expected Knoxville TN inventory coverage; got ${[...inventoryCities].join(', ')}`);
assert(inventoryCities.has('Franklin'), `Expected Franklin TN inventory coverage; got ${[...inventoryCities].join(', ')}`);
assert(inventoryCities.has('Brentwood'), `Expected Brentwood TN inventory coverage; got ${[...inventoryCities].join(', ')}`);
assert(inventoryStores.size >= 8, `Expected at least 8 TN inventory stores; got ${inventoryStores.size}: ${[...inventoryStores].join(', ')}`);
assert(cityHiveStoreLocations.length >= cityHiveSources.size, `Expected TN CityHive store-location rows for CityHive inventory stores; locations=${cityHiveStoreLocations.length}, cityHiveSources=${cityHiveSources.size}`);
assert(unsafeCanonicalMatches.length === 0, `Unsafe TN canonical matches found: ${unsafeCanonicalMatches.map((signal) => `${signal.rawName}=>${signal.canonicalName}`).join(', ')}`);

if ((dropsExport.drops || []).length) {
  assert(cityHiveAlertableDrops.length >= 50, `Expected alertable exported TN CityHive drops >= 50 after public export dedupe; got ${cityHiveAlertableDrops.length}`);
  assert(retailerAlertableDrops.length >= 10, `Expected alertable exported non-CityHive TN retailer drops >= 10; got ${retailerAlertableDrops.length}`);
  assert(alertableDrops.length >= 62, `Expected alertable exported TN inventory drops >= 62 after public export dedupe; got ${alertableDrops.length}`);
  assert(dropSources.size >= 8, `Expected exported TN drops from at least 8 sources; got ${dropSources.size}: ${[...dropSources].join(', ')}`);
  assert(['Nashville', 'Memphis', 'Knoxville', 'Franklin', 'Brentwood'].every((city) => dropCities.has(city)), `Expected exported TN drops in Nashville, Memphis, Knoxville, Franklin, and Brentwood; got ${[...dropCities].join(', ')}`);
  assert(tnStores.length >= 8, `Expected exported TN stores >= 8; got ${tnStores.length}`);
  assert(tnLocations.length >= 8, `Expected exported TN locations >= 8; got ${tnLocations.length}`);
}

console.log(JSON.stringify({
  status: 'ok',
  stateStatus: state.status,
  positiveCityHiveSignals: positiveCityHiveSignals.length,
  positiveRetailerSignals: positiveRetailerSignals.length,
  positiveInventorySignals: positiveInventorySignals.length,
  inventorySources: [...inventorySources].sort(),
  nonCityHiveSources: [...nonCityHiveSources].sort(),
  inventoryCities: [...inventoryCities].sort(),
  inventoryStores: [...inventoryStores].sort(),
  cityHiveStoreLocations: cityHiveStoreLocations.length,
  cache: cache ? {
    generatedAt: cache.generatedAt,
    positiveInventorySignalCount: cache.positiveInventorySignalCount,
    sourceChains: cache.sourceChains || []
  } : null,
  exportedCityHiveDrops: cityHiveDrops.length,
  exportedRetailerDrops: retailerDrops.length,
  exportedDrops: inventoryDrops.length,
  alertableDrops: alertableDrops.length,
  exportedStores: tnStores.length,
  exportedLocations: tnLocations.length
}, null, 2));
