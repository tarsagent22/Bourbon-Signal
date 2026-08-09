import { readFile } from 'node:fs/promises';
import { INDIANA_CITYHIVE_EXPANSION_TARGETS, INDIANA_TARGET_STORES } from './collectors/indiana-retailer-surfaces.mjs';
import { isIndianaRetailerInventory, isIndianaRetailerSignalIdentity } from './indiana-retailer-policy.mjs';

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
const summary = await readJson('out/summary.json');
const storesExport = await readJson('out/site/stores.json', { stores: [] });
const locationsExport = await readJson('out/site/locations.json', { locations: [] });
const dropsExport = await readJson('out/site/drops.json', { drops: [] });
const alertsExport = await readJson('out/site/alerts.json', { candidates: [], alerts: [] });
const statsExport = await readJson('out/site/stats.json', {});
const siteExports = [statsExport, storesExport, locationsExport, dropsExport, alertsExport];

const allSignals = state.signals || [];
const stateStartedAt = Date.parse(state.startedAt || '');
const stateFinishedAt = Date.parse(state.finishedAt || '');
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
const alertableRetailerInventorySignals = retailerInventorySignals.filter((signal) => signal.canAlertAsInventory && isIndianaRetailerInventory(signal));
const staleRetailerInventorySignals = retailerInventorySignals.filter((signal) => signal.stale === true || signal.sourceStale === true);
const liveRetailerInventoryStores = new Set(alertableRetailerInventorySignals.map((signal) => signal.storeId).filter(Boolean));
const expansionTargetStoreIds = new Set(INDIANA_CITYHIVE_EXPANSION_TARGETS.map((target) => `big-red:${target.merchantId}`));
const expansionTargetInventorySignals = alertableRetailerInventorySignals.filter((signal) => {
  if (!expansionTargetStoreIds.has(String(signal.storeId))) return false;
  const observedAtMs = Date.parse(signal.inventoryCheckedAt || signal.observedAt || signal.lastConfirmedAt || signal.sourceEventAt || '');
  return Number.isFinite(stateStartedAt) && Number.isFinite(stateFinishedAt) && Number.isFinite(observedAtMs)
    && observedAtMs >= stateStartedAt && observedAtMs <= stateFinishedAt + 5 * 60_000;
});
const expansionTargetInventoryStores = new Set(expansionTargetInventorySignals.map((signal) => String(signal.storeId)));
const missingExpansionTargets = INDIANA_CITYHIVE_EXPANSION_TARGETS.filter((target) => !expansionTargetInventoryStores.has(`big-red:${target.merchantId}`));
const untrustedRetailerInventorySignals = retailerInventorySignals.filter((signal) => !isIndianaRetailerSignalIdentity(signal));
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
const targetInventorySignals = retailerInventorySignals.filter((signal) => /Target Indiana/i.test(String(signal.sourceLabel || '')));
const targetInventoryStores = new Set(targetInventorySignals.map((signal) => signal.storeId).filter(Boolean));
const targetRoadblocks = roadblocks.filter((roadblock) => /Target Indiana/i.test(String(roadblock.source || roadblock.url || roadblock.error || '')));
const gaysInventorySignals = cityHiveInventorySignals.filter((signal) => /Gays Hops-N-Schnapps/i.test(String(signal.sourceLabel || '')));
const gaysInventoryStores = new Set(gaysInventorySignals.map((signal) => signal.storeId).filter(Boolean));
const gaysInventoryCities = new Set(gaysInventorySignals.map((signal) => signal.city).filter(Boolean));
const doorDashInventoryAlerts = retailerInventorySignals.filter((signal) => /DoorDash Frontier/i.test(String(signal.sourceLabel || '')) && signal.canAlertAsInventory);
const projectedSentinels = cityHiveInventorySignals.filter((signal) => Number(signal.raw?.reportedQuantity) >= 100 && Number(signal.quantity || 0) > 1);
const retailerWatchDrops = inDrops.filter((drop) => drop.type === 'retailer_allocated_raffle_item' && /Bourbon World|Big Red/i.test(String(drop.source || '')));
const eventSignals = allSignals.filter((signal) => /lottery|tasting|event|release/i.test(`${signal.eventType || ''} ${signal.sourceLabel || ''} ${signal.readableSummary || ''} ${signal.evidence || ''}`));
const ilgTastingSignals = allSignals.filter((signal) => signal.eventType === 'retailer_tasting_event' && /Indiana Liquor Group/i.test(String(signal.sourceLabel || '')));
const ilgTastingDrops = inDrops.filter((drop) => drop.type === 'retailer_tasting_event' && /Indiana Liquor Group/i.test(String(drop.source || '')));
const retailerInventoryDrops = inDrops.filter((drop) => inventoryTypes.has(drop.type));
const invalidRetailerInventoryDrops = retailerInventoryDrops.filter((drop) => !isIndianaRetailerSignalIdentity(drop));
const unsafeNonAlertableRetailerInventoryDrops = retailerInventoryDrops.filter((drop) => (!drop.canAlertAsInventory || !isIndianaRetailerInventory(drop)) && drop.stale !== true && drop.sourceStale !== true);
const staleAlertableRetailerInventoryDrops = retailerInventoryDrops.filter((drop) => (drop.stale === true || drop.sourceStale === true) && (drop.canAlertAsInventory === true || drop.canAlertAsWatch === true));
const doorDashInventoryDrops = retailerInventoryDrops.filter((drop) => /DoorDash Frontier/i.test(String(drop.source || drop.sourceLabel || '')));
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
assert(dropsExport.runId && siteExports.every((payload) => payload.runId === dropsExport.runId), 'Indiana verification requires every consumed site artifact to come from the same export run.');
assert(dropsExport.generatedAt && siteExports.every((payload) => payload.generatedAt === dropsExport.generatedAt), 'Indiana verification requires coherent site-export timestamps.');
assert(dropsExport.engineGeneratedAt && siteExports.every((payload) => payload.engineGeneratedAt === dropsExport.engineGeneratedAt), 'Indiana verification requires every consumed site artifact to name the same engine generation.');
assert(dropsExport.engineGeneratedAt && dropsExport.engineGeneratedAt === summary.generatedAt, 'Indiana verification requires the site export to match the current engine summary.');
const engineGeneratedAt = Date.parse(dropsExport.engineGeneratedAt || '');
const siteGeneratedAt = Date.parse(dropsExport.generatedAt || '');
assert(Number.isFinite(stateFinishedAt) && Number.isFinite(engineGeneratedAt) && Number.isFinite(siteGeneratedAt)
  && engineGeneratedAt >= stateFinishedAt && siteGeneratedAt >= engineGeneratedAt
  && siteGeneratedAt - stateFinishedAt <= 2 * 60 * 60_000,
'Indiana verification requires the state result, engine generation, and site export to come from one bounded production-shaped replay.');
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
assert(retailerInventorySignals.length >= 300, `Expected at least 300 current-plus-retained Indiana retailer inventory signals after expansion; got ${retailerInventorySignals.length}`);
assert(alertableRetailerInventorySignals.length >= 20, `Expected at least 20 fresh alertable Indiana retailer inventory signals; got ${alertableRetailerInventorySignals.length}`);
assert(liveRetailerInventoryStores.size >= 5, `Expected at least 5 fresh alertable Indiana stores; got ${liveRetailerInventoryStores.size}`);
assert(INDIANA_CITYHIVE_EXPANSION_TARGETS.length === 20, `Expected exactly 20 Indiana CityHive expansion targets; got ${INDIANA_CITYHIVE_EXPANSION_TARGETS.length}`);
assert(expansionTargetInventoryStores.size === 20, `Expected current alertable inventory from all 20 Indiana expansion stores; got ${expansionTargetInventoryStores.size}`, missingExpansionTargets);
assert(expansionTargetInventorySignals.length >= 20, `Expected at least one current inventory row per Indiana expansion store; got ${expansionTargetInventorySignals.length}`);
assert(staleRetailerInventorySignals.every((signal) => signal.canAlertAsInventory === false && signal.canAlertAsWatch === false), 'Retained stale Indiana inventory must remain nonalertable.', staleRetailerInventorySignals.filter((signal) => signal.canAlertAsInventory || signal.canAlertAsWatch).slice(0, 10));
assert(retailerInventorySources.size >= 6, `Expected at least 6 Indiana retailer inventory source chains; got ${retailerInventorySources.size}: ${[...retailerInventorySources].join(', ')}`);
assert(cityHiveInventorySources.size >= 5, `Expected at least 5 Indiana CityHive inventory source chains; got ${cityHiveInventorySources.size}: ${[...cityHiveInventorySources].join(', ')}`);
assert(retailerInventoryCities.size >= 25, `Expected Indiana inventory city coverage >=25; got ${retailerInventoryCities.size}: ${[...retailerInventoryCities].sort().join(', ')}`);
assert(highValueInventorySignals.length >= 15, `Expected at least 15 Indiana high-value allocated/unicorn inventory rows; got ${highValueInventorySignals.length}`);
assert(paylessInventorySignals.length >= 1, `Expected Payless East Street barrel-selection inventory signals; got ${paylessInventorySignals.length}`);
assert(kahnsInventorySignals.length > 0 || kahnsRoadblocks.length > 0, `Expected Kahn's inventory rows or an explicit roadblock; got ${kahnsInventorySignals.length} rows and ${kahnsRoadblocks.length} roadblocks`);
assert(penguinInventorySignals.length > 0 || penguinRoadblocks.length > 0, `Expected Penguin inventory rows or an explicit roadblock; got ${penguinInventorySignals.length} rows and ${penguinRoadblocks.length} roadblocks`);
assert(gaysInventorySignals.length >= 8, `Expected durable Gays Hops-N-Schnapps bottle inventory; got ${gaysInventorySignals.length} rows`);
assert(gaysInventoryStores.size >= 5, `Expected all 5 Gays Hops-N-Schnapps branches; got ${gaysInventoryStores.size}: ${[...gaysInventoryStores].join(', ')}`);
assert(['Auburn', 'Fremont', 'Angola', 'LaGrange'].every((city) => gaysInventoryCities.has(city)), `Missing a Gays Hops-N-Schnapps market: ${[...gaysInventoryCities].sort().join(', ')}`);
assert(INDIANA_TARGET_STORES.size >= 9, `Expected at least 9 exact Indiana Target store identities; got ${INDIANA_TARGET_STORES.size}`);
assert(targetInventorySignals.length > 0 || targetRoadblocks.length > 0, `Expected Target exact-store inventory rows or an explicit blocked-source roadblock; got ${targetInventorySignals.length} rows and ${targetRoadblocks.length} roadblocks`);
if (targetInventorySignals.length) {
  assert(targetInventoryStores.size >= 1, `Expected Target inventory to bind at least one exact Indiana store; got ${targetInventoryStores.size}`);
  assert(targetInventorySignals.every((signal) => isIndianaRetailerInventory(signal)), 'Target rows failed Indiana identity/orderability policy.', targetInventorySignals.filter((signal) => !isIndianaRetailerInventory(signal)).slice(0, 10));
}
assert(untrustedRetailerInventorySignals.length === 0, `Indiana retailer inventory identity must fail closed; got ${untrustedRetailerInventorySignals.length} untrusted rows`, untrustedRetailerInventorySignals.slice(0, 10));
assert(doorDashInventoryAlerts.length === 0, `DoorDash marketplace rows must remain watch-only; got ${doorDashInventoryAlerts.length} inventory-alert rows`);
assert(projectedSentinels.length === 0, `CityHive binary availability sentinels must never become exact quantity >1; got ${projectedSentinels.length}`, projectedSentinels.slice(0, 10));

