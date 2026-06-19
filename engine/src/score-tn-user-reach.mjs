import { readFile } from 'node:fs/promises';

async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

function norm(value) { return String(value || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function title(value) { return String(value || '').trim().replace(/\w\S*/g, (part) => part[0].toUpperCase() + part.slice(1).toLowerCase()); }
function clamp(value, min = 0, max = 1) { return Math.max(min, Math.min(max, Number(value || 0))); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function asTime(value) { const time = new Date(value || 0).getTime(); return Number.isFinite(time) ? time : 0; }

const MARKET_WEIGHTS = [
  { id: 'nashville-middle-tn', label: 'Nashville / Middle Tennessee core', weight: 42, cities: ['nashville', 'franklin', 'brentwood', 'murfreesboro', 'smyrna', 'la vergne', 'hendersonville', 'gallatin', 'mount juliet', 'spring hill'], depthTarget: 90 },
  { id: 'memphis-metro', label: 'Memphis metro', weight: 20, cities: ['memphis', 'lakeland', 'germantown', 'collierville', 'bartlett', 'cordova'], depthTarget: 55 },
  { id: 'knoxville-metro', label: 'Knoxville metro', weight: 13, cities: ['knoxville', 'farragut', 'oak ridge', 'maryville'], depthTarget: 35 },
  { id: 'chattanooga-metro', label: 'Chattanooga metro', weight: 10, cities: ['chattanooga', 'red bank', 'hixson', 'ooltewah', 'cleveland'], depthTarget: 35 },
  { id: 'tri-cities', label: 'Tri-Cities', weight: 6, cities: ['johnson city', 'kingsport', 'bristol'], depthTarget: 25 },
  { id: 'clarksville', label: 'Clarksville', weight: 5, cities: ['clarksville'], depthTarget: 15 },
  { id: 'jackson-west-tn', label: 'Jackson / West Tennessee', weight: 2, cities: ['jackson'], depthTarget: 10 },
  { id: 'remaining-secondary-markets', label: 'Cookeville / Columbia / Smokies secondary markets', weight: 2, cities: ['cookeville', 'crossville', 'columbia', 'sevierville', 'pigeon forge', 'gatlinburg'], depthTarget: 15 }
];

const state = await readJson('out/states/TN.json', { signals: [], roadblocks: [] });
const dropsExport = await readJson('out/site/drops.json', { drops: [] });
const eventsExport = await readJson('out/site/events.json', { events: [] });
const storesExport = await readJson('out/site/stores.json', { stores: [] });
const locationsExport = await readJson('out/site/locations.json', { locations: [] });

const inventoryTypes = new Set(['cityhive_store_inventory_result', 'retailer_store_inventory_result', 'store_inventory_result']);
const stateSignals = (state.signals || []).filter((row) => !row.state || row.state === 'TN');
const exportedDrops = (dropsExport.drops || []).filter((row) => row.state === 'TN');
const exportedEvents = (eventsExport.events || []).filter((row) => row.state === 'TN');
const exportedStores = (storesExport.stores || []).filter((row) => row.state === 'TN');
const exportedLocations = (locationsExport.locations || []).filter((row) => row.state === 'TN');

const byKey = new Map();
for (const row of [...stateSignals, ...exportedDrops]) {
  const type = row.eventType || row.type || '';
  if (!inventoryTypes.has(type)) continue;
  const key = [type, row.sourceLabel || row.source, row.rawName || row.bottleName || row.canonicalName, row.storeId, row.storeAddress, row.quantity || 0].join('|').toLowerCase();
  byKey.set(key, row);
}
const inventoryRows = [...byKey.values()];
const alertableInventoryRows = inventoryRows.filter((row) => row.canAlertAsInventory && Number(row.quantity || 0) > 0 && row.storeId && row.storeAddress);
const freshInventoryRows = alertableInventoryRows.filter((row) => {
  const observed = asTime(row.observedAt || row.lastConfirmedAt || row.firstSeenAt);
  return observed && Date.now() - observed <= 36 * 60 * 60 * 1000;
});
const sourceLabels = unique(alertableInventoryRows.map((row) => row.sourceLabel || row.source)).sort();
const storeKeys = unique(alertableInventoryRows.map((row) => `${row.storeName || row.locationName || row.storeId}|${row.storeAddress || ''}`));
const cityKeys = unique(alertableInventoryRows.map((row) => norm(row.city))).sort();
const highValueRows = alertableInventoryRows.filter((row) => /blanton|eagle rare|weller|stagg|taylor|van winkle|buffalo trace|michter|willett|old fitz|elmer|rock hill|booker|baker|blood oath|four roses|1792|russell|woodford|wild turkey|elijah craig|old forester|green river|bardstown|knob creek|bulleit|maker/i.test(String(row.rawName || row.bottleName || row.canonicalName || '')));
const exactCountOrExplicitAvailabilityRows = alertableInventoryRows.filter((row) => Number(row.quantity || 0) > 1 || /CityHive|Cool Springs/i.test(String(row.sourceLabel || row.source || '')));

const inventoryByCity = new Map();
for (const row of alertableInventoryRows) {
  const city = norm(row.city);
  if (!city) continue;
  inventoryByCity.set(city, (inventoryByCity.get(city) || 0) + 1);
}

const marketBreakdown = MARKET_WEIGHTS.map((market) => {
  const cityHits = market.cities.map((city) => ({ city, count: inventoryByCity.get(city) || 0 })).filter((hit) => hit.count > 0);
  const primaryHit = cityHits.some((hit) => hit.city === market.cities[0] || (market.id === 'nashville-middle-tn' && ['nashville', 'franklin', 'brentwood', 'murfreesboro'].includes(hit.city)));
  const cityFraction = cityHits.length / market.cities.length;
  const signalCount = cityHits.reduce((sum, hit) => sum + hit.count, 0);
  const depth = clamp(signalCount / market.depthTarget);
  const coverage = clamp((primaryHit ? 0.72 : 0) + cityFraction * 0.13 + depth * 0.15);
  return { ...market, cityHits, signalCount, coverage, weightedCoverage: market.weight * coverage };
});
const weightedMarketCoverage = marketBreakdown.reduce((sum, market) => sum + market.weightedCoverage, 0) / MARKET_WEIGHTS.reduce((sum, market) => sum + market.weight, 0);
const marketCoverageScore = 44 * weightedMarketCoverage;
const inventoryDepthScore = 24 * clamp((alertableInventoryRows.length / 170) * 0.34 + (freshInventoryRows.length / 150) * 0.18 + (highValueRows.length / 75) * 0.24 + (exactCountOrExplicitAvailabilityRows.length / 120) * 0.24);
const diversityScore = 14 * clamp((sourceLabels.length / 13) * 0.42 + (storeKeys.length / 16) * 0.34 + (cityKeys.length / 8) * 0.24);
const exportedDropCities = unique(exportedDrops.map((row) => norm(row.city))).filter(Boolean);
const exportedDropSources = unique(exportedDrops.map((row) => row.source)).filter(Boolean);
const exportScore = 12 * clamp((exportedDrops.length / 70) * 0.45 + (exportedDropCities.length / 7) * 0.30 + (exportedDropSources.length / 6) * 0.25);
const unsafeMatches = alertableInventoryRows.filter((row) => {
  const raw = String(row.rawName || row.bottleName || '').toLowerCase();
  const canonical = String(row.canonicalName || row.bottleName || '').toLowerCase();
  if (/\brye\b/.test(raw) && !/\brye\b/.test(canonical)) return true;
  if (/\b(cream|liqueur|cordial|cocktail|ready to drink|vodka|gin|rum|tequila|mezcal|brandy|cognac)\b/.test(raw) && !/\b(cream|liqueur|cordial|cocktail|ready to drink)\b/.test(canonical)) return true;
  return false;
});
const hardRoadblocks = (state.roadblocks || []).filter((roadblock) => !/cache reuse|fresh_cache|private_market_no_control_inventory|Tennessee ABC homepage|Tennessee ABC licensing/i.test(String(`${roadblock.source || ''} ${roadblock.status || ''} ${roadblock.error || ''}`)));
const reliabilityScore = 6 * clamp((unsafeMatches.length === 0 ? 0.45 : 0) + (freshInventoryRows.length / Math.max(1, alertableInventoryRows.length)) * 0.25 + (hardRoadblocks.length === 0 ? 0.20 : Math.max(0, 0.20 - hardRoadblocks.length * 0.04)) + (sourceLabels.some((source) => /Grabbl|Cool Springs/i.test(source)) ? 0.10 : 0));
const rawScore = marketCoverageScore + inventoryDepthScore + diversityScore + exportScore + reliabilityScore;
const score = Math.round(rawScore * 10) / 10;

const result = {
  generatedAt: new Date().toISOString(),
  state: 'TN',
  model: 'population-weighted Tennessee bourbon-hunter user usefulness',
  score,
  scoreOutOf: 100,
  grade: score >= 95 ? 'excellent' : score >= 90 ? 'strong-90-plus' : score >= 80 ? 'useful' : score >= 65 ? 'partial' : 'needs-work',
  components: {
    marketCoverage: Math.round(marketCoverageScore * 10) / 10,
    inventoryDepthFreshness: Math.round(inventoryDepthScore * 10) / 10,
    sourceStoreCityDiversity: Math.round(diversityScore * 10) / 10,
    publicExportUsefulness: Math.round(exportScore * 10) / 10,
    safetyReliability: Math.round(reliabilityScore * 10) / 10
  },
  facts: {
    alertableInventorySignals: alertableInventoryRows.length,
    freshInventorySignals: freshInventoryRows.length,
    exactCountOrExplicitAvailabilitySignals: exactCountOrExplicitAvailabilityRows.length,
    highValueInventorySignals: highValueRows.length,
    inventoryCities: cityKeys.map(title),
    inventoryCityCount: cityKeys.length,
    inventoryStores: storeKeys.length,
    inventorySources: sourceLabels,
    exportedDrops: exportedDrops.length,
    exportedDropCities: exportedDropCities.map(title),
    exportedDropSources,
    exportedEvents: exportedEvents.length,
    exportedStores: exportedStores.length,
    exportedLocations: exportedLocations.length,
    hardRoadblocks,
    unsafeMatches: unsafeMatches.map((row) => ({ rawName: row.rawName || row.bottleName, canonicalName: row.canonicalName || row.bottleName, source: row.sourceLabel || row.source }))
  },
  marketBreakdown: marketBreakdown.map((market) => ({
    id: market.id,
    label: market.label,
    weight: market.weight,
    coverage: Math.round(market.coverage * 1000) / 10,
    signalCount: market.signalCount,
    coveredCities: market.cityHits.map((hit) => ({ city: title(hit.city), count: hit.count }))
  })),
  caveat: 'Tennessee is a private retail market. Score measures public retailer-published store-level usefulness with source caveats, not guaranteed reservations or exact shelf counts for every source.'
};

console.log(JSON.stringify(result, null, 2));
if (score < 90) {
  console.error(`TN usefulness score below 90 target: ${score}`);
  process.exit(1);
}
if (unsafeMatches.length) {
  console.error(`TN score blocked by ${unsafeMatches.length} unsafe match(es).`);
  process.exit(1);
}
