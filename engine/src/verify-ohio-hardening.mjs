import { readFileSync } from 'node:fs';

function readJson(path) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}

const state = readJson('../out/states/OH.json');
const drops = readJson('../out/site/drops.json');
const alerts = readJson('../out/site/alerts.json');
const stats = readJson('../out/site/stats.json');

const failures = [];
function fail(message) { failures.push(message); }

const signals = state.signals || [];
const roadblocks = state.roadblocks || [];
const ohlqSignals = signals.filter((signal) => /^browser_assisted_store_inventory_(limited_supply|in_stock)$/i.test(String(signal.eventType || '')));
const discoverySamples = signals.filter((signal) => signal.eventType === 'browser_captured_store_inventory_sample' || signal.raw?.sampleOnly);
const positiveStatuses = new Set(['limited_supply', 'in_stock']);
const invalidPositiveStatus = ohlqSignals.find((signal) => !positiveStatuses.has(String(signal.availabilityStatus || '')));
const staleObserved = ohlqSignals.find((signal) => {
  const observedAt = Date.parse(signal.observedAt || signal.raw?.product?.generatedAt || '');
  return !Number.isFinite(observedAt) || Date.now() - observedAt > 1000 * 60 * 60 * 24 * 3;
});
const ohioDrops = (drops.drops || []).filter((drop) => drop.state === 'OH');
const storeDrops = ohioDrops.filter((drop) => /^browser_assisted_store_inventory_(limited_supply|in_stock)$/i.test(String(drop.type || '')) && drop.locationPrecision === 'store_level');
const alertableDrops = storeDrops.filter((drop) => drop.canAlertAsInventory === true && drop.dataLane === 'actionable_inventory');
const cities = new Set(storeDrops.map((drop) => drop.city || drop.storeCity).filter(Boolean));
const bottles = new Set(storeDrops.map((drop) => drop.canonicalName || drop.bottleName || drop.rawName).filter(Boolean));
const ohioAlerts = (alerts.alerts || []).filter((alert) => alert.state === 'OH');
const coverage = stats.stateCoverage?.states?.find((row) => row.state === 'OH');
const falseYellowstoneLimited = [...signals, ...ohioDrops].find((row) => /yellowstone limited edition/i.test(String(row.canonicalName || row.bottle || row.bottleName || '')) && /small batch|select|6yr|6 year/i.test(String(row.rawName || row.evidence || '')));
const unsafeSourceNamedDrop = ohioDrops.find((drop) => String(drop.raw?.sourceMatchStatus || drop.sourceMatchStatus || '').startsWith('source_name_kept:'));
const alertWithoutBottle = ohioAlerts.find((alert) => !alert.bottle && !alert.bottleId && !alert.canonicalName);

if (state.status !== 'useful') fail(`Ohio state artifact should be useful, got ${state.status}.`);
if (discoverySamples.length) fail(`Ohio should not publish stale browser discovery sample rows once hardened; got ${discoverySamples.length}.`);
if (ohlqSignals.length < 100) fail(`Expected at least 100 fresh decoded OHLQ positive store availability signals, got ${ohlqSignals.length}.`);
if (storeDrops.length < 100) fail(`Expected at least 100 customer-visible Ohio store availability drops, got ${storeDrops.length}.`);
if (alertableDrops.length < 100) fail(`Expected at least 100 alertable Ohio actionable inventory drops, got ${alertableDrops.length}.`);
if (cities.size < 15) fail(`Expected Ohio drops across at least 15 cities, got ${cities.size}.`);
if (bottles.size < 3) fail(`Expected Ohio drops for at least 3 distinct bottles, got ${bottles.size}.`);
if (invalidPositiveStatus) fail(`Ohio emitted an invalid positive status: ${invalidPositiveStatus.availabilityStatus}.`);
if (staleObserved) fail(`Ohio has stale/missing observedAt on ${staleObserved.canonicalName || staleObserved.rawName} at ${staleObserved.storeName || staleObserved.locationName}.`);
if (ohioAlerts.length < 1 && alertableDrops.length < 100) fail(`Expected Ohio to be alert-ready via drops or candidates; got ${ohioAlerts.length} alert candidates and ${alertableDrops.length} alertable drops.`);
if (falseYellowstoneLimited) fail(`Ohio false-positive guard failed: ordinary Yellowstone row was promoted to Yellowstone Limited Edition (${falseYellowstoneLimited.rawName || falseYellowstoneLimited.evidence || 'unknown row'}).`);
if (unsafeSourceNamedDrop) fail(`Ohio source-named unsafe match leaked into public drops: ${unsafeSourceNamedDrop.rawName || unsafeSourceNamedDrop.canonicalName}.`);
if (alertWithoutBottle) fail(`Ohio alert candidate is missing a safe bottle match: ${alertWithoutBottle.id || alertWithoutBottle.reason || 'unknown alert'}.`);
if (!coverage) fail('stats.stateCoverage.states should include Ohio.');
if (coverage && coverage.coverageTier !== 'live_store_inventory') fail(`Expected Ohio coverageTier live_store_inventory, got ${coverage.coverageTier}.`);
if (coverage && coverage.refinementLevel !== 'city') fail(`Expected Ohio refinementLevel city, got ${coverage.refinementLevel}.`);

for (const drop of storeDrops.slice(0, 25)) {
  if (!drop.inventoryCaveat || !/verify|sell out|stock status|availability/i.test(drop.inventoryCaveat)) {
    fail(`Ohio drop ${drop.id || drop.key || drop.canonicalName} missing verify-before-driving/status caveat.`);
    break;
  }
}

if (failures.length) {
  console.error('Ohio hardening verification failed:');
  for (const message of failures) console.error(`- ${message}`);
  console.error(`Context: ${ohlqSignals.length} decoded signals, ${storeDrops.length} public store drops, ${alertableDrops.length} alertable drops, ${cities.size} cities, ${bottles.size} bottles, ${roadblocks.length} roadblocks.`);
  process.exit(1);
}

console.log(`Ohio hardening verification passed: ${ohlqSignals.length} decoded positive store signals, ${storeDrops.length} public store drops (${alertableDrops.length} alertable), ${cities.size} cities, ${bottles.size} bottles, ${ohioAlerts.length} current alert candidates.`);
