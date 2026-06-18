import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function readJson(relPath) {
  return JSON.parse(readFileSync(path.join(root, relPath), 'utf8'));
}

function includesAny(value, patterns) {
  const text = String(value || '');
  return patterns.some((pattern) => pattern.test(text));
}

const state = readJson('out/states/ID.json');
const stats = readJson('out/site/stats.json');
const drops = readJson('out/site/drops.json');
const alerts = readJson('out/site/alerts.json');
const stores = readJson('out/site/stores.json');

const idSignals = state.signals || [];
const storeAvailabilitySignals = idSignals.filter((signal) => signal.eventType === 'store_inventory_result' && signal.locationPrecision === 'store_level');
const idDrops = (drops.drops || []).filter((drop) => drop.state === 'ID');
const idStoreDrops = idDrops.filter((drop) => drop.type === 'store_inventory_result' && drop.locationPrecision === 'store_level');
const idAlerts = (alerts.alerts || []).filter((alert) => alert.state === 'ID');
const idStores = (stores.stores || []).filter((store) => store.state === 'ID');
const idCoverage = stats.stateCoverage?.states?.find((row) => row.state === 'ID');

if (state.status !== 'useful') fail(`Idaho state artifact should be useful, got ${state.status}.`);
if (storeAvailabilitySignals.length < 50) fail(`Expected at least 50 Idaho store availability signals, got ${storeAvailabilitySignals.length}.`);
if (idStoreDrops.length < 50) fail(`Expected at least 50 customer-visible Idaho store availability drops, got ${idStoreDrops.length}.`);
if (idAlerts.length < 20) fail(`Expected at least 20 Idaho alert candidates for matched high-value store availability rows, got ${idAlerts.length}.`);
if (idStores.length < 20) fail(`Expected at least 20 Idaho stores in the site store export, got ${idStores.length}.`);

if (!idCoverage) fail('stats.stateCoverage.states should include Idaho.');
else {
  if (idCoverage.label !== 'Idaho') fail(`Idaho customer label should be Idaho, got ${idCoverage.label}.`);
  if (idCoverage.coverageTier !== 'store_availability_status') fail(`Idaho should be classified as store_availability_status, got ${idCoverage.coverageTier}.`);
  if (!['city', 'city_store', 'store'].includes(idCoverage.refinementLevel)) fail(`Idaho refinement should expose city/store value, got ${idCoverage.refinementLevel}.`);
  if (!/as-of|as of|verify/i.test(String(idCoverage.customerSummary || ''))) fail('Idaho customer summary should mention as-of/verify caveats.');
}

for (const signal of storeAvailabilitySignals) {
  const eventAt = Date.parse(signal.sourceEventAt || '');
  if (!Number.isFinite(eventAt)) fail(`Idaho signal ${signal.id} is missing a parsed sourceEventAt from the as-of date.`);
  if (Number.isFinite(eventAt) && eventAt > Date.now() + 5 * 60 * 1000) fail(`Idaho signal ${signal.id} has future sourceEventAt ${signal.sourceEventAt}.`);
  if (!/as of/i.test(String(signal.availabilityLabel || signal.raw?.row?.asOfText || ''))) fail(`Idaho signal ${signal.id} should preserve source as-of freshness text.`);
}

for (const drop of idStoreDrops) {
  const statusText = `${drop.availabilityStatus || ''} ${drop.availabilityLabel || ''}`;
  if (!/in_stock|available/i.test(statusText)) fail(`Idaho drop ${drop.id} is missing positive availability status/label.`);
  if (!drop.storeId || !drop.storeName || !drop.storeAddress || !drop.city) fail(`Idaho drop ${drop.id} is missing durable store identity fields.`);
  if (!/verify/i.test(String(drop.inventoryCaveat || drop.inventorySemantics || drop.evidence || ''))) fail(`Idaho drop ${drop.id} should carry a verify-before-driving caveat.`);
  if (!/no bottle count|not.*bottle count|status/i.test(String(drop.inventorySemantics || drop.evidence || ''))) fail(`Idaho drop ${drop.id} should say Idaho exposes status/as-of data, not bottle counts.`);
}

for (const alert of idAlerts) {
  if (alert.action !== 'inventory_alert_candidate') fail(`Idaho alert ${alert.id} should use inventory_alert_candidate action, got ${alert.action}.`);
  if (alert.deliveryChannel !== 'onsite_candidate') fail(`Idaho alert ${alert.id} should be an on-site inventory candidate, got ${alert.deliveryChannel}.`);
  if (alert.locationPrecision !== 'store_level') fail(`Idaho alert ${alert.id} should remain store-level, got ${alert.locationPrecision}.`);
  if (!/in_stock|available/i.test(`${alert.availabilityStatus || ''} ${alert.availabilityLabel || ''}`)) fail(`Idaho alert ${alert.id} is missing positive availability semantics.`);
  if (Number(alert.quantity || 0) > 0) fail(`Idaho alert ${alert.id} should not invent bottle counts; got quantity ${alert.quantity}.`);
  if (!/verify/i.test(`${alert.inventorySemantics || ''} ${alert.evidence || ''}`)) fail(`Idaho alert ${alert.id} should carry verify-before-driving caveat copy.`);
  if (!/no bottle count|not.*bottle count|status/i.test(`${alert.inventorySemantics || ''} ${alert.evidence || ''}`)) fail(`Idaho alert ${alert.id} should describe status/as-of availability rather than bottle-count inventory.`);
}

const falsePromotionRows = [...idDrops, ...idAlerts].filter((drop) => {
  const raw = String(drop.rawName || '');
  const canonical = String(drop.canonicalName || drop.bottleName || '');
  return (/four roses single barrel/i.test(raw) && /limited edition small batch/i.test(canonical))
    || (/e\.?h\.?\s*taylor.*single barrel/i.test(raw) && /small batch/i.test(canonical));
});
if (falsePromotionRows.length) {
  fail(`Idaho false-positive bottle promotion detected: ${falsePromotionRows.slice(0, 5).map((drop) => `${drop.rawName} -> ${drop.canonicalName || drop.bottleName}`).join('; ')}`);
}

const encodedCities = [...idStoreDrops, ...idStores].filter((row) => includesAny(row.city || row.locationName || row.name, [/&#\d+;/, /&[a-z]+;/i]));
if (encodedCities.length) fail(`Idaho city/store labels should be decoded; found ${encodedCities.slice(0, 5).map((row) => row.city || row.locationName || row.name).join(', ')}.`);

if (failures.length) {
  console.error('Idaho hardening verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Idaho hardening verification passed: ${storeAvailabilitySignals.length} state availability signals, ${idStoreDrops.length} public store drops, ${idAlerts.length} alert candidates, ${idStores.length} stores.`);
