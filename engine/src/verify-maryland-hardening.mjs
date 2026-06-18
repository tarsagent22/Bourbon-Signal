import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const fail = (message) => failures.push(message);
const readJson = (relPath) => JSON.parse(readFileSync(path.join(root, relPath), 'utf8'));
const text = (...values) => values.filter((value) => value != null).join(' ');

function hasAggregateCaveat(row) {
  const hay = text(row.inventorySemantics, row.inventoryCaveat, row.evidence, row.raw?.precisionCaveat, row.raw?.sourceCaveat).toLowerCase();
  return /aggregate|countywide|county inventory|montgomery county/.test(hay)
    && /not exact per-store|not a per-store|not live shelf|not exact store|not live inventory/.test(hay);
}

function isFalsePromotion(row) {
  const raw = String(row.rawName || row.raw_name || '').toLowerCase();
  const canonical = String(row.canonicalName || row.bottleName || row.canonical_name || row.bottle || '').toLowerCase();
  return (/four roses/.test(raw) && /\b(single barrel|small batch|bourbon)\b/.test(raw) && /limited edition/.test(canonical))
    || (/elijah craig/.test(raw) && /small batch/.test(raw) && /barrel proof/.test(canonical))
    || (/woodford reserve/.test(raw) && !/batch proof/.test(raw) && /batch proof/.test(canonical))
    || (/buffalo trace/.test(raw) && /cream/.test(raw) && /^buffalo trace bourbon$/.test(canonical))
    || (/weller/.test(raw) && /reserve/.test(raw) && !/single barrel/.test(raw) && /single barrel/.test(canonical))
    || (/henry mckenna/.test(raw) && !/single barrel/.test(raw) && /single barrel/.test(canonical));
}

const state = readJson('out/states/MD-MONTGOMERY.json');
const snapshot = readJson('out/current-snapshot.json');
const stats = readJson('out/site/stats.json');
const drops = readJson('out/site/drops.json');
const alerts = readJson('out/site/alerts.json');

const stateSignals = state.signals || [];
const currentSignals = (snapshot.signals || []).filter((signal) => signal.state === 'MD-MONTGOMERY');
const aggregateSignals = currentSignals.filter((signal) => signal.eventType === 'county_inventory_aggregate');
const mdDrops = (drops.drops || []).filter((drop) => drop.state === 'MD-MONTGOMERY');
const mdAlerts = (alerts.alerts || []).filter((alert) => alert.state === 'MD-MONTGOMERY');
const mdCoverage = stats.stateCoverage?.states?.find((row) => row.state === 'MD-MONTGOMERY');

if (state.status !== 'useful') fail(`Maryland/Montgomery artifact should be useful, got ${state.status}.`);
if (aggregateSignals.length < 50) fail(`Expected at least 50 Montgomery County aggregate inventory signals, got ${aggregateSignals.length}.`);
if (mdDrops.length < 50) fail(`Expected at least 50 public Montgomery County aggregate drops, got ${mdDrops.length}.`);
if (mdAlerts.length !== 0) fail(`Montgomery aggregate coverage should not create delivered alert candidates yet; got ${mdAlerts.length}.`);

if (!mdCoverage) fail('stats.stateCoverage.states should include MD-MONTGOMERY.');
else {
  if (mdCoverage.label !== 'Maryland') fail(`Customer-facing state label should be Maryland, got ${mdCoverage.label}.`);
  if (mdCoverage.customerAreaLabel !== 'Montgomery County') fail(`Maryland area label should be Montgomery County, got ${mdCoverage.customerAreaLabel}.`);
  if (!Array.isArray(mdCoverage.areaOptions) || !mdCoverage.areaOptions.includes('Montgomery County')) fail('Maryland area options should include Montgomery County.');
  if (mdCoverage.coverageTier !== 'aggregate_inventory_watch') fail(`Maryland coverage tier should be aggregate_inventory_watch, got ${mdCoverage.coverageTier}.`);
  if (mdCoverage.refinementLevel !== 'area') fail(`Maryland refinement should remain area-level, got ${mdCoverage.refinementLevel}.`);
  const summary = String(mdCoverage.customerSummary || '').toLowerCase();
  if (!/montgomery county/.test(summary) || !/aggregate|not exact|drilldown|per-store/.test(summary)) fail('Maryland customer summary should clearly scope coverage to Montgomery County aggregate data.');
}

for (const signal of aggregateSignals) {
  if (signal.locationPrecision !== 'store_aggregate') fail(`Montgomery signal ${signal.key || signal.id} should stay store_aggregate, got ${signal.locationPrecision}.`);
  if (signal.county !== 'Montgomery') fail(`Montgomery signal ${signal.key || signal.id} should preserve county=Montgomery.`);
  if (Number(signal.quantity || 0) <= 0) fail(`Montgomery aggregate signal ${signal.key || signal.id} should carry positive county aggregate quantity.`);
  if (signal.canAlertAsInventory === true || signal.canAlertAsWatch === true) fail(`Montgomery aggregate signal ${signal.key || signal.id} should not be alertable until per-store drilldown exists.`);
  if (!hasAggregateCaveat(signal)) fail(`Montgomery aggregate signal ${signal.key || signal.id} is missing aggregate/not-per-store caveat copy.`);
}

for (const drop of mdDrops) {
  if (drop.type !== 'county_inventory_aggregate') fail(`Maryland public drop ${drop.id} should be county_inventory_aggregate, got ${drop.type}.`);
  if (drop.locationPrecision !== 'store_aggregate') fail(`Maryland public drop ${drop.id} should stay store_aggregate, got ${drop.locationPrecision}.`);
  if (drop.county !== 'Montgomery') fail(`Maryland public drop ${drop.id} should preserve county=Montgomery.`);
  if (drop.dataLane !== 'informational' || drop.canAlertAsInventory === true || drop.canAlertAsWatch === true) fail(`Maryland public drop ${drop.id} should be informational aggregate data, not alertable inventory/watch.`);
  if (Number(drop.quantity || 0) <= 0) fail(`Maryland public drop ${drop.id} should carry positive aggregate quantity.`);
  if (!hasAggregateCaveat(drop)) fail(`Maryland public drop ${drop.id} is missing aggregate/not-per-store caveat copy.`);
}

const falsePromotions = [...stateSignals, ...currentSignals, ...mdDrops].filter(isFalsePromotion);
if (falsePromotions.length) {
  fail(`Maryland false-positive bottle promotion detected: ${falsePromotions.slice(0, 8).map((row) => `${row.rawName || row.raw_name} -> ${row.canonicalName || row.bottleName || row.bottle}`).join('; ')}`);
}

if (failures.length) {
  console.error('Maryland hardening verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Maryland hardening verification passed: ${aggregateSignals.length} current Montgomery aggregate signals, ${mdDrops.length} public aggregate drops, ${mdAlerts.length} alert candidates.`);
