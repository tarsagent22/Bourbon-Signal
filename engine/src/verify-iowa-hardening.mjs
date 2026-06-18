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

function text(...values) {
  return values.filter((value) => value != null).join(' ');
}

function hasDeliveryCaveat(row) {
  const hay = text(row.inventorySemantics, row.inventoryCaveat, row.evidence, row.reason, row.raw?.sourceCaveat).toLowerCase();
  return /delivery|delivered|allocation|allocated/.test(hay) && /not live shelf inventory|not current shelf stock|not live inventory|verify/.test(hay);
}

function isPositiveNumber(value) {
  return Number(value || 0) > 0;
}

function isFalsePromotion(row) {
  const raw = String(row.rawName || row.raw_name || '').toLowerCase();
  const canonical = String(row.canonicalName || row.bottleName || row.canonical_name || row.bottle || '').toLowerCase();
  return (/four roses/.test(raw) && /\b(single barrel|small batch|bourbon)\b/.test(raw) && /limited edition/.test(canonical))
    || (/elijah craig/.test(raw) && /small batch/.test(raw) && /barrel proof/.test(canonical))
    || (/woodford reserve/.test(raw) && !/batch proof/.test(raw) && /batch proof/.test(canonical))
    || (/weller/.test(raw) && /reserve/.test(raw) && !/single barrel/.test(raw) && /single barrel/.test(canonical))
    || (/henry mckenna/.test(raw) && !/single barrel/.test(raw) && /single barrel/.test(canonical));
}

const state = readJson('out/states/IA.json');
const stats = readJson('out/site/stats.json');
const drops = readJson('out/site/drops.json');
const alerts = readJson('out/site/alerts.json');
const stores = readJson('out/site/stores.json');

const iaSignals = state.signals || [];
const iaDeliverySignals = iaSignals.filter((signal) => signal.eventType === 'store_delivery_snapshot');
const iaAllocationSignals = iaSignals.filter((signal) => signal.eventType === 'store_allocation_snapshot');
const iaStoreSignals = iaSignals.filter((signal) => signal.eventType === 'store_delivery_snapshot' || signal.eventType === 'store_allocation_snapshot');
const iaDrops = (drops.drops || []).filter((drop) => drop.state === 'IA');
const iaDeliveryDrops = iaDrops.filter((drop) => drop.type === 'store_delivery_snapshot');
const iaAllocationDrops = iaDrops.filter((drop) => drop.type === 'store_allocation_snapshot');
const iaAlerts = (alerts.alerts || []).filter((alert) => alert.state === 'IA');
const iaStores = (stores.stores || []).filter((store) => store.state === 'IA');
const iaCoverage = stats.stateCoverage?.states?.find((row) => row.state === 'IA');

if (state.status !== 'useful') fail(`Iowa state artifact should be useful, got ${state.status}.`);
if (iaDeliverySignals.length < 100) fail(`Expected at least 100 Iowa store delivery signals, got ${iaDeliverySignals.length}.`);
if (iaDeliveryDrops.length < 100) fail(`Expected at least 100 public Iowa store delivery drops, got ${iaDeliveryDrops.length}.`);
if (iaAllocationSignals.length > 0 && iaAllocationDrops.length === 0) fail(`Iowa allocation signals exist (${iaAllocationSignals.length}) but no allocation drops are customer-visible.`);
if (iaStores.length < 100) fail(`Expected at least 100 Iowa stores in the site store export, got ${iaStores.length}.`);

if (!iaCoverage) fail('stats.stateCoverage.states should include Iowa.');
else {
  if (iaCoverage.label !== 'Iowa') fail(`Iowa customer label should be Iowa, got ${iaCoverage.label}.`);
  if (iaCoverage.coverageTier !== 'store_delivery_leads') fail(`Iowa should be classified as store_delivery_leads, got ${iaCoverage.coverageTier}.`);
  if (iaCoverage.refinementLevel !== 'city') fail(`Iowa refinement should be city, got ${iaCoverage.refinementLevel}.`);
  const summary = String(iaCoverage.customerSummary || '').toLowerCase();
  if (!/delivery|delivered/.test(summary) || !/not live shelf inventory|not live inventory|not current shelf stock|lead/.test(summary)) {
    fail('Iowa customer summary should describe delivery leads and not-live-shelf-inventory caveats.');
  }
}

