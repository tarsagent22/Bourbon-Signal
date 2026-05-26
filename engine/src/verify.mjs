import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { STATE_SOURCES } from './state-sources.mjs';

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function main() {
  const out = path.resolve('out');
  const required = ['bourbon-bible.json', 'bourbon-bible-report.md', 'summary.json', 'signals.json', 'readable.md', 'roadblocks.md', 'rare-signals.json', 'rare-signals.md', 'current-snapshot.json', 'diff.json', 'diff.md', 'alert-candidates.json', 'alert-candidates.md', 'confidence-policy.json'];
  const siteRequired = ['manifest.json', 'stats.json', 'bottles.json', 'stores.json', 'drops.json', 'alerts.json'];
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
  const siteDrops = await readJson(path.join(out, 'site', 'drops.json'));

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
  if (!Array.isArray(siteDrops.drops)) throw new Error('site/drops.json has invalid shape');
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
  const orRows = operational.signals.filter((s) => s.state === 'OR' && s.eventType === 'store_inventory_result');
  if (!orRows.length) throw new Error('Expected Oregon store_inventory_result rows');
  const orMissingCaveat = orRows.find((s) => !/updated daily|verify/i.test(`${s.evidence || ''} ${s.inventorySemantics || ''}`));
  if (orMissingCaveat) throw new Error('Oregon inventory row is missing daily-update/verify caveat');

  const rareStates = Array.isArray(rare.states) ? rare.states : [];
  if (rareStates.length !== summary.stateCount) throw new Error(`Rare report state count mismatch: ${rareStates.length}`);
  const rareVerified = rareStates.filter((s) => s.status === 'verified_3_rare_signals').length;
  console.log(`Verified ${summary.stateCount} states, ${bible.count} bible records, ${signals.signals.length} normalized signals, ${operational.signals.length} operational signals, ${alerts.candidates.length} alert candidates, ${siteBottles.bottles.length} site bottles, ${siteDrops.drops.length} site drops, ${rareVerified}/${summary.stateCount} states with 3 rare signals.`);
  const weak = summary.states.filter((s) => s.status !== 'useful');
  if (weak.length) console.log(`States needing deeper parser/browser work: ${weak.map((s) => `${s.state}:${s.status}`).join(', ')}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
