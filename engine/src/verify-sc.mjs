import { readFile } from 'node:fs/promises';

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
const alertable = allInventory.filter((row) => row.canAlertAsInventory && Number(row.quantity || 0) > 0 && row.locationPrecision === 'store_level');
const fresh = alertable.filter((row) => {
  const observed = asTime(row.observedAt || row.lastConfirmedAt || row.firstSeenAt);
  return observed && Date.now() - observed <= 36 * 60 * 60 * 1000;
});
const sources = unique(alertable.map((row) => row.sourceLabel || row.source)).sort();
const stores = unique(alertable.map((row) => `${row.storeName || row.locationName || row.storeId}|${row.storeAddress || ''}`));
const cities = unique(alertable.map((row) => norm(row.city))).sort();

if (alertable.length < 60) throw new Error(`SC alertable inventory rows below 90+ threshold: ${alertable.length}`);
if (fresh.length < 55) throw new Error(`SC fresh inventory rows below threshold: ${fresh.length}`);
if (sources.length < 3) throw new Error(`SC positive inventory source diversity too low: ${sources.length}`);
if (stores.length < 8) throw new Error(`SC positive inventory store coverage too low: ${stores.length}`);
if (cities.length < 5) throw new Error(`SC positive inventory city coverage too low: ${cities.length}`);
if (!sources.some((source) => /Green's Beverage/i.test(source))) throw new Error('Missing Green\'s Beverage SC CityHive inventory rows');
if (!sources.some((source) => /Wine & Bourbon Barn/i.test(source))) throw new Error('Missing Wine & Bourbon Barn CityHive inventory rows');
if (!sources.some((source) => /Da Brown Bag|Clover/i.test(source))) throw new Error('Missing Da Brown Bag Clover inventory rows');

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
if (Number(score.score || 0) < 90) throw new Error(`SC score below 90: ${score.score}`);

const hardRoadblocks = (state.roadblocks || []).filter((roadblock) => !/cache reuse|fresh_cache|DOR ABL|licensing|regulatory/i.test(String(`${roadblock.source || ''} ${roadblock.status || ''} ${roadblock.error || ''}`)));
if (hardRoadblocks.length > 4) throw new Error(`SC collector has too many hard roadblocks: ${hardRoadblocks.length}`);

console.log(`Verified SC: score ${score.score}/100, ${alertable.length} alertable rows, ${fresh.length} fresh, ${sources.length} sources, ${stores.length} stores, ${cities.length} cities, ${exportedDrops.length} exported drops.`);