assert(hasMarketCity(['Indianapolis', 'Carmel', 'Fishers', 'Noblesville', 'Greenwood', 'Avon', 'Brownsburg', 'Plainfield', 'Speedway', 'McCordsville']), `Expected Indianapolis metro inventory coverage; got ${[...retailerInventoryCities].sort().join(', ')}`);
assert(hasMarketCity(['Fort Wayne', 'New Haven']), `Expected Fort Wayne/New Haven inventory coverage; got ${[...retailerInventoryCities].sort().join(', ')}`);
assert(hasMarketCity(['Valparaiso', 'Merrillville', 'Chesterton']), `Expected Northwest Indiana inventory coverage; got ${[...retailerInventoryCities].sort().join(', ')}`);
assert(hasMarketCity(['South Bend', 'Mishawaka', 'Elkhart', 'Granger', 'Goshen', 'Roseland']), `Expected South Bend/Mishawaka/Elkhart inventory coverage; got ${[...retailerInventoryCities].sort().join(', ')}`);
assert(hasMarketCity(['Bloomington']), `Expected Bloomington inventory coverage; got ${[...retailerInventoryCities].sort().join(', ')}`);

assert(!badStoreCoordinates.length, 'Indiana exported stores include coordinates outside Indiana bounds.', badStoreCoordinates.slice(0, 10));
assert(!badDropCoordinates.length, 'Indiana exported drops include coordinates outside Indiana bounds.', badDropCoordinates.slice(0, 10));
assert(!badSignalCoordinates.length, 'Indiana state store-level signals include coordinates outside Indiana bounds.', badSignalCoordinates.slice(0, 10));

