import { readFile } from 'node:fs/promises';
import { tennesseeSourceForId } from './collectors/tennessee-retailer-surfaces.mjs';
import { isTennesseeRetailerSignalIdentity } from './tennessee-retailer-policy.mjs';
import {
  evaluateTennesseeSnapshotEvidence,
  qualifyingTennesseeInventoryEvidence,
} from './tennessee-verification-policy.mjs';

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
const allowFreshRetainedEvidence = process.argv.includes('--allow-fresh-retained-evidence');
const targetedCohort = process.argv.includes('--targeted-cohort');

assert(state, 'Missing out/states/TN.json; run node src/run-state.mjs TN first');
assert(/^useful(?:_|$)/.test(String(state.status || '')), `Unexpected TN state status: ${state.status}`);
assert(!state.stale, `TN must not be using stale fallback data: ${state.staleReason || 'stale=true'}`);

const signals = state.signals || [];
const cacheGeneratedAtMs = cache?.generatedAt ? new Date(cache.generatedAt).getTime() : 0;
const cacheAgeHours = Number.isFinite(cacheGeneratedAtMs) && cacheGeneratedAtMs > 0 ? (Date.now() - cacheGeneratedAtMs) / 3_600_000 : null;
const qualifyingSignals = qualifyingTennesseeInventoryEvidence(signals);
const stateStartedAtMs = new Date(state.startedAt).getTime();
const currentQualifyingSignals = qualifyingSignals.filter((signal) => {
  const observedAtMs = new Date(signal.lastConfirmedAt || signal.sourceEventAt || signal.observedAt || signal.timestamp || 0).getTime();
  return Number.isFinite(stateStartedAtMs) && Number.isFinite(observedAtMs) && observedAtMs >= stateStartedAtMs;
});
const verifierSignals = targetedCohort ? currentQualifyingSignals : qualifyingSignals;
const cityHiveInventorySignals = signals.filter((signal) => signal.eventType === 'cityhive_store_inventory_result');
const positiveCityHiveSignals = verifierSignals.filter((signal) => signal.eventType === 'cityhive_store_inventory_result');
const retailerInventorySignals = signals.filter((signal) => signal.eventType === 'retailer_store_inventory_result');
const positiveRetailerSignals = verifierSignals.filter((signal) => signal.eventType === 'retailer_store_inventory_result');
const positiveInventorySignals = [...positiveCityHiveSignals, ...positiveRetailerSignals];
const cityHiveStoreLocations = signals.filter((signal) => signal.eventType === 'retailer_store_location'
  && tennesseeSourceForId(signal.sourceChain || signal.raw?.chain)?.platform === 'cityhive');
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
const alertableDrops = qualifyingTennesseeInventoryEvidence(inventoryDrops);
const retainedStaleInventoryDrops = inventoryDrops.filter((drop) =>
  drop.sourceStale === true
  && drop.alertable !== true
  && drop.canAlertAsInventory !== true
  && drop.canAlertAsWatch !== true
  && Boolean(drop.staleSourceCaveat)
  && isTennesseeRetailerSignalIdentity(drop)
);
const cityHiveAlertableDrops = alertableDrops.filter((drop) => drop.type === 'cityhive_store_inventory_result');
const retailerAlertableDrops = alertableDrops.filter((drop) => drop.type === 'retailer_store_inventory_result');
const dropSources = new Set(inventoryDrops.map((drop) => drop.source).filter(Boolean));
const dropCities = new Set(inventoryDrops.map((drop) => String(drop.city || '').trim()).filter(Boolean));
const tnStores = (storesExport.stores || []).filter((store) => store.state === 'TN');
const tnLocations = (locationsExport.locations || []).filter((location) => location.state === 'TN');
const snapshotEvidence = evaluateTennesseeSnapshotEvidence({
  stateReport: state,
  dropsPayload: dropsExport,
  allowFreshRetainedEvidence,
  minimumStateRows: targetedCohort ? 60 : 1,
  minimumDropRows: targetedCohort ? 8 : 1,
});

