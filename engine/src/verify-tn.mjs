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
const cityHiveStoreLocations = signals.filter((signal) => signal.eventType === 'retailer_store_location' && /CityHive/i.test(String(signal.sourceLabel || '')));
const inventorySources = new Set(positiveCityHiveSignals.map((signal) => signal.sourceLabel).filter(Boolean));
const inventoryCities = new Set(positiveCityHiveSignals.map((signal) => String(signal.city || '').trim()).filter(Boolean));
const inventoryStores = new Set(positiveCityHiveSignals.map((signal) => signal.storeName || signal.storeId).filter(Boolean));
const unsafeCanonicalMatches = positiveCityHiveSignals.filter((signal) => {
  const raw = String(signal.rawName || '').toLowerCase();
  const canonical = String(signal.canonicalName || '').toLowerCase();
  if (/\brye\b/.test(raw) && !/\brye\b/.test(canonical)) return true;
  if (/limited edition|batch proof|barrel proof|single barrel|small batch select|full proof|bottled-in-bond|bottled in bond/.test(canonical)
    && !/limited edition|batch proof|barrel proof|single barrel|small batch select|full proof|bottled-in-bond|bottled in bond|store pick|private selection/.test(raw)) return true;
  return false;
});

const tnDrops = (dropsExport.drops || []).filter((drop) => drop.state === 'TN');
const cityHiveDrops = tnDrops.filter((drop) => drop.type === 'cityhive_store_inventory_result');
const alertableDrops = cityHiveDrops.filter((drop) => drop.canAlertAsInventory && Number(drop.quantity || 0) > 0 && drop.storeId && drop.storeAddress);
const dropSources = new Set(cityHiveDrops.map((drop) => drop.source).filter(Boolean));
const dropCities = new Set(cityHiveDrops.map((drop) => String(drop.city || '').trim()).filter(Boolean));
const tnStores = (storesExport.stores || []).filter((store) => store.state === 'TN');
const tnLocations = (locationsExport.locations || []).filter((location) => location.state === 'TN');

assert(positiveCityHiveSignals.length >= 30, `Expected at least 30 positive TN CityHive inventory rows; got ${positiveCityHiveSignals.length}`);
assert(inventorySources.size >= 3, `Expected at least 3 TN CityHive inventory sources; got ${inventorySources.size}: ${[...inventorySources].join(', ')}`);
assert(inventoryCities.has('Nashville'), `Expected Nashville TN inventory coverage; got ${[...inventoryCities].join(', ')}`);
assert(inventoryCities.has('Memphis'), `Expected Memphis TN inventory coverage; got ${[...inventoryCities].join(', ')}`);
assert(inventoryStores.size >= 3, `Expected at least 3 TN inventory stores; got ${inventoryStores.size}: ${[...inventoryStores].join(', ')}`);
assert(cityHiveStoreLocations.length >= inventoryStores.size, `Expected TN store-location rows for inventory stores; locations=${cityHiveStoreLocations.length}, stores=${inventoryStores.size}`);
assert(unsafeCanonicalMatches.length === 0, `Unsafe TN canonical matches found: ${unsafeCanonicalMatches.map((signal) => `${signal.rawName}=>${signal.canonicalName}`).join(', ')}`);

if ((dropsExport.drops || []).length) {
  assert(cityHiveDrops.length >= 30, `Expected exported TN CityHive drops >= 30; got ${cityHiveDrops.length}`);
  assert(alertableDrops.length >= 30, `Expected alertable exported TN CityHive drops >= 30; got ${alertableDrops.length}`);
  assert(dropSources.size >= 3, `Expected exported TN drops from at least 3 sources; got ${dropSources.size}: ${[...dropSources].join(', ')}`);
  assert(dropCities.has('Nashville') && dropCities.has('Memphis'), `Expected exported TN drops in Nashville and Memphis; got ${[...dropCities].join(', ')}`);
  assert(tnStores.length >= 3, `Expected exported TN stores >= 3; got ${tnStores.length}`);
  assert(tnLocations.length >= 3, `Expected exported TN locations >= 3; got ${tnLocations.length}`);
}

console.log(JSON.stringify({
  status: 'ok',
  stateStatus: state.status,
  positiveCityHiveSignals: positiveCityHiveSignals.length,
  inventorySources: [...inventorySources].sort(),
  inventoryCities: [...inventoryCities].sort(),
  inventoryStores: [...inventoryStores].sort(),
  cityHiveStoreLocations: cityHiveStoreLocations.length,
  cache: cache ? {
    generatedAt: cache.generatedAt,
    positiveInventorySignalCount: cache.positiveInventorySignalCount,
    sourceChains: cache.sourceChains || []
  } : null,
  exportedDrops: cityHiveDrops.length,
  alertableDrops: alertableDrops.length,
  exportedStores: tnStores.length,
  exportedLocations: tnLocations.length
}, null, 2));