assert(retailerWatchDrops.length <= eventSignals.length, `Exported retailer watch drops exceeded source event signals (${retailerWatchDrops.length}/${eventSignals.length})`);
assert(invalidRetailerInventoryDrops.length === 0, `Every exported Indiana retailer inventory drop must retain a valid source/store identity; got ${invalidRetailerInventoryDrops.length}`, invalidRetailerInventoryDrops.slice(0, 10));
assert(unsafeNonAlertableRetailerInventoryDrops.length === 0, `Fresh Indiana retailer inventory drops must remain alertable under the Indiana policy; got ${unsafeNonAlertableRetailerInventoryDrops.length}`, unsafeNonAlertableRetailerInventoryDrops.slice(0, 10));
assert(staleAlertableRetailerInventoryDrops.length === 0, `Retained stale Indiana retailer inventory drops must remain nonalertable; got ${staleAlertableRetailerInventoryDrops.length}`, staleAlertableRetailerInventoryDrops.slice(0, 10));
assert(doorDashInventoryDrops.length === 0, `DoorDash marketplace rows must never export as Indiana inventory drops; got ${doorDashInventoryDrops.length}`, doorDashInventoryDrops.slice(0, 10));
if (inDrops.length) {
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
  liveRetailerInventoryStores: liveRetailerInventoryStores.size,
  expansionTargetInventorySignals: expansionTargetInventorySignals.length,
  expansionTargetInventoryStores: expansionTargetInventoryStores.size,
  retailerInventorySources: [...retailerInventorySources].sort(),
  cityHiveInventorySources: [...cityHiveInventorySources].sort(),
  cityHiveInventorySignals: cityHiveInventorySignals.length,
  highValueInventorySignals: highValueInventorySignals.length,
  kahnsInventorySignals: kahnsInventorySignals.length,
  kahnsRoadblocks: kahnsRoadblocks.length,
  paylessInventorySignals: paylessInventorySignals.length,
  penguinInventorySignals: penguinInventorySignals.length,
  penguinRoadblocks: penguinRoadblocks.length,
  gaysInventorySignals: gaysInventorySignals.length,
  gaysInventoryStores: [...gaysInventoryStores].sort(),
  gaysInventoryCities: [...gaysInventoryCities].sort(),
  targetInventorySignals: targetInventorySignals.length,
  targetInventoryStores: [...targetInventoryStores].sort(),
  targetRoadblocks: targetRoadblocks.length,
  untrustedRetailerInventorySignals: untrustedRetailerInventorySignals.length,
  projectedSentinels: projectedSentinels.length,
  retailerInventoryCities: [...retailerInventoryCities].sort(),
  retailerInventoryDrops: retailerInventoryDrops.length,
  invalidRetailerInventoryDrops: invalidRetailerInventoryDrops.length,
  unsafeNonAlertableRetailerInventoryDrops: unsafeNonAlertableRetailerInventoryDrops.length,
  staleAlertableRetailerInventoryDrops: staleAlertableRetailerInventoryDrops.length,
  doorDashInventoryDrops: doorDashInventoryDrops.length,
  eventSignals: eventSignals.length
}, null, 2));
