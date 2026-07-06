import { readFile } from 'node:fs/promises';

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (arguments.length > 1) return fallback; throw error; }
}

function assert(condition, message, sample = null) {
  if (!condition) {
    const suffix = sample ? `\n${JSON.stringify(sample, null, 2).slice(0, 2000)}` : '';
    throw new Error(`${message}${suffix}`);
  }
}

function inIndianaBounds(lat, lng) {
  if (lat == null || lng == null) return true;
  const nLat = Number(lat);
  const nLng = Number(lng);
  return Number.isFinite(nLat) && Number.isFinite(nLng)
    && nLat >= 37.6 && nLat <= 41.9
    && nLng >= -88.2 && nLng <= -84.6;
}

function norm(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

const HIGH_VALUE_RE = /blanton|eagle rare|weller|stagg|e\.?\s*h\.?\s*taylor|colonel\s*taylor|buffalo trace|michter|willett|old fitz|fitzgerald|elmer|rock hill|booker|baker|little book|blood oath|four roses(?:.*limited|.*private|.*barrel strength)|1792\s+(?:full proof|12|twelve)|russell'?s?\s+(?:13|15)|old forester birthday|birthday bourbon|elijah craig\s+(?:barrel proof|18)|larceny\s+barrel proof|rare character|four gate|wild turkey\s+master|master'?s? keep|yellowstone limited|van winkle|pappy/i;

const state = await readJson('out/states/IN.json');
const artifact = await readJson('out/browser/IN-atc-package-stores.json');
const storesExport = await readJson('out/site/stores.json', { stores: [] });
const locationsExport = await readJson('out/site/locations.json', { locations: [] });
const dropsExport = await readJson('out/site/drops.json', { drops: [] });
const alertsExport = await readJson('out/site/alerts.json', { candidates: [], alerts: [] });

const allSignals = state.signals || [];
const roadblocks = state.roadblocks || [];
const permitSignals = allSignals.filter((signal) => signal.eventType === 'licensed_package_store_location');
const permitNumbers = new Set(permitSignals.map((signal) => signal.storeId).filter(Boolean));
const activePackageStoreSignals = permitSignals.filter((signal) => /package store/i.test(String(signal.raw?.permit?.licenseType || '')) && /active/i.test(String(signal.raw?.permit?.status || '')));
const permitCities = new Set(permitSignals.map((signal) => signal.city).filter(Boolean));
const permitZips = new Set(permitSignals.map((signal) => signal.postalCode || signal.zip).filter(Boolean));
const alertablePermitSignals = permitSignals.filter((signal) => signal.canAlertAsInventory || signal.canAlertAsWatch || signal.canonicalBottleId || signal.canonicalName);

const inStores = (storesExport.stores || []).filter((store) => store.state === 'IN');
const inLocations = (locationsExport.locations || []).filter((location) => location.state === 'IN');
const inDrops = (dropsExport.drops || []).filter((drop) => drop.state === 'IN');
const inAlerts = ((alertsExport.candidates || alertsExport.alerts || [])).filter((alert) => alert.state === 'IN');
const atcDrops = inDrops.filter((drop) => /ATC|permit/i.test(`${drop.source || ''} ${drop.type || ''}`));
const atcAlerts = inAlerts.filter((alert) => /ATC|permit/i.test(`${alert.source || ''} ${alert.eventType || ''} ${alert.type || ''}`));

const inventoryTypes = new Set(['cityhive_store_inventory_result', 'retailer_store_inventory_result']);
const retailerInventorySignals = allSignals.filter((signal) => inventoryTypes.has(signal.eventType));
const alertableRetailerInventorySignals = retailerInventorySignals.filter((signal) => signal.canAlertAsInventory && Number(signal.quantity || 0) > 0 && signal.storeId && signal.storeAddress);
const retailerInventoryCities = new Set(retailerInventorySignals.map((signal) => String(signal.city || '').trim()).filter(Boolean));
const retailerInventorySources = new Set(retailerInventorySignals.map((signal) => signal.sourceLabel).filter(Boolean));
const cityHiveInventorySignals = allSignals.filter((signal) => signal.eventType === 'cityhive_store_inventory_result');
const cityHiveInventorySources = new Set(cityHiveInventorySignals.map((signal) => signal.sourceLabel).filter(Boolean));
const cityHiveStoreLocations = allSignals.filter((signal) => signal.eventType === 'retailer_store_location' && /CityHive/i.test(String(signal.sourceLabel || '')));
const paylessInventorySignals = allSignals.filter((signal) => signal.eventType === 'retailer_store_inventory_result' && /Payless Liquors/i.test(String(signal.sourceLabel || '')));
const penguinInventorySignals = allSignals.filter((signal) => signal.eventType === 'retailer_store_inventory_result' && /Penguin Liquor/i.test(String(signal.sourceLabel || '')));
const penguinRoadblocks = roadblocks.filter((roadblock) => /Penguin Liquor/i.test(String(roadblock.source || roadblock.url || roadblock.error || '')));
const kahnsInventorySignals = allSignals.filter((signal) => signal.eventType === 'retailer_store_inventory_result' && /Kahn/i.test(String(signal.sourceLabel || '')));
const kahnsRoadblocks = roadblocks.filter((roadblock) => /Kahn/i.test(String(roadblock.source || roadblock.url || roadblock.error || '')));
const retailerWatchDrops = inDrops.filter((drop) => drop.type === 'retailer_allocated_raffle_item' && /Bourbon World|Big Red/i.test(String(drop.source || '')));
const eventSignals = allSignals.filter((signal) => /lottery|tasting|event|release/i.test(`${signal.eventType || ''} ${signal.sourceLabel || ''} ${signal.readableSummary || ''} ${signal.evidence || ''}`));
const ilgTastingSignals = allSignals.filter((signal) => signal.eventType === 'retailer_tasting_event' && /Indiana Liquor Group/i.test(String(signal.sourceLabel || '')));
const ilgTastingDrops = inDrops.filter((drop) => drop.type === 'retailer_tasting_event' && /Indiana Liquor Group/i.test(String(drop.source || '')));
const retailerInventoryDrops = inDrops.filter((drop) => inventoryTypes.has(drop.type));
const alertableRetailerInventoryDrops = retailerInventoryDrops.filter((drop) => drop.canAlertAsInventory && Number(drop.quantity || 0) > 0 && drop.storeId && drop.storeAddress);
const unsafeDrops = inDrops.filter((drop) => !['retailer_allocated_raffle_item', 'retailer_tasting_event', 'cityhive_store_inventory_result', 'retailer_store_inventory_result'].includes(drop.type));

const highValueInventorySignals = retailerInventorySignals.filter((signal) => HIGH_VALUE_RE.test(`${signal.rawName || ''} ${signal.canonicalName || ''}`));
const badStoreCoordinates = inStores.filter((store) => !inIndianaBounds(store.lat, store.lng));
const badDropCoordinates = inDrops.filter((drop) => !inIndianaBounds(drop.lat, drop.lng));
const badSignalCoordinates = allSignals.filter((signal) => signal.locationPrecision === 'store_level' && !inIndianaBounds(signal.lat, signal.lng));

function hasMarketCity(cities) {
  return cities.some((city) => retailerInventoryCities.has(city));
}

assert(state.status === 'useful', `Unexpected IN state status: ${state.status}`);
assert(!state.stale, `IN must not be using stale fallback data: ${state.staleReason || 'stale=true'}`);
assert(artifact.storeCount >= 900, `Expected at least 900 active Indiana package-store permits; got ${artifact.storeCount}`);
assert(artifact.pageCount >= 20, `Expected ATC pagination to reach at least 20 pages; got ${artifact.pageCount}`);
assert(permitSignals.length === artifact.storeCount, `Permit signal count ${permitSignals.length} did not match artifact store count ${artifact.storeCount}`);
assert(permitNumbers.size === permitSignals.length, `Permit signals are not unique by permit number (${permitNumbers.size}/${permitSignals.length})`);
assert(activePackageStoreSignals.length === permitSignals.length, `Non-active or non-package-store permit signals found (${activePackageStoreSignals.length}/${permitSignals.length})`);
assert(permitCities.size >= 200, `Expected broad Indiana ATC city coverage; got ${permitCities.size} cities`);
assert(permitZips.size >= 300, `Expected broad Indiana ATC ZIP coverage; got ${permitZips.size} ZIPs`);
assert(alertablePermitSignals.length === 0, `ATC permit rows must not be alertable bottle/inventory signals; got ${alertablePermitSignals.length}`);
assert(atcDrops.length === 0, `ATC permit rows must not create Indiana drops; got ${atcDrops.length}`);
assert(atcAlerts.length === 0, `ATC permit rows must not create Indiana alert candidates; got ${atcAlerts.length}`);

assert(cityHiveStoreLocations.length >= 20, `Expected CityHive retailer store-location coverage; got ${cityHiveStoreLocations.length}`);
assert(retailerInventorySignals.length >= 350, `Expected at least 350 Indiana retailer inventory signals after expansion; got ${retailerInventorySignals.length}`);
assert(alertableRetailerInventorySignals.length >= 300, `Expected at least 300 alertable Indiana retailer inventory signals; got ${alertableRetailerInventorySignals.length}`);
assert(retailerInventorySources.size >= 6, `Expected at least 6 Indiana retailer inventory source chains; got ${retailerInventorySources.size}: ${[...retailerInventorySources].join(', ')}`);
assert(cityHiveInventorySources.size >= 5, `Expected at least 5 Indiana CityHive inventory source chains; got ${cityHiveInventorySources.size}: ${[...cityHiveInventorySources].join(', ')}`);
assert(retailerInventoryCities.size >= 25, `Expected Indiana inventory city coverage >=25; got ${retailerInventoryCities.size}: ${[...retailerInventoryCities].sort().join(', ')}`);
assert(highValueInventorySignals.length >= 20, `Expected at least 20 Indiana high-value allocated/unicorn inventory rows; got ${highValueInventorySignals.length}`);
assert(paylessInventorySignals.length >= 1, `Expected Payless East Street barrel-selection inventory signals; got ${paylessInventorySignals.length}`);
assert(kahnsInventorySignals.length > 0 || kahnsRoadblocks.length > 0, `Expected Kahn's inventory rows or an explicit roadblock; got ${kahnsInventorySignals.length} rows and ${kahnsRoadblocks.length} roadblocks`);
assert(penguinInventorySignals.length > 0 || penguinRoadblocks.length > 0, `Expected Penguin inventory rows or an explicit roadblock; got ${penguinInventorySignals.length} rows and ${penguinRoadblocks.length} roadblocks`);

assert(hasMarketCity(['Indianapolis', 'Carmel', 'Fishers', 'Noblesville', 'Greenwood', 'Avon', 'Brownsburg', 'Plainfield', 'Speedway', 'McCordsville']), `Expected Indianapolis metro inventory coverage; got ${[...retailerInventoryCities].sort().join(', ')}`);
assert(hasMarketCity(['Fort Wayne', 'New Haven']), `Expected Fort Wayne/New Haven inventory coverage; got ${[...retailerInventoryCities].sort().join(', ')}`);
assert(hasMarketCity(['Valparaiso', 'Merrillville', 'Chesterton']), `Expected Northwest Indiana inventory coverage; got ${[...retailerInventoryCities].sort().join(', ')}`);
assert(hasMarketCity(['South Bend', 'Mishawaka', 'Elkhart', 'Granger', 'Goshen', 'Roseland']), `Expected South Bend/Mishawaka/Elkhart inventory coverage; got ${[...retailerInventoryCities].sort().join(', ')}`);
assert(hasMarketCity(['Bloomington']), `Expected Bloomington inventory coverage; got ${[...retailerInventoryCities].sort().join(', ')}`);

assert(!badStoreCoordinates.length, 'Indiana exported stores include coordinates outside Indiana bounds.', badStoreCoordinates.slice(0, 10));
assert(!badDropCoordinates.length, 'Indiana exported drops include coordinates outside Indiana bounds.', badDropCoordinates.slice(0, 10));
assert(!badSignalCoordinates.length, 'Indiana state store-level signals include coordinates outside Indiana bounds.', badSignalCoordinates.slice(0, 10));

assert(retailerWatchDrops.length <= eventSignals.length, `Exported retailer watch drops exceeded source event signals (${retailerWatchDrops.length}/${eventSignals.length})`);
if (inDrops.length) {
  assert(alertableRetailerInventoryDrops.length === retailerInventoryDrops.length, `Every exported Indiana retailer inventory drop must be alertable/store-level; got ${alertableRetailerInventoryDrops.length}/${retailerInventoryDrops.length}`);
  assert(ilgTastingDrops.length <= ilgTastingSignals.length, `Exported ILG tasting drops exceeded source signals (${ilgTastingDrops.length}/${ilgTastingSignals.length})`);
}
assert(unsafeDrops.length === 0, `Unexpected non-retailer-watch Indiana drops found: ${unsafeDrops.map((drop) => `${drop.type}:${drop.bottleName}`).join(', ')}`);
if (inStores.length || inLocations.length) {
  assert(inStores.length >= 900, `Expected exported IN stores >= 900 after export; got ${inStores.length}`);
  assert(inLocations.length >= 900, `Expected exported IN locations >= 900 after export; got ${inLocations.length}`);
}

console.log(JSON.stringify({
  status: 'ok',
  permitStoreSignals: permitSignals.length,
  pages: artifact.pageCount,
  permitCities: permitCities.size,
  permitZips: permitZips.size,
  exportedStores: inStores.length,
  exportedLocations: inLocations.length,
  exportedDrops: inDrops.length,
  exportedAlerts: inAlerts.length,
  cityHiveStoreLocations: cityHiveStoreLocations.length,
  retailerInventorySignals: retailerInventorySignals.length,
  alertableRetailerInventorySignals: alertableRetailerInventorySignals.length,
  retailerInventorySources: [...retailerInventorySources].sort(),
  cityHiveInventorySources: [...cityHiveInventorySources].sort(),
  cityHiveInventorySignals: cityHiveInventorySignals.length,
  highValueInventorySignals: highValueInventorySignals.length,
  kahnsInventorySignals: kahnsInventorySignals.length,
  kahnsRoadblocks: kahnsRoadblocks.length,
  paylessInventorySignals: paylessInventorySignals.length,
  penguinInventorySignals: penguinInventorySignals.length,
  penguinRoadblocks: penguinRoadblocks.length,
  retailerInventoryCities: [...retailerInventoryCities].sort(),
  retailerInventoryDrops: retailerInventoryDrops.length,
  alertableRetailerInventoryDrops: alertableRetailerInventoryDrops.length,
  eventSignals: eventSignals.length
}, null, 2));
