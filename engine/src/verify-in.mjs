import { readFile } from 'node:fs/promises';

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const state = await readJson('out/states/IN.json');
const artifact = await readJson('out/browser/IN-atc-package-stores.json');
const storesExport = await readJson('out/site/stores.json').catch(() => ({ stores: [] }));
const locationsExport = await readJson('out/site/locations.json').catch(() => ({ locations: [] }));
const dropsExport = await readJson('out/site/drops.json').catch(() => ({ drops: [] }));

const permitSignals = (state.signals || []).filter((signal) => signal.eventType === 'licensed_package_store_location');
const permitNumbers = new Set(permitSignals.map((signal) => signal.storeId).filter(Boolean));
const activePackageStoreSignals = permitSignals.filter((signal) => /package store/i.test(String(signal.raw?.permit?.licenseType || '')) && /active/i.test(String(signal.raw?.permit?.status || '')));
const cities = new Set(permitSignals.map((signal) => signal.city).filter(Boolean));
const zips = new Set(permitSignals.map((signal) => signal.postalCode || signal.zip).filter(Boolean));
const alertablePermitSignals = permitSignals.filter((signal) => signal.canAlertAsInventory || signal.canAlertAsWatch || signal.canonicalBottleId || signal.canonicalName);
const inStores = (storesExport.stores || []).filter((store) => store.state === 'IN');
const inLocations = (locationsExport.locations || []).filter((location) => location.state === 'IN');
const inDrops = (dropsExport.drops || []).filter((drop) => drop.state === 'IN');
const atcDrops = inDrops.filter((drop) => /ATC|permit/i.test(String(drop.source || '') + ' ' + String(drop.type || '')));
const retailerWatchDrops = inDrops.filter((drop) => drop.type === 'retailer_allocated_raffle_item' && /Bourbon World|Big Red/i.test(String(drop.source || '')));
const cityHiveInventorySignals = (state.signals || []).filter((signal) => signal.eventType === 'cityhive_store_inventory_result');
const kahnsInventorySignals = (state.signals || []).filter((signal) => signal.eventType === 'retailer_store_inventory_result' && /Kahn/i.test(String(signal.sourceLabel || '')));
const retailerInventorySignals = (state.signals || []).filter((signal) => ['cityhive_store_inventory_result', 'retailer_store_inventory_result'].includes(signal.eventType));
const retailerInventoryCities = new Set(retailerInventorySignals.map((signal) => String(signal.city || '').trim()).filter(Boolean));
const cityHiveStoreLocations = (state.signals || []).filter((signal) => signal.eventType === 'retailer_store_location' && /CityHive/i.test(String(signal.sourceLabel || '')));
const cityHiveDrops = inDrops.filter((drop) => drop.type === 'cityhive_store_inventory_result');
const kahnsDrops = inDrops.filter((drop) => drop.type === 'retailer_store_inventory_result' && /Kahn/i.test(String(drop.source || '')));
const retailerInventoryDrops = inDrops.filter((drop) => ['cityhive_store_inventory_result', 'retailer_store_inventory_result'].includes(drop.type));
const retailerInventoryDropCities = new Set(retailerInventoryDrops.map((drop) => String(drop.city || '').trim()).filter(Boolean));
const cityHiveInventorySources = new Set(cityHiveInventorySignals.map((signal) => signal.sourceLabel).filter(Boolean));
const cityHiveDropSources = new Set(cityHiveDrops.map((drop) => drop.source).filter(Boolean));
const alertableCityHiveDrops = cityHiveDrops.filter((drop) => drop.canAlertAsInventory && Number(drop.quantity || 0) > 0 && drop.storeId && drop.storeAddress);
const alertableRetailerInventoryDrops = retailerInventoryDrops.filter((drop) => drop.canAlertAsInventory && Number(drop.quantity || 0) > 0 && drop.storeId && drop.storeAddress);
const eventSignals = (state.signals || []).filter((signal) => /lottery|tasting|event|release/i.test(String(signal.eventType || '') + ' ' + String(signal.sourceLabel || '') + ' ' + String(signal.readableSummary || '') + ' ' + String(signal.evidence || '')));
const unsafeDrops = inDrops.filter((drop) => !['retailer_allocated_raffle_item', 'cityhive_store_inventory_result', 'retailer_store_inventory_result'].includes(drop.type));

