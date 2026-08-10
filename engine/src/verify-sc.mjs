import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { hasSouthCarolinaPositiveInventoryEvidence } from './south-carolina-retailer-policy.mjs';
async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

function norm(value) { return String(value || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function asTime(value) { const time = new Date(value || 0).getTime(); return Number.isFinite(time) ? time : 0; }

const state = await readJson('out/states/SC.json', null);
const summary = await readJson('out/summary.json', { states: [] });
const operational = await readJson('out/current-snapshot.json', { signals: [] });
const dropsExport = await readJson('out/site/drops.json', { drops: [] });
const storesExport = await readJson('out/site/stores.json', { stores: [] });
const locationsExport = await readJson('out/site/locations.json', { locations: [] });
const score = await readJson('out/quality/sc-user-reach-score.json', null);
const inventoryBaseline = await readJson('data/south-carolina-inventory-baseline.json', null);

if (!state) throw new Error('Missing out/states/SC.json');
const summaryState = (summary.states || []).find((row) => row.state === 'SC');
if (!summaryState) throw new Error('SC is missing from summary active-state output');
if (summaryState.status !== 'useful') throw new Error(`SC summary status is ${summaryState.status}, expected useful`);

const inventoryTypes = new Set(['cityhive_store_inventory_result', 'retailer_store_inventory_result', 'store_inventory_result']);

const stateSignals = (state.signals || []).filter((row) => !row.state || row.state === 'SC');
const operationalSignals = (operational.signals || []).filter((row) => row.state === 'SC');
const exportedDrops = (dropsExport.drops || []).filter((row) => row.state === 'SC');
const exportedStores = (storesExport.stores || []).filter((row) => row.state === 'SC');
const exportedLocations = (locationsExport.locations || []).filter((row) => row.state === 'SC');

const allInventory = [...stateSignals, ...operationalSignals, ...exportedDrops].filter((row) => inventoryTypes.has(row.eventType || row.type || ''));
const alertable = allInventory.filter((row) => row.canAlertAsInventory && hasSouthCarolinaPositiveInventoryEvidence(row) && row.locationPrecision === 'store_level');
const fresh = alertable.filter((row) => {
  const observed = asTime(row.observedAt || row.lastConfirmedAt || row.firstSeenAt);
  const ageMs = Date.now() - observed;
  return observed && ageMs >= -5 * 60_000 && ageMs <= 36 * 60 * 60 * 1000;
});
const sources = unique(alertable.map((row) => row.sourceLabel || row.source)).sort();
const stores = unique(alertable.map((row) => `${row.storeName || row.locationName || row.storeId}|${row.storeAddress || ''}`));
const cities = unique(alertable.map((row) => norm(row.city))).sort();
const myrtleInventory = stateSignals.filter((row) =>
  inventoryTypes.has(row.eventType || row.type || '')
  && row.canAlertAsInventory
  && hasSouthCarolinaPositiveInventoryEvidence(row)
  && row.locationPrecision === 'store_level'
  && norm(row.city) === 'myrtle beach'
);
const myrtleStores = unique(myrtleInventory.map((row) => `${row.storeName || row.locationName || row.storeId}|${row.storeAddress || ''}`));
const myrtleSources = unique(myrtleInventory.map((row) => row.sourceLabel || row.source));
const myrtleFresh = myrtleInventory.filter((row) => {
  const observed = asTime(row.observedAt || row.lastConfirmedAt || row.firstSeenAt);
  const ageMs = Date.now() - observed;
  return observed && ageMs >= -5 * 60_000 && ageMs <= 36 * 60 * 60 * 1000;
});
const exportedMyrtleDrops = exportedDrops.filter((row) => norm(row.city || row.store_city) === 'myrtle beach');
const exportedMyrtleStores = unique(exportedMyrtleDrops.map((row) => `${row.storeName || row.store_name || row.locationName || row.storeId}|${row.storeAddress || row.store_address || ''}`));

if (!inventoryBaseline || inventoryBaseline.contractVersion !== 'bourbon-signal/sc-inventory-baseline@1') throw new Error('Missing immutable South Carolina inventory baseline');
if (inventoryBaseline.storeCount !== 20 || inventoryBaseline.stores?.length !== 20) throw new Error(`South Carolina inventory baseline store count drifted: ${inventoryBaseline.storeCount}`);
const baselineCanonical = inventoryBaseline.stores.map((row) => `${row.storeId}|${row.storeName}|${row.storeAddress}`).join('\n');
const baselineDigest = createHash('sha256').update(baselineCanonical).digest('hex');
if (baselineDigest !== '3a018509578df19765f5751777dfcde5f1d2de63cded8ec7f56f659b83cf7a89' || inventoryBaseline.canonicalSha256 !== baselineDigest) throw new Error(`South Carolina inventory baseline digest drifted: ${baselineDigest}`);
const currentStateInventoryRows = stateSignals
  .filter((row) => inventoryTypes.has(row.eventType || row.type || '') && row.canAlertAsInventory && hasSouthCarolinaPositiveInventoryEvidence(row));
const currentStateInventoryStores = new Set(currentStateInventoryRows.map((row) => row.storeId).filter(Boolean));
const currentRowsByStoreId = new Map();
for (const row of currentStateInventoryRows) {
  const storeId = String(row.storeId || '');
  if (!storeId) continue;
  if (!currentRowsByStoreId.has(storeId)) currentRowsByStoreId.set(storeId, []);
  currentRowsByStoreId.get(storeId).push(row);
}
const missingBaselineStores = inventoryBaseline.stores.map((row) => row.storeId).filter((storeId) => !currentStateInventoryStores.has(storeId));
if (missingBaselineStores.length) throw new Error(`South Carolina inventory baseline stores were lost: ${missingBaselineStores.join(', ')}`);
const baselineIdentityMismatches = inventoryBaseline.stores.flatMap((baselineStore) =>
  (currentRowsByStoreId.get(baselineStore.storeId) || [])
    .filter((row) => norm(row.storeName || row.locationName) !== norm(baselineStore.storeName)
      || norm(row.storeAddress) !== norm(baselineStore.storeAddress))
    .map((row) => ({
      storeId: baselineStore.storeId,
      expected: `${baselineStore.storeName}|${baselineStore.storeAddress}`,
      actual: `${row.storeName || row.locationName}|${row.storeAddress}`,
    })));
if (baselineIdentityMismatches.length) throw new Error(`South Carolina inventory baseline identity drifted: ${JSON.stringify(baselineIdentityMismatches)}`);
for (const storeId of ['odarbys-liquor-barn:607f9bdbb73eb4091ef976e7', 'odarbys-liquor-barn:607f1c35f568f15818499db8']) {
  if (!currentStateInventoryStores.has(storeId)) throw new Error(`Missing reviewed South Carolina expansion store: ${storeId}`);
}
if (currentStateInventoryStores.size < 22) throw new Error(`South Carolina inventory expansion below 22-store floor: ${currentStateInventoryStores.size}`);

if (alertable.length < 60) throw new Error(`SC alertable inventory rows below 90+ threshold: ${alertable.length}`);
if (fresh.length < 55) throw new Error(`SC fresh inventory rows below threshold: ${fresh.length}`);
if (sources.length < 8) throw new Error(`SC positive inventory source diversity too low: ${sources.length}`);
if (stores.length < 15) throw new Error(`SC positive inventory store coverage too low: ${stores.length}`);
if (cities.length < 10) throw new Error(`SC positive inventory city coverage too low: ${cities.length}`);
if (!sources.some((source) => /Green's Beverage/i.test(source))) throw new Error('Missing Green\'s Beverage SC CityHive inventory rows');
if (!sources.some((source) => /Wine & Bourbon Barn/i.test(source))) throw new Error('Missing Wine & Bourbon Barn CityHive inventory rows');
if (myrtleInventory.length < 10) throw new Error(`Myrtle Beach inventory rows below threshold: ${myrtleInventory.length}`);
if (myrtleFresh.length < 10) throw new Error(`Myrtle Beach fresh inventory rows below threshold: ${myrtleFresh.length}`);
if (myrtleStores.length < 4) throw new Error(`Myrtle Beach inventory store coverage too low: ${myrtleStores.length}`);
if (!myrtleSources.some((source) => /Green's Beverage/i.test(source))) throw new Error('Missing Green\'s Beverage Myrtle Beach inventory rows');
if (!myrtleSources.some((source) => /Beach Discount Beverages/i.test(source))) throw new Error('Missing Beach Discount Beverages Myrtle Beach inventory rows');
if (!myrtleSources.some((source) => /Surf Beverage/i.test(source))) throw new Error('Missing Surf Beverage Myrtle Beach inventory rows');
if (!myrtleSources.some((source) => /Dunes Liquor/i.test(source))) throw new Error('Missing Dunes Liquor Myrtle Beach inventory rows');
if (exportedMyrtleDrops.length < 5) throw new Error(`Myrtle Beach exported drops below threshold: ${exportedMyrtleDrops.length}`);
// The bounded public feed may rank several same-city stores behind a stronger card.
// Require one visible Myrtle store while proving multi-store breadth from the complete
// fresh normalized state artifact above.
if (exportedMyrtleStores.length < 1) throw new Error(`Myrtle Beach exported store coverage too low: ${exportedMyrtleStores.length}`);

const nonScAddress = alertable.find((row) => !/,\s*SC\s+\d{5}/i.test(String(row.storeAddress || '')));
if (nonScAddress) throw new Error(`SC inventory row has non-SC/missing address: ${nonScAddress.sourceLabel || nonScAddress.source} ${nonScAddress.storeAddress || '(missing)'}`);
const nonStoreInventory = alertable.find((row) => row.locationPrecision !== 'store_level');
if (nonStoreInventory) throw new Error(`SC inventory-alertable row is not store_level: ${nonStoreInventory.sourceLabel || nonStoreInventory.source}`);
const officialInventory = alertable.find((row) => /DOR|ABL|licensing|regulatory/i.test(String(row.sourceLabel || row.source || '')));
if (officialInventory) throw new Error(`SC official/regulatory source became inventory-alertable: ${officialInventory.sourceLabel || officialInventory.source}`);
const missingVerifyCaveat = alertable.find((row) => !/verify|retailer-published|pickup|order|availability/i.test(`${row.inventorySemantics || ''} ${row.evidence || ''}`));
if (missingVerifyCaveat) throw new Error(`SC inventory row is missing verify/retailer caveat: ${missingVerifyCaveat.sourceLabel || missingVerifyCaveat.source}`);
const unsafeMatch = alertable.find((row) => {
  const raw = String(row.rawName || row.bottleName || '').toLowerCase();
  const canonical = String(row.canonicalName || row.bottleName || '').toLowerCase();
  if (/\brye\b/.test(raw) && !/\brye\b/.test(canonical)) return true;
  if (/\b(cream|liqueur|cordial|cocktail|ready to drink|vodka|gin|rum|tequila|mezcal|brandy|cognac|wine|beer|stout|bundle|gift card)\b/.test(raw)) return true;
  return false;
});
if (unsafeMatch) throw new Error(`Unsafe SC bottle match survived filtering: ${unsafeMatch.rawName} -> ${unsafeMatch.canonicalName}`);

if (!exportedDrops.length) throw new Error('SC exported drops are missing');
// The shelf-free public drop export can legitimately include fewer stores than the normalized state artifact.
// Verify broad store/location coverage from alertable state rows, while still requiring public SC drops.
if (stores.length < 8) throw new Error(`SC normalized store coverage too low: ${stores.length}`);
if (cities.length < 5) throw new Error(`SC normalized city coverage too low: ${cities.length}`);
if (!score) throw new Error('Missing out/quality/sc-user-reach-score.json; run npm run score:sc before verify:sc');
if (Number(score.score || 0) < 85) throw new Error(`SC score below useful expanded-coverage threshold: ${score.score}`);

const hardRoadblocks = (state.roadblocks || []).filter((roadblock) => !/cache reuse|fresh_cache|DOR ABL|licensing|regulatory/i.test(String(`${roadblock.source || ''} ${roadblock.status || ''} ${roadblock.error || ''}`)));
if (hardRoadblocks.length > 4) throw new Error(`SC collector has too many hard roadblocks: ${hardRoadblocks.length}`);

console.log(`Verified SC: score ${score.score}/100, ${alertable.length} alertable rows, ${fresh.length} fresh, ${sources.length} sources, ${stores.length} stores, ${cities.length} cities, ${exportedDrops.length} exported drops.`);
