import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const fail = (message) => failures.push(message);
const readJson = (relPath) => JSON.parse(readFileSync(path.join(root, relPath), 'utf8'));
const text = (...values) => values.filter((value) => value != null).join(' ');

function hasAggregateCaveat(row) {
  const hay = text(row.inventorySemantics, row.inventoryCaveat, row.evidence, row.raw?.sourceCaveat).toLowerCase();
  return /aggregate|warehouse|statewide/.test(hay)
    && /not exact|not a per-store|not per-store|not live shelf|not live inventory|not exact store/.test(hay);
}

function isFalsePromotion(row) {
  const raw = String(row.rawName || row.raw_name || '').toLowerCase();
  const canonical = String(row.canonicalName || row.bottleName || row.canonical_name || row.bottle || '').toLowerCase();
  return (/four roses/.test(raw) && /\b(single barrel|small batch|bourbon)\b/.test(raw) && /limited edition/.test(canonical))
    || (/elijah craig/.test(raw) && /small batch/.test(raw) && /barrel proof/.test(canonical))
    || (/woodford reserve/.test(raw) && !/batch proof/.test(raw) && /batch proof/.test(canonical))
    || (/buffalo trace/.test(raw) && /cream/.test(raw) && /^buffalo trace bourbon$/.test(canonical))
    || (/bakers? bourbon/.test(raw) && !/13|thirteen/.test(raw) && /baker'?s 13 year/.test(canonical))
    || (/weller/.test(raw) && /reserve/.test(raw) && !/single barrel/.test(raw) && /single barrel/.test(canonical));
}

const state = readJson('out/states/UT.json');
const snapshot = readJson('out/current-snapshot.json');
const stats = readJson('out/site/stats.json');
const drops = readJson('out/site/drops.json');
const alerts = readJson('out/site/alerts.json');

const stateSignals = state.signals || [];
const currentSignals = (snapshot.signals || []).filter((signal) => signal.state === 'UT');
const aggregateSignals = currentSignals.filter((signal) => signal.eventType === 'board_inventory_aggregate');
const positiveAggregateSignals = aggregateSignals.filter((signal) => Number(signal.quantity || signal.storeQty || signal.warehouseQty || 0) > 0);
const utDrops = (drops.drops || []).filter((drop) => drop.state === 'UT');
const utAlerts = (alerts.alerts || []).filter((alert) => alert.state === 'UT');
const utCoverage = stats.stateCoverage?.states?.find((row) => row.state === 'UT');

if (state.status !== 'useful') fail(`Utah artifact should be useful, got ${state.status}.`);
if (aggregateSignals.length < 5) fail(`Expected at least 5 Utah DABS aggregate signals, got ${aggregateSignals.length}.`);
if (positiveAggregateSignals.length < 5) fail(`Expected at least 5 positive Utah DABS aggregate signals, got ${positiveAggregateSignals.length}.`);
if (utDrops.length < 5) fail(`Expected at least 5 public Utah aggregate drops, got ${utDrops.length}.`);
if (utAlerts.length !== 0) fail(`Utah aggregate coverage should not create delivered alert candidates yet; got ${utAlerts.length}.`);

if (!utCoverage) fail('stats.stateCoverage.states should include Utah.');
else {
  if (utCoverage.label !== 'Utah') fail(`Utah customer label should be Utah, got ${utCoverage.label}.`);
  if (utCoverage.coverageTier !== 'aggregate_inventory_watch') fail(`Utah coverage tier should be aggregate_inventory_watch, got ${utCoverage.coverageTier}.`);
  if (utCoverage.refinementLevel !== 'statewide') fail(`Utah refinement should remain statewide, got ${utCoverage.refinementLevel}.`);
  const summary = String(utCoverage.customerSummary || '').toLowerCase();
  if (!/aggregate|warehouse|storeqty|not exact|not exact per-store|not exact store|not live/.test(summary)) fail('Utah customer summary should describe aggregate/not-exact-store semantics.');
}

for (const signal of positiveAggregateSignals) {
  const aggregateQty = Number(signal.quantity || signal.storeQty || signal.warehouseQty || 0) || 0;
  if (signal.locationPrecision !== 'board_warehouse') fail(`Utah signal ${signal.key || signal.id} should stay board_warehouse, got ${signal.locationPrecision}.`);
  if (aggregateQty <= 0) fail(`Utah aggregate signal ${signal.key || signal.id} should carry positive store/warehouse aggregate quantity.`);
  if (signal.canAlertAsInventory === true || signal.canAlertAsWatch === true) fail(`Utah aggregate signal ${signal.key || signal.id} should not be alertable until exact store drilldown exists.`);
  if (!hasAggregateCaveat(signal)) fail(`Utah aggregate signal ${signal.key || signal.id} is missing aggregate/not-exact-store caveat copy.`);
}

for (const drop of utDrops) {
  const aggregateQty = Number(drop.quantity || drop.storeQty || drop.warehouseQty || 0) || 0;
  if (drop.type !== 'board_inventory_aggregate') fail(`Utah public drop ${drop.id} should be board_inventory_aggregate, got ${drop.type}.`);
  if (drop.locationPrecision !== 'board_warehouse') fail(`Utah public drop ${drop.id} should stay board_warehouse, got ${drop.locationPrecision}.`);
  if (drop.dataLane !== 'informational' || drop.canAlertAsInventory === true || drop.canAlertAsWatch === true) fail(`Utah public drop ${drop.id} should be informational aggregate data, not alertable inventory/watch.`);
  if (aggregateQty <= 0) fail(`Utah public drop ${drop.id} should carry positive aggregate quantity.`);
  if (!hasAggregateCaveat(drop)) fail(`Utah public drop ${drop.id} is missing aggregate/not-exact-store caveat copy.`);
}

const falsePromotions = [...stateSignals, ...currentSignals, ...utDrops].filter(isFalsePromotion);
if (falsePromotions.length) {
  fail(`Utah false-positive bottle promotion detected: ${falsePromotions.slice(0, 8).map((row) => `${row.rawName || row.raw_name} -> ${row.canonicalName || row.bottleName || row.bottle}`).join('; ')}`);
}

if (failures.length) {
  console.error('Utah hardening verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Utah hardening verification passed: ${aggregateSignals.length} current DABS aggregate signals (${positiveAggregateSignals.length} positive), ${utDrops.length} public aggregate drops, ${utAlerts.length} alert candidates.`);