assert(snapshotEvidence.ok, `TN generated snapshot evidence failed:\n- ${snapshotEvidence.failures.join('\n- ')}`);
if (targetedCohort) {
  assert(positiveCityHiveSignals.length >= 30, `Expected at least 30 current exact-store TN CityHive rows from the targeted cohort; got ${positiveCityHiveSignals.length}`);
  assert(positiveRetailerSignals.length >= 10, `Expected at least 10 current exact-store non-CityHive TN rows; got ${positiveRetailerSignals.length}`);
  assert(positiveInventorySignals.length >= 60, `Expected at least 60 qualified current TN inventory rows from the targeted cohort; got ${positiveInventorySignals.length}`);
  assert(cityHiveSources.size >= 4, `Expected at least 4 TN CityHive inventory sources in the targeted cohort; got ${cityHiveSources.size}: ${[...cityHiveSources].join(', ')}`);
  assert(nonCityHiveSources.size >= 3, `Expected all 3 independent non-CityHive TN inventory sources; got ${nonCityHiveSources.size}`);
  assert(inventorySources.size >= 7, `Expected at least 7 TN inventory sources in the targeted cohort; got ${inventorySources.size}: ${[...inventorySources].join(', ')}`);
  const targetedMetroCities = ['Nashville', 'Franklin', 'Brentwood', 'Murfreesboro']
    .filter((city) => inventoryCities.has(city));
  assert(targetedMetroCities.length >= 2, `Expected current inventory coverage in at least 2 Nashville metro cities; got ${targetedMetroCities.join(', ') || 'none'} from ${[...inventoryCities].join(', ')}`);
  assert(inventoryStores.size >= 7, `Expected at least 7 current TN inventory stores in the targeted cohort; got ${inventoryStores.size}: ${[...inventoryStores].join(', ')}`);
} else {
  assert(positiveCityHiveSignals.length >= 60, `Expected at least 60 exact-store, currently orderable TN CityHive rows; got ${positiveCityHiveSignals.length}`);
  assert(positiveRetailerSignals.length >= 10, `Expected at least 10 exact-store, currently orderable non-CityHive TN rows; got ${positiveRetailerSignals.length}`);
  assert(positiveInventorySignals.length >= 75, `Expected at least 75 qualified TN inventory rows; got ${positiveInventorySignals.length}`);
  assert(cityHiveSources.size >= 7, `Expected at least 7 TN CityHive inventory sources; got ${cityHiveSources.size}: ${[...cityHiveSources].join(', ')}`);
  assert(nonCityHiveSources.size >= 1, `Expected at least 1 non-CityHive TN inventory source; got ${nonCityHiveSources.size}`);
  assert(inventorySources.size >= 8, `Expected at least 8 TN inventory sources; got ${inventorySources.size}: ${[...inventorySources].join(', ')}`);
  for (const city of ['Nashville', 'Memphis', 'Knoxville', 'Franklin', 'Brentwood', 'Chattanooga', 'Johnson City', 'Murfreesboro', 'Germantown']) {
    assert(inventoryCities.has(city), `Expected ${city} TN inventory coverage; got ${[...inventoryCities].join(', ')}`);
  }
  assert(inventoryCities.has('Mount Pleasant') || inventoryCities.has('Mt Pleasant'), `Expected Mount Pleasant TN inventory coverage; got ${[...inventoryCities].join(', ')}`);
  assert(inventoryStores.size >= 20, `Expected at least 20 TN inventory stores; got ${inventoryStores.size}: ${[...inventoryStores].join(', ')}`);
}
assert(cityHiveStoreLocations.length >= cityHiveSources.size, `Expected TN CityHive store-location rows for CityHive inventory stores; locations=${cityHiveStoreLocations.length}, cityHiveSources=${cityHiveSources.size}`);
assert(unsafeCanonicalMatches.length === 0, `Unsafe TN canonical matches found: ${unsafeCanonicalMatches.map((signal) => `${signal.rawName}=>${signal.canonicalName}`).join(', ')}`);
assert(cacheAgeHours == null || cacheAgeHours <= 12, `TN CityHive cache is too old for customer-facing fast-inventory export: ${cacheAgeHours?.toFixed(1)}h`);