for (const signal of iaStoreSignals) {
  if (signal.locationPrecision !== 'store_level') fail(`Iowa signal ${signal.id} should remain store-level, got ${signal.locationPrecision}.`);
  if (!signal.storeId || !signal.storeName || !signal.storeAddress || !signal.city || !signal.zip) fail(`Iowa signal ${signal.id} is missing durable store/city/zip identity.`);
  if (!isPositiveNumber(signal.quantity)) fail(`Iowa signal ${signal.id} should preserve positive delivered/allocation quantity.`);
  if (signal.canAlertAsInventory === true) fail(`Iowa signal ${signal.id} must not be inventory-alertable.`);
  if (signal.canAlertAsWatch !== true) fail(`Iowa signal ${signal.id} should remain watch-alertable as a delivery/allocation lead.`);
  if (!hasDeliveryCaveat(signal)) fail(`Iowa signal ${signal.id} is missing delivery/allocation not-live-inventory caveat copy.`);
}

for (const drop of iaDrops) {
  if (!['store_delivery_snapshot', 'store_allocation_snapshot'].includes(drop.type)) fail(`Iowa drop ${drop.id} should be a store delivery/allocation lead, got ${drop.type}.`);
  if (drop.locationPrecision !== 'store_level') fail(`Iowa drop ${drop.id} should remain store-level, got ${drop.locationPrecision}.`);
  if (!drop.storeId || !drop.storeName || !drop.city) fail(`Iowa drop ${drop.id} is missing store/city identity fields.`);
  if (drop.canAlertAsInventory === true || drop.dataLane === 'actionable_inventory') fail(`Iowa drop ${drop.id} must not be presented as actionable live inventory.`);
  if (drop.canAlertAsWatch !== true || drop.dataLane !== 'actionable_watch') fail(`Iowa drop ${drop.id} should remain an actionable watch lead.`);
  if (!hasDeliveryCaveat(drop)) fail(`Iowa drop ${drop.id} is missing delivery/allocation not-live-inventory caveat copy.`);
}

for (const alert of iaAlerts) {
  if (alert.action === 'inventory_alert_candidate' || alert.deliveryChannel === 'onsite_candidate') fail(`Iowa alert ${alert.id} must not use the live inventory alert channel.`);
  if (!['store_delivery_snapshot', 'store_allocation_snapshot'].includes(alert.eventType)) fail(`Iowa alert ${alert.id} should only come from store-level delivery/allocation leads, got ${alert.eventType}.`);
  if (alert.locationPrecision !== 'store_level') fail(`Iowa alert ${alert.id} should remain store-level, got ${alert.locationPrecision}.`);
  if (!hasDeliveryCaveat(alert)) fail(`Iowa alert ${alert.id} is missing delivery/allocation not-live-inventory caveat copy.`);
}

const falsePromotions = [...iaSignals, ...iaDrops, ...iaAlerts].filter(isFalsePromotion);
if (falsePromotions.length) {
  fail(`Iowa false-positive bottle promotion detected: ${falsePromotions.slice(0, 8).map((row) => `${row.rawName || row.raw_name} -> ${row.canonicalName || row.bottleName || row.bottle}`).join('; ')}`);
}

const storeIds = new Set(iaStores.map((store) => store.id).filter(Boolean));
const dropsMissingStoreExport = iaDrops.filter((drop) => drop.storeId && !storeIds.has(drop.storeId));
if (dropsMissingStoreExport.length) fail(`Iowa drops should map to site store export IDs; missing ${dropsMissingStoreExport.length} store IDs.`);

if (failures.length) {
  console.error('Iowa hardening verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Iowa hardening verification passed: ${iaDeliverySignals.length} delivery signals, ${iaAllocationSignals.length} allocation signals, ${iaDeliveryDrops.length} delivery drops, ${iaAllocationDrops.length} allocation drops, ${iaAlerts.length} alert candidates, ${iaStores.length} stores.`);
