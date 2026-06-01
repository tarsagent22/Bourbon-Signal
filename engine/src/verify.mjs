import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { STATE_SOURCES } from './state-sources.mjs';

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function orUnavailable(out) {
  const state = await readJson(path.join(out, 'states', 'OR.json')).catch(() => null);
  const browser = await readJson(path.join(out, 'browser', 'OR-product-availability.json')).catch(() => null);
  const roadblocks = state?.roadblocks || [];
  const hasOfficialOutage = roadblocks.some((r) => /Oregon Liquor Search/i.test(String(r.source || r.url || '')) && /abort|timeout|502|proxy|unavailable|no store rows/i.test(String(r.error || r.status || '')));
  const browserEmpty = browser && Number(browser.storeRowCount || 0) === 0;
  return hasOfficialOutage && browserEmpty;
}

async function main() {
  const out = path.resolve('out');
  const required = ['bourbon-bible.json', 'bourbon-bible-report.md', 'summary.json', 'signals.json', 'readable.md', 'roadblocks.md', 'rare-signals.json', 'rare-signals.md', 'current-snapshot.json', 'diff.json', 'diff.md', 'alert-candidates.json', 'alert-candidates.md', 'confidence-policy.json'];
  const siteRequired = ['manifest.json', 'stats.json', 'bottles.json', 'stores.json', 'locations.json', 'drops.json', 'alerts.json', 'nc-intelligence.json'];
  const missing = [];
  for (const file of required) if (!(await exists(path.join(out, file)))) missing.push(file);
  for (const file of siteRequired) if (!(await exists(path.join(out, 'site', file)))) missing.push(`site/${file}`);
  if (missing.length) throw new Error(`Missing output files: ${missing.join(', ')}`);

  const bible = await readJson(path.join(out, 'bourbon-bible.json'));
  const summary = await readJson(path.join(out, 'summary.json'));
  const signals = await readJson(path.join(out, 'signals.json'));
  const rare = await readJson(path.join(out, 'rare-signals.json'));
  const operational = await readJson(path.join(out, 'current-snapshot.json'));
  const alerts = await readJson(path.join(out, 'alert-candidates.json'));
  const siteStats = await readJson(path.join(out, 'site', 'stats.json'));
  const siteBottles = await readJson(path.join(out, 'site', 'bottles.json'));
  const siteLocations = await readJson(path.join(out, 'site', 'locations.json'));
  const siteDrops = await readJson(path.join(out, 'site', 'drops.json'));
  const ncIntelligence = await readJson(path.join(out, 'site', 'nc-intelligence.json'));
  const activeStateIds = new Set(STATE_SOURCES.map((s) => s.id));

  const expectedStates = STATE_SOURCES.map((s) => s.id).sort();
  const actualStates = summary.states.map((s) => s.state).sort();
  const missingStates = expectedStates.filter((s) => !actualStates.includes(s));
  if (missingStates.length) throw new Error(`Missing states: ${missingStates.join(', ')}`);
  if (summary.stateCount !== STATE_SOURCES.length) throw new Error(`Expected ${STATE_SOURCES.length} states, got ${summary.stateCount}`);
  if (!bible.count || bible.count < 90) throw new Error(`Bourbon bible too small: ${bible.count}`);
  if (!Array.isArray(signals.signals)) throw new Error('signals.json has invalid shape');
  if (!Array.isArray(operational.signals)) throw new Error('current-snapshot.json has invalid shape');
  if (!Array.isArray(alerts.candidates)) throw new Error('alert-candidates.json has invalid shape');
  if (siteStats.contractVersion !== 'bourbon-signal-site-v0.1') throw new Error(`Unexpected site contract version: ${siteStats.contractVersion}`);
  if (!Array.isArray(siteBottles.bottles) || siteBottles.bottles.length < 50) throw new Error('site/bottles.json has invalid or too-small shape');
  if (!Array.isArray(siteLocations.locations) || siteLocations.locations.length < 800) throw new Error('site/locations.json has invalid or too-small shape');
  if (!siteLocations.locations.some((location) => location.searchable && !location.hasSignals)) throw new Error('site/locations.json should include preloaded searchable no-signal locations');
  if (!Array.isArray(siteDrops.drops)) throw new Error('site/drops.json has invalid shape');
  if (siteStats.ncBoardIntelligence?.boardCount < 170) throw new Error('NC board intelligence coverage is missing or too small in site stats');
  if (siteStats.ncBoardIntelligence?.boardsWithTrackedShipments < 100) throw new Error('NC tracked shipment board coverage is below threshold');
  if (siteStats.ncBoardIntelligence?.boardsWithInventoryPages < 5) throw new Error('NC inventory/release page coverage is below threshold');
  if (!/official\/public online sources only/i.test(String(siteStats.ncBoardIntelligence?.sourcePolicy || ''))) throw new Error('NC source policy caveat missing from stats');
  if (ncIntelligence.contractVersion !== 'bourbon-signal-site-v0.1') throw new Error(`Unexpected NC intelligence contract version: ${ncIntelligence.contractVersion}`);
  if (ncIntelligence.coverage?.boardCount < 170) throw new Error('NC intelligence board directory coverage is below threshold');
  if (ncIntelligence.signalCounts?.nc_board_shipment_snapshot < 500) throw new Error('NC board shipment signal count is below threshold');
  if (ncIntelligence.signalCounts?.nc_statewide_warehouse_stock < 1) throw new Error('NC warehouse positive-stock radar is missing');
  if ((ncIntelligence.roadblockCount || 0) > 5) throw new Error(`NC collector has too many current roadblocks: ${ncIntelligence.roadblockCount}`);
  for (const state of summary.states) {
    const stateFile = path.join(out, 'states', `${state.state}.json`);
    if (!(await exists(stateFile))) throw new Error(`Missing state output: ${state.state}`);
  }

  const ohlqSignals = operational.signals.filter((s) => s.state === 'OH' && /^browser_assisted_store_inventory_/.test(String(s.eventType || '')));
  if (!ohlqSignals.length) throw new Error('Expected decoded OHLQ browser-assisted store inventory signals');
  const invalidOhlqStatus = ohlqSignals.find((s) => !['limited_supply', 'in_stock'].includes(s.availabilityStatus));
  if (invalidOhlqStatus) throw new Error(`OHLQ emitted a non-positive availability signal: ${invalidOhlqStatus.availabilityStatus || 'missing'}`);

  const inventoryNotStore = operational.signals.find((s) => s.canAlertAsInventory && s.locationPrecision !== 'store_level');
  if (inventoryNotStore) throw new Error(`Inventory-alertable signal is not store_level: ${inventoryNotStore.state} ${inventoryNotStore.canonicalName}`);
  const unsafeNcAggregate = operational.signals.find((s) => s.state === 'NC' && s.canAlertAsInventory && s.locationPrecision !== 'store_level');
  if (unsafeNcAggregate) throw new Error(`NC aggregate signal should not be inventory-alertable: ${unsafeNcAggregate.eventType} ${unsafeNcAggregate.canonicalName}`);
  const vaSignals = operational.signals.filter((s) => s.state === 'VA');
  const vaStoreSignals = vaSignals.filter((s) => s.locationPrecision === 'store_level');
  const vaInventorySignals = vaSignals.filter((s) => s.canAlertAsInventory);
  const vaBad1792 = vaSignals.find((s) => /1792\s+Small\s+Batch/i.test(String(s.rawName || '')) && /Full\s+Proof/i.test(String(s.canonicalName || '')));
  if (vaSignals.length < 700) throw new Error(`VA signal count below threshold: ${vaSignals.length}`);
  if (vaStoreSignals.length < 700) throw new Error(`VA store-level signal count below threshold: ${vaStoreSignals.length}`);
  if (vaInventorySignals.length < 250) throw new Error(`VA inventory-alertable signal count below threshold: ${vaInventorySignals.length}`);
  if (vaBad1792) throw new Error(`VA 1792 Small Batch misidentified as ${vaBad1792.canonicalName}`);
  if (activeStateIds.has('OR')) {
    const orRows = operational.signals.filter((s) => s.state === 'OR' && s.eventType === 'store_inventory_result');
    const orSourceUnavailable = await orUnavailable(out);
    if (!orRows.length && !orSourceUnavailable) throw new Error('Expected Oregon store_inventory_result rows');
    if (!orRows.length && orSourceUnavailable) console.log('Oregon store_inventory_result rows unavailable: Oregon Liquor Search/browser collector is currently failing; exact OR inventory is not being published from stale data.');
    const orMissingCaveat = orRows.find((s) => !/updated daily|verify/i.test(`${s.evidence || ''} ${s.inventorySemantics || ''}`));
    if (orMissingCaveat) throw new Error('Oregon inventory row is missing daily-update/verify caveat');
  }

  const rareStates = Array.isArray(rare.states) ? rare.states : [];
  if (rareStates.length !== summary.stateCount) throw new Error(`Rare report state count mismatch: ${rareStates.length}`);
  const rareSignalTargets = new Set(STATE_SOURCES.filter((s) => s.rareSignalTarget !== false).map((s) => s.id));
  const rareVerified = rareStates.filter((s) => s.status === 'verified_3_rare_signals').length;
  const rareTargetVerified = rareStates.filter((s) => rareSignalTargets.has(s.state) && s.status === 'verified_3_rare_signals').length;
  if (rareTargetVerified !== rareSignalTargets.size) throw new Error(`Rare target coverage mismatch: ${rareTargetVerified}/${rareSignalTargets.size}`);
  console.log(`Verified ${summary.stateCount} states, ${bible.count} bible records, ${signals.signals.length} normalized signals, ${operational.signals.length} operational signals, ${alerts.candidates.length} alert candidates, ${siteBottles.bottles.length} site bottles, ${siteLocations.locations.length} site locations, ${siteDrops.drops.length} site drops, ${rareVerified}/${summary.stateCount} states with 3 rare signals (${rareTargetVerified}/${rareSignalTargets.size} target states).`);
  const weak = summary.states.filter((s) => s.status !== 'useful');
  if (weak.length) console.log(`States needing deeper parser/browser work: ${weak.map((s) => `${s.state}:${s.status}`).join(', ')}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
