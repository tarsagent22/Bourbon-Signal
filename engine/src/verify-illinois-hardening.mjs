import { readFileSync } from 'node:fs';

function readJson(path) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}

const state = readJson('../out/states/IL.json');
const drops = readJson('../out/site/drops.json');
const alerts = readJson('../out/site/alerts.json');
const stats = readJson('../out/site/stats.json');

const failures = [];
function fail(message) { failures.push(message); }

const signals = state.signals || [];
const storeSignals = signals.filter((signal) => signal.eventType === 'retailer_store_inventory' && signal.locationPrecision === 'store_level');
const coverageSignal = signals.find((signal) => signal.eventType === 'inventory_source_health');
const illinoisDrops = (drops.drops || []).filter((drop) => drop.state === 'IL');
const storeDrops = illinoisDrops.filter((drop) => drop.type === 'retailer_store_inventory' && drop.locationPrecision === 'store_level');
const alertableDrops = storeDrops.filter((drop) => drop.canAlertAsInventory === true && drop.dataLane === 'actionable_inventory');
const illinoisAlerts = (alerts.alerts || []).filter((alert) => alert.state === 'IL');
const coverage = stats.stateCoverage?.states?.find((row) => row.state === 'IL');
const bottleNames = new Set(storeDrops.map((drop) => drop.canonicalName || drop.bottleName || drop.rawName).filter(Boolean));
const unsafeFourRoses = storeDrops.find((drop) => /four roses bourbon/i.test(String(drop.rawName || '')) && /limited edition/i.test(String(drop.canonicalName || drop.bottleName || '')));
const unsafeHenry = storeDrops.find((drop) => /henry mckenna bourbon/i.test(String(drop.rawName || '')) && /\b10 year\b/i.test(String(drop.canonicalName || drop.bottleName || '')));

if (state.status !== 'useful') fail(`Illinois state artifact should be useful, got ${state.status}.`);
if (state.stale) fail(`Illinois state artifact should be fresh after the live collector pass, got stale=${state.stale} (${state.staleReason || 'no reason'}).`);
if (storeSignals.length < 700) fail(`Expected at least 700 Illinois store inventory signals, got ${storeSignals.length}.`);
if (storeDrops.length < 700) fail(`Expected at least 700 Illinois public store inventory drops, got ${storeDrops.length}.`);
if (alertableDrops.length < 150 && illinoisAlerts.length < 150) fail(`Expected at least 150 Illinois alertable store drops or alert candidates, got ${alertableDrops.length} alertable drops and ${illinoisAlerts.length} alerts.`);
if (!coverageSignal) fail('Illinois should publish an inventory_source_health coverage signal.');
if (!bottleNames.has('Wild Turkey Rare Breed Straight Bourbon')) fail('Illinois canary bottle Wild Turkey Rare Breed Straight Bourbon is missing from public store drops.');
if (!bottleNames.has('Lost Lantern United States of Bourbon: 1776 Edition')) fail('Illinois canary bottle Lost Lantern United States of Bourbon: 1776 Edition is missing from public store drops.');
if (unsafeFourRoses) fail(`Illinois unsafe promotion detected: ${unsafeFourRoses.rawName} -> ${unsafeFourRoses.canonicalName || unsafeFourRoses.bottleName}.`);
if (unsafeHenry) fail(`Illinois unsafe promotion detected: ${unsafeHenry.rawName} -> ${unsafeHenry.canonicalName || unsafeHenry.bottleName}.`);
if (!coverage) fail('stats.stateCoverage.states should include Illinois.');
if (coverage && !/retailer|verify/i.test(String(coverage.customerSummary || ''))) fail('Illinois customer summary should preserve retailer/verify caveats.');

if (failures.length) {
  console.error('Illinois hardening verification failed:');
  for (const message of failures) console.error(`- ${message}`);
  console.error(`Context: ${storeSignals.length} state signals, ${storeDrops.length} public store drops, ${alertableDrops.length} alertable drops, ${illinoisAlerts.length} alerts, ${bottleNames.size} bottles.`);
  process.exit(1);
}

console.log(`Illinois hardening verification passed: ${storeSignals.length} store signals, ${storeDrops.length} public store drops (${alertableDrops.length} alertable), ${illinoisAlerts.length} alerts, ${bottleNames.size} bottles.`);
