import { readFile } from 'node:fs/promises';

async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

const state = await readJson('out/states/IN.json', { signals: [], roadblocks: [] });
const dropsExport = await readJson('out/site/drops.json', { drops: [] });
const eventsExport = await readJson('out/site/events.json', { events: [] });
const storesExport = await readJson('out/site/stores.json', { stores: [] });
const locationsExport = await readJson('out/site/locations.json', { locations: [] });

const MARKET_WEIGHTS = [
  { id: 'indianapolis-metro', label: 'Indianapolis metro', weight: 34, cities: ['indianapolis', 'carmel', 'fishers', 'noblesville', 'greenwood', 'avon', 'brownsburg', 'plainfield', 'speedway', 'mccordsville'] },
  { id: 'fort-wayne', label: 'Fort Wayne / New Haven', weight: 11, cities: ['fort wayne', 'new haven'] },
  { id: 'northwest-indiana', label: 'Northwest Indiana', weight: 11, cities: ['valparaiso', 'merrillville', 'chesterton', 'gary', 'hammond', 'michigan city'] },
  { id: 'south-bend', label: 'South Bend / Mishawaka / Elkhart', weight: 8, cities: ['south bend', 'mishawaka', 'elkhart'] },
  { id: 'evansville', label: 'Evansville', weight: 7, cities: ['evansville'] },
  { id: 'lafayette', label: 'Lafayette / West Lafayette', weight: 7, cities: ['lafayette', 'west lafayette'] },
  { id: 'bloomington', label: 'Bloomington', weight: 6, cities: ['bloomington'] },
  { id: 'muncie-anderson-kokomo', label: 'Muncie / Anderson / Kokomo', weight: 6, cities: ['muncie', 'anderson', 'kokomo'] },
  { id: 'terre-haute', label: 'Terre Haute', weight: 5, cities: ['terre haute', 'west terre haute'] },
  { id: 'southern-river', label: 'Columbus / Jeffersonville / New Albany', weight: 5, cities: ['columbus', 'jeffersonville', 'new albany'] }
];

