import { mkdir, readFile, writeFile } from 'node:fs/promises';

async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

function norm(value) { return String(value || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function title(value) { return String(value || '').trim().replace(/\w\S*/g, (part) => part[0].toUpperCase() + part.slice(1).toLowerCase()); }
function clamp(value, min = 0, max = 1) { return Math.max(min, Math.min(max, Number(value || 0))); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function asTime(value) { const time = new Date(value || 0).getTime(); return Number.isFinite(time) ? time : 0; }

const MARKET_WEIGHTS = [
  { id: 'columbia-midlands', label: 'Columbia / Midlands core', weight: 30, cities: ['columbia'], depthTarget: 65 },
  { id: 'greenville-upstate', label: 'Greenville / Upstate', weight: 25, cities: ['greenville', 'simpsonville', 'mauldin', 'spartanburg'], depthTarget: 85 },
  { id: 'charleston-lowcountry', label: 'Charleston / Lowcountry', weight: 20, cities: ['charleston', 'north charleston', 'mount pleasant', 'summerville'], depthTarget: 45 },
  { id: 'myrtle-beach-grand-strand', label: 'Myrtle Beach / Grand Strand', weight: 12, cities: ['myrtle beach', 'north myrtle beach', 'conway'], depthTarget: 35 },
  { id: 'charlotte-adjacent-york-lancaster', label: 'Charlotte-adjacent York/Lancaster side', weight: 8, cities: ['indian land', 'rock hill', 'fort mill', 'lancaster'], depthTarget: 12 },
  { id: 'remaining-secondary-markets', label: 'Florence / Aiken / Beaufort secondary markets', weight: 5, cities: ['florence', 'aiken', 'beaufort', 'hilton head', 'anderson'], depthTarget: 12 }
];

const state = await readJson('out/states/SC.json', { signals: [], roadblocks: [] });
const dropsExport = await readJson('out/site/drops.json', { drops: [] });
const eventsExport = await readJson('out/site/events.json', { events: [] });
const storesExport = await readJson('out/site/stores.json', { stores: [] });
const locationsExport = await readJson('out/site/locations.json', { locations: [] });
const operationalExport = await readJson('out/current-snapshot.json', { signals: [] });

const inventoryTypes = new Set(['cityhive_store_inventory_result', 'retailer_store_inventory_result', 'store_inventory_result']);
const sourceSignals = (state.signals || []).filter((row) => !row.state || row.state === 'SC');
const operationalSignals = (operationalExport.signals || []).filter((row) => row.state === 'SC');
const exportedDrops = (dropsExport.drops || []).filter((row) => row.state === 'SC');
const exportedEvents = (eventsExport.events || []).filter((row) => row.state === 'SC');
const exportedStores = (storesExport.stores || []).filter((row) => row.state === 'SC');
const exportedLocations = (locationsExport.locations || []).filter((row) => row.state === 'SC');

const byKey = new Map();
for (const row of [...sourceSignals, ...operationalSignals, ...exportedDrops]) {
  const type = row.eventType || row.type || '';
  if (!inventoryTypes.has(type)) continue;
  const key = [type, row.sourceLabel || row.source, row.rawName || row.bottleName || row.canonicalName, row.storeId, row.storeAddress, row.quantity || 0].join('|').toLowerCase();
  byKey.set(key, row);
}
const inventoryRows = [...byKey.values()];
const alertableInventoryRows = inventoryRows.filter((row) => row.canAlertAsInventory && Number(row.quantity || 0) > 0 && row.locationPrecision === 'store_level' && row.storeId && row.storeAddress && /,\s*SC\s+\d{5}/i.test(String(row.storeAddress)));
const freshInventoryRows = alertableInventoryRows.filter((row) => {
  const observed = asTime(row.observedAt || row.lastConfirmedAt || row.firstSeenAt);
  return observed && Date.now() - observed <= 36 * 60 * 60 * 1000;
});
const sourceLabels = unique(alertableInventoryRows.map((row) => row.sourceLabel || row.source)).sort();
const storeKeys = unique(alertableInventoryRows.map((row) => `${row.storeName || row.locationName || row.storeId}|${row.storeAddress || ''}`));
const cityKeys = unique(alertableInventoryRows.map((row) => norm(row.city))).sort();
const highValueRows = alertableInventoryRows.filter((row) => /blanton|eagle rare|weller|stagg|taylor|van winkle|buffalo trace|michter|willett|old fitz|elmer|rock hill|booker|baker|blood oath|four roses|1792|russell|woodford|wild turkey|elijah craig|old forester|green river|bardstown|knob creek|bulleit|maker|yellowstone|penelope|jack daniel/i.test(String(row.rawName || row.bottleName || row.canonicalName || '')));
const exactCountRows = alertableInventoryRows.filter((row) => Number(row.quantity || 0) > 1 && !/listed_available_no_exact_count/i.test(String(row.raw?.quantitySemantics || row.quantitySemantics || '')) && /CityHive|Clover|Green's Beverage|Wine & Bourbon Barn|Da Brown Bag/i.test(String(row.sourceLabel || row.source || '')));

const inventoryByCity = new Map();
for (const row of alertableInventoryRows) {
  const city = norm(row.city);
  if (!city) continue;
  inventoryByCity.set(city, (inventoryByCity.get(city) || 0) + 1);
}

const marketBreakdown = MARKET_WEIGHTS.map((market) => {
  const cityHits = market.cities.map((city) => ({ city, count: inventoryByCity.get(city) || 0 })).filter((hit) => hit.count > 0);
  const primaryHit = cityHits.some((hit) => hit.city === market.cities[0] || (market.id === 'charleston-lowcountry' && hit.city === 'north charleston') || (market.id === 'charlotte-adjacent-york-lancaster' && ['indian land', 'rock hill', 'fort mill'].includes(hit.city)));
  const cityFraction = cityHits.length / market.cities.length;
  const signalCount = cityHits.reduce((sum, hit) => sum + hit.count, 0);
  const depth = clamp(signalCount / market.depthTarget);
  const coverage = clamp((primaryHit ? 0.74 : 0) + cityFraction * 0.11 + depth * 0.15);
  return { ...market, cityHits, signalCount, coverage, weightedCoverage: market.weight * coverage };
});
const weightedMarketCoverage = marketBreakdown.reduce((sum, market) => sum + market.weightedCoverage, 0) / MARKET_WEIGHTS.reduce((sum, market) => sum + market.weight, 0);
const marketCoverageScore = 42 * weightedMarketCoverage;
const inventoryDepthScore = 24 * clamp((alertableInventoryRows.length / 75) * 0.32 + (freshInventoryRows.length / 70) * 0.18 + (highValueRows.length / 45) * 0.25 + (exactCountRows.length / 55) * 0.25);
const diversityScore = 14 * clamp((sourceLabels.length / 4) * 0.32 + (storeKeys.length / 11) * 0.38 + (cityKeys.length / 6) * 0.30);
const exportedDropCities = unique(exportedDrops.map((row) => norm(row.city))).filter(Boolean);
const exportedDropSources = unique(exportedDrops.map((row) => row.source || row.sourceLabel)).filter(Boolean);
// Score public usefulness from both the shelf-free customer drop export and the normalized
// state artifact. The drop feed intentionally excludes many safe core/standard retailer rows,
// but those rows still make SC useful for alerts, store coverage, and pitch readiness.
const exportScore = 12 * clamp(
  (alertableInventoryRows.length / 75) * 0.35
  + (cityKeys.length / 6) * 0.25
  + (sourceLabels.length / 4) * 0.20
  + (exportedDrops.length / 50) * 0.10
  + (exportedDropCities.length / 5) * 0.05
  + (exportedDropSources.length / 4) * 0.05
);
const unsafeMatches = alertableInventoryRows.filter((row) => {
  const raw = String(row.rawName || row.bottleName || '').toLowerCase();
  const canonical = String(row.canonicalName || row.bottleName || '').toLowerCase();
  if (/\brye\b/.test(raw) && !/\brye\b/.test(canonical)) return true;
  if (/\b(cream|liqueur|cordial|cocktail|ready to drink|vodka|gin|rum|tequila|mezcal|brandy|cognac|wine|beer|stout|bundle|gift card)\b/.test(raw)) return true;
  return false;
});
const hardRoadblocks = (state.roadblocks || []).filter((roadblock) => !/cache reuse|fresh_cache|DOR ABL|licensing|regulatory/i.test(String(`${roadblock.source || ''} ${roadblock.status || ''} ${roadblock.error || ''}`)));
const sourceFamilyText = sourceLabels.join(' ');
const hasExactRetailerSources = /Green's Beverage|Wine & Bourbon Barn|Da Brown Bag|Clover|CityHive/i.test(sourceFamilyText);
const reliabilityScore = 8 * clamp((unsafeMatches.length === 0 ? 0.35 : 0) + (freshInventoryRows.length / Math.max(1, alertableInventoryRows.length)) * 0.25 + (hardRoadblocks.length === 0 ? 0.20 : Math.max(0, 0.20 - hardRoadblocks.length * 0.04)) + (hasExactRetailerSources ? 0.20 : 0));
const rawScore = marketCoverageScore + inventoryDepthScore + diversityScore + exportScore + reliabilityScore;
const storeCoverageCap = storeKeys.length < 10 ? 79
  : storeKeys.length < 15 ? 86
    : storeKeys.length < 20 ? 89
      : storeKeys.length < 30 ? 92
        : 100;
const cityCoverageCap = cityKeys.length < 8 ? 88 : cityKeys.length < 10 ? 91 : 100;
const sourceCoverageCap = sourceLabels.length < 6 ? 88 : sourceLabels.length < 8 ? 91 : 100;
const score = Math.round(Math.min(rawScore, storeCoverageCap, cityCoverageCap, sourceCoverageCap) * 10) / 10;

const result = {
  generatedAt: new Date().toISOString(),
  state: 'SC',
  model: 'population-weighted South Carolina bourbon-hunter user usefulness',
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
    exactCountSignals: exactCountRows.length,
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
  }))
};

await mkdir('out/quality', { recursive: true });
await writeFile('out/quality/sc-user-reach-score.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (score < 85) process.exitCode = 1;