assert(state.status === 'useful' || state.status === 'reachable_needs_deeper_parser', `Unexpected IN state status: ${state.status}`);
assert(artifact.storeCount >= 900, `Expected at least 900 active Indiana package-store permits; got ${artifact.storeCount}`);
assert(artifact.pageCount >= 20, `Expected ATC pagination to reach at least 20 pages; got ${artifact.pageCount}`);
assert(permitSignals.length === artifact.storeCount, `Permit signal count ${permitSignals.length} did not match artifact store count ${artifact.storeCount}`);
assert(permitNumbers.size === permitSignals.length, `Permit signals are not unique by permit number (${permitNumbers.size}/${permitSignals.length})`);
assert(activePackageStoreSignals.length === permitSignals.length, `Non-active or non-package-store permit signals found (${activePackageStoreSignals.length}/${permitSignals.length})`);
assert(cities.size >= 200, `Expected broad Indiana city coverage; got ${cities.size} cities`);
assert(zips.size >= 300, `Expected broad Indiana ZIP coverage; got ${zips.size} ZIPs`);
assert(alertablePermitSignals.length === 0, `ATC permit rows must not be alertable bottle/inventory signals; got ${alertablePermitSignals.length}`);
assert(atcDrops.length === 0, `ATC permit rows must not create Indiana drops; got ${atcDrops.length}`);
assert(retailerWatchDrops.length >= 5, `Expected Bourbon World retailer watch drops; got ${retailerWatchDrops.length}`);
assert(cityHiveStoreLocations.length >= 20, `Expected CityHive retailer store-location coverage; got ${cityHiveStoreLocations.length}`);
assert(cityHiveInventorySources.size >= 3, `Expected at least 3 CityHive inventory source chains; got ${cityHiveInventorySources.size}: ${[...cityHiveInventorySources].join(', ')}`);
assert(cityHiveInventorySignals.length >= 75, `Expected stronger CityHive positive inventory signals; got ${cityHiveInventorySignals.length}`);
assert(kahnsInventorySignals.length >= 20, `Expected Kahn's Indianapolis inventory signals; got ${kahnsInventorySignals.length}`);
assert(retailerInventoryCities.size >= 10, `Expected broader Indiana retailer inventory city coverage; got ${retailerInventoryCities.size}: ${[...retailerInventoryCities].sort().join(', ')}`);
assert(cityHiveDropSources.size >= 3, `Expected exported CityHive drops from at least 3 source chains; got ${cityHiveDropSources.size}: ${[...cityHiveDropSources].join(', ')}`);
assert(cityHiveDrops.length >= 35, `Expected stronger exported CityHive inventory drops; got ${cityHiveDrops.length}`);
assert(kahnsDrops.length >= 20, `Expected exported Kahn's Indianapolis inventory drops; got ${kahnsDrops.length}`);
assert(retailerInventoryDropCities.size >= 10, `Expected exported retailer inventory drops in at least 10 cities; got ${retailerInventoryDropCities.size}: ${[...retailerInventoryDropCities].sort().join(', ')}`);
assert(alertableCityHiveDrops.length >= 30, `Expected alertable CityHive inventory drops with store/address/quantity; got ${alertableCityHiveDrops.length}`);
assert(alertableRetailerInventoryDrops.length >= 50, `Expected alertable retailer inventory drops with store/address/quantity; got ${alertableRetailerInventoryDrops.length}`);
assert(eventSignals.length >= 2, `Expected Indiana event/lottery/tasting signals; got ${eventSignals.length}`);
assert(unsafeDrops.length === 0, `Unexpected non-retailer-watch Indiana drops found: ${unsafeDrops.map((drop) => `${drop.type}:${drop.bottleName}`).join(', ')}`);

if (inStores.length || inLocations.length) {
  assert(inStores.length >= 900, `Expected exported IN stores >= 900 after export; got ${inStores.length}`);
  assert(inLocations.length >= 900, `Expected exported IN locations >= 900 after export; got ${inLocations.length}`);
}

console.log(JSON.stringify({
  status: 'ok',
  permitStoreSignals: permitSignals.length,
  pages: artifact.pageCount,
  cities: cities.size,
  zips: zips.size,
  exportedStores: inStores.length,
  exportedLocations: inLocations.length,
  exportedDrops: inDrops.length,
  retailerWatchDrops: retailerWatchDrops.length,
  cityHiveStoreLocations: cityHiveStoreLocations.length,
  cityHiveInventorySources: [...cityHiveInventorySources].sort(),
  cityHiveInventorySignals: cityHiveInventorySignals.length,
  kahnsInventorySignals: kahnsInventorySignals.length,
  retailerInventoryCities: [...retailerInventoryCities].sort(),
  cityHiveDropSources: [...cityHiveDropSources].sort(),
  cityHiveDrops: cityHiveDrops.length,
  kahnsDrops: kahnsDrops.length,
  retailerInventoryDropCities: [...retailerInventoryDropCities].sort(),
  alertableCityHiveDrops: alertableCityHiveDrops.length,
  alertableRetailerInventoryDrops: alertableRetailerInventoryDrops.length,
  eventSignals: eventSignals.length
}, null, 2));