function norm(value) { return String(value || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function title(value) { return String(value || '').trim().replace(/\w\S*/g, (part) => part[0].toUpperCase() + part.slice(1).toLowerCase()); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }

const stateSignals = state.signals || [];
const exportedDrops = (dropsExport.drops || []).filter((drop) => drop.state === 'IN');
const exportedEvents = (eventsExport.events || []).filter((event) => event.state === 'IN');
// Score pitchability from the normalized state artifact, not only the customer drop feed.
// The site feed intentionally filters many safe core/standard inventory rows out of drops.json;
// those rows still matter for whether Indiana is useful enough to pitch.
const inventoryTypes = new Set(['cityhive_store_inventory_result', 'retailer_store_inventory_result', 'store_inventory_result']);
const inventoryRows = stateSignals.filter((row) => row.state === 'IN' && inventoryTypes.has(row.type || row.eventType));
const alertableInventoryRows = inventoryRows.filter((row) => row.canAlertAsInventory && Number(row.quantity || 0) > 0 && row.storeId && row.storeAddress);
function rowKey(row) { return [row.type || row.eventType, row.source || row.sourceLabel, row.rawName || row.bottleName || row.canonicalName, norm(row.city), norm(row.storeName || row.locationName), row.eventDate || row.releaseDate || ''].join('|').toLowerCase(); }

const watchMap = new Map();
for (const row of [...stateSignals, ...exportedEvents, ...exportedDrops]) {
  if (row.state && row.state !== 'IN') continue;
  const type = row.type || row.eventType || '';
  const watchText = `${type} ${row.source || row.sourceLabel || ''}`;
  const explicitWatch = Boolean(row.canAlertAsWatch) && /allocated|lottery|event|tasting|raffle|release|barrel selection|barrel-selection|barrel pick/i.test(watchText);
  const eventWatch = /allocated|lottery|event|tasting|raffle|release/i.test(watchText);
  if (!eventWatch && !explicitWatch) continue;
  if (inventoryTypes.has(type) && !explicitWatch) continue;
  watchMap.set(rowKey(row), row);
}
const watchRows = [...watchMap.values()];
const storeLocationRows = stateSignals.filter((row) => row.eventType === 'licensed_package_store_location' || row.eventType === 'retailer_store_location');
const exportedStores = (storesExport.stores || []).filter((store) => store.state === 'IN');
const exportedLocations = (locationsExport.locations || []).filter((location) => location.state === 'IN');

const inventoryByCity = new Map();
for (const row of inventoryRows) {
  const city = norm(row.city);
  if (!city) continue;
  inventoryByCity.set(city, (inventoryByCity.get(city) || 0) + 1);
}
const sourceLabels = unique(inventoryRows.map((row) => row.source || row.sourceLabel));
const inventoryCities = [...inventoryByCity.keys()].sort();

const marketBreakdown = MARKET_WEIGHTS.map((market) => {
  const cityHits = market.cities.map((city) => ({ city, count: inventoryByCity.get(city) || 0 })).filter((hit) => hit.count > 0);
  const primaryHit = cityHits.some((hit) => hit.city === market.cities[0]);
  const cityFraction = cityHits.length / market.cities.length;
  const signalCount = cityHits.reduce((sum, hit) => sum + hit.count, 0);
  const signalDepth = clamp(signalCount / 35, 0, 1);
  const coverage = clamp((primaryHit ? 0.55 : 0) + cityFraction * 0.25 + signalDepth * 0.20, 0, 1);
  return { ...market, cityHits, signalCount, coverage, weightedCoverage: market.weight * coverage };
});

const weightedMarketCoverage = marketBreakdown.reduce((sum, market) => sum + market.weightedCoverage, 0) / MARKET_WEIGHTS.reduce((sum, market) => sum + market.weight, 0);
const marketCoverageScore = 40 * weightedMarketCoverage;

const highValueNames = inventoryRows.filter((row) => /blanton|eagle rare|weller|stagg|taylor|buffalo trace|michter|willett|old fitz|booker|baker|four roses|1792|elijah craig|rare character|smoke wagon|new riff/i.test(String(row.bottleName || row.rawName || row.canonicalName || '')));
const depthScore = 25 * clamp((inventoryRows.length / 250) * 0.45 + (alertableInventoryRows.length / 150) * 0.35 + (sourceLabels.length / 5) * 0.10 + (highValueNames.length / 60) * 0.10, 0, 1);
const eventScore = 15 * clamp((watchRows.length / 10) * 0.65 + (unique(watchRows.map((row) => row.source || row.sourceLabel)).length / 4) * 0.35, 0, 1);
const hardRoadblocks = (state.roadblocks || []).filter((roadblock) => !/private_market_no_control_inventory/i.test(String(roadblock.status || roadblock.error || '')));
const reliabilityScore = 10 * clamp((sourceLabels.length / 4) * 0.65 + (hardRoadblocks.length === 0 ? 0.35 : Math.max(0, 0.35 - hardRoadblocks.length * 0.12)), 0, 1);
const storeLocationScore = 10 * clamp(((exportedStores.length || storeLocationRows.length) / 1000) * 0.45 + ((exportedLocations.length || storeLocationRows.length) / 1000) * 0.25 + (unique(storeLocationRows.map((row) => norm(row.city))).length / 200) * 0.30, 0, 1);

const totalScore = marketCoverageScore + depthScore + eventScore + reliabilityScore + storeLocationScore;

const result = {
  state: 'IN',
  model: 'population-weighted bourbon-hunter user usefulness',
  score: Math.round(totalScore * 10) / 10,
  scoreOutOf: 100,
  components: {
    marketCoverage: Math.round(marketCoverageScore * 10) / 10,
    inventoryDepthFreshness: Math.round(depthScore * 10) / 10,
    allocatedEventIntel: Math.round(eventScore * 10) / 10,
    reliabilityDurability: Math.round(reliabilityScore * 10) / 10,
    statewideStoreLocationUsefulness: Math.round(storeLocationScore * 10) / 10
  },
  facts: {
    inventorySignals: inventoryRows.length,
    alertableInventorySignals: alertableInventoryRows.length,
    inventoryCities: inventoryCities.map(title),
    inventoryCityCount: inventoryCities.length,
    inventorySources: sourceLabels.sort(),
    watchSignals: watchRows.length,
    exportedStores: exportedStores.length,
    exportedLocations: exportedLocations.length,
    stateRoadblocks: state.roadblocks || []
  },
  marketBreakdown: marketBreakdown.map((market) => ({
    id: market.id,
    label: market.label,
    weight: market.weight,
    coverage: Math.round(market.coverage * 1000) / 10,
    signalCount: market.signalCount,
    coveredCities: market.cityHits.map((hit) => ({ city: title(hit.city), count: hit.count }))
  })),
  interpretation: totalScore >= 70
    ? 'Strong Indiana coverage for many likely bourbon hunters, though gaps remain in unserved metros.'
    : totalScore >= 45
      ? 'Useful but still uneven Indiana coverage; prioritize the largest uncovered metros next.'
      : 'Early Indiana coverage; useful for select cities but not yet broad enough for most users.'
};

console.log(JSON.stringify(result, null, 2));