if ((dropsExport.drops || []).length) {
  const allowedSourceRe = /CityHive|Cool Springs|Frugal|Corkdorks|Buster|Kimbrough|Cristy|Red Dog|Moon Wine|Westside|Gateway|Grabbl|Bottle Shop|Shopify/i;
  const bourbonNameRe = /bourbon|whiskey|whisky|rye|blanton|eagle rare|weller|stagg|taylor|van winkle|buffalo trace|michter|willett|old fitz|elmer|rock hill|booker|baker|blood oath|four roses|1792|russell|woodford|wild turkey|elijah craig|old forester|green river|bardstown|knob creek|bulleit|maker/i;
  const excludedCategoryRe = /vodka|gin|rum|tequila|liqueur|cordial|wine|beer|seltzer|cocktail|ready to drink|cream|coffee|bitters|margarita|brandy|cognac|mezcal/i;
  const unsafeSources = inventoryDrops.filter((drop) => !allowedSourceRe.test(String(drop.source || '')));
  const unsafeNames = inventoryDrops.filter((drop) => excludedCategoryRe.test(`${drop.rawName || ''} ${drop.bottleName || ''}`) && !bourbonNameRe.test(`${drop.rawName || ''} ${drop.bottleName || ''}`));
  assert(!unsafeSources.length, `TN exported inventory drops must come from whitelisted public retailers; got ${unsafeSources.map((drop) => drop.source).join(', ')}`);
  assert(!unsafeNames.length, `TN exported inventory drops included non-bourbon categories: ${unsafeNames.map((drop) => drop.rawName || drop.bottleName).join(', ')}`);
  assert(cityHiveAlertableDrops.length <= positiveCityHiveSignals.length, `Exported TN CityHive drops exceeded source signals (${cityHiveAlertableDrops.length}/${positiveCityHiveSignals.length})`);
  assert(retailerAlertableDrops.length <= positiveRetailerSignals.length, `Exported TN retailer drops exceeded source signals (${retailerAlertableDrops.length}/${positiveRetailerSignals.length})`);
  assert(alertableDrops.length + retainedStaleInventoryDrops.length === inventoryDrops.length, `Every exported TN inventory drop must be either current/alertable or explicitly stale/non-alerting; got current=${alertableDrops.length}, stale=${retainedStaleInventoryDrops.length}, total=${inventoryDrops.length}`);
  assert(alertableDrops.length >= 8, `Expected at least 8 exported fresh TN inventory drops after public export dedupe; got ${alertableDrops.length}`);
  assert(cityHiveAlertableDrops.length >= 3, `Expected at least 3 exported fresh TN CityHive inventory drops; got ${cityHiveAlertableDrops.length}`);
  assert(dropSources.size >= 1, `Expected exported TN drops from at least one public retailer source; got ${dropSources.size}: ${[...dropSources].join(', ')}`);
  assert(dropCities.size >= 1, `Expected exported TN drops to preserve city metadata; got ${[...dropCities].join(', ')}`);
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
    ageHours: cacheAgeHours == null ? null : Number(cacheAgeHours.toFixed(2)),
    positiveInventorySignalCount: cache.positiveInventorySignalCount,
    sourceChains: cache.sourceChains || []
  } : null,
  exportedCityHiveDrops: cityHiveDrops.length,
  exportedRetailerDrops: retailerDrops.length,
  exportedDrops: inventoryDrops.length,
  alertableDrops: alertableDrops.length,
  retainedStaleInventoryDrops: retainedStaleInventoryDrops.length,
  snapshotEvidence: snapshotEvidence.counts,
  allowFreshRetainedEvidence,
  targetedCohort,
  exportedStores: tnStores.length,
  exportedLocations: tnLocations.length
}, null, 2));
