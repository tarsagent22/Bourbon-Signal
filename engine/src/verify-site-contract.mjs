import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { CUSTOMER_ACTIVE_STATE_IDS } from './state-sources.mjs';
import { STATE_LIFECYCLE } from './state-lifecycle.mjs';

const root = process.cwd();
const siteDir = path.join(root, 'out', 'site');
const activeStates = new Set(CUSTOMER_ACTIVE_STATE_IDS);
const failures = [];

function fail(message) {
  failures.push(message);
}

function readJson(relPath) {
  return JSON.parse(readFileSync(path.join(siteDir, relPath), 'utf8'));
}

function walkValues(value, visitor, pathParts = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkValues(item, visitor, [...pathParts, String(index)]));
    return;
  }
  if (!value || typeof value !== 'object') return;
  visitor(value, pathParts);
  for (const [key, child] of Object.entries(value)) walkValues(child, visitor, [...pathParts, key]);
}

const required = ['manifest.json', 'stats.json', 'bottles.json', 'stores.json', 'locations.json', 'drops.json', 'events.json', 'alerts.json'];
for (const file of required) {
  try {
    const full = path.join(siteDir, file);
    if (!statSync(full).isFile()) fail(`Missing site export ${file}`);
  } catch {
    fail(`Missing site export ${file}`);
  }
}

for (const file of readdirSync(siteDir).filter((name) => name.endsWith('.json'))) {
  const payload = readJson(file);
  if (payload.contractVersion && payload.contractVersion !== 'bourbon-signal-site-v0.1') {
    fail(`${file} has unsupported contractVersion ${payload.contractVersion}`);
  }
  walkValues(payload, (node, parts) => {
    const state = typeof node.state === 'string' ? node.state.toUpperCase() : null;
    if (state === 'TX') fail(`${file} contains TX customer-facing record at ${parts.join('.') || '<root>'}`);
    if (state && !activeStates.has(state) && state !== 'MD-MONTGOMERY') {
      fail(`${file} contains non-active customer-facing state ${state} at ${parts.join('.') || '<root>'}`);
    }
    if (Array.isArray(node.states) && node.states.some((item) => String(item).toUpperCase() === 'TX')) {
      fail(`${file} contains TX in states array at ${parts.join('.') || '<root>'}`);
    }
  });
}

const stats = readJson('stats.json');
if (stats.stateCount !== activeStates.size) {
  fail(`stats.stateCount should be ${activeStates.size}, got ${stats.stateCount}`);
}
const coverageStates = stats.stateCoverage?.states || [];
const coverageStateIds = new Set(coverageStates.map((state) => String(state.state).toUpperCase()));
for (const expected of activeStates) {
  if (!coverageStateIds.has(expected)) fail(`stats.stateCoverage.states missing active state ${expected}.`);
}
for (const state of coverageStates) {
  const code = String(state.state).toUpperCase();
  if (!activeStates.has(code)) fail(`stats.stateCoverage.states contains non-active state ${code}.`);
}
if (coverageStates.some((state) => String(state.state).toUpperCase() === 'TX')) {
  fail('stats.stateCoverage.states should not include TX.');
}
for (const [code, lifecycle] of Object.entries(STATE_LIFECYCLE)) {
  if (lifecycle.publicStatus !== 'active' && coverageStateIds.has(code)) {
    fail(`Research-only state ${code} should not be customer-facing in stats.stateCoverage.`);
  }
}
const maryland = coverageStates.find((state) => state.state === 'MD-MONTGOMERY');
if (!maryland) fail('Maryland coverage row should exist as MD-MONTGOMERY internally.');
else {
  if (maryland.label !== 'Maryland') fail(`MD-MONTGOMERY should display as Maryland, got ${maryland.label}.`);
  if (maryland.customerAreaLabel !== 'Montgomery County') fail('Maryland row should expose Montgomery County as the current area label.');
  if (maryland.coverageTier === 'live_store_inventory') fail('Maryland/Montgomery aggregate data must not be labeled live_store_inventory.');
}
const iowa = coverageStates.find((state) => state.state === 'IA');
if (!iowa) fail('Iowa coverage row should exist.');
else {
  if (iowa.coverageTier === 'live_store_inventory') fail('Iowa delivery/allocation leads must not be labeled live_store_inventory.');
  if (!/not live shelf inventory/i.test(String(iowa.customerSummary || ''))) fail('Iowa coverage summary should explicitly say it is not live shelf inventory.');
}
for (const aggregateState of ['UT', 'MD-MONTGOMERY']) {
  const row = coverageStates.find((state) => state.state === aggregateState);
  if (row?.coverageTier === 'live_store_inventory') fail(`${aggregateState} aggregate/watch data must not be labeled live_store_inventory.`);
}

const drops = readJson('drops.json');
const dropStates = new Set((drops.drops || []).map((drop) => drop.state).filter(Boolean));
if ((drops.drops || []).length !== stats.dropCount) {
  fail(`stats.dropCount should match drops.json length (${(drops.drops || []).length}), got ${stats.dropCount}.`);
}
for (const expected of ['AL', 'IL', 'NC', 'PA', 'TN', 'VA']) {
  if (!dropStates.has(expected)) fail(`drops.json should still include customer-facing state ${expected}.`);
}

if (failures.length) {
  console.error('Site contract verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Site contract verification passed for ${activeStates.size} active states: ${[...activeStates].sort().join(', ')}.`);
