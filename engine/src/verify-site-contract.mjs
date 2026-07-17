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

const manifest = readJson('manifest.json');
const hasStatePartitions = typeof manifest.files?.stateDrops === 'string';
const required = ['manifest.json', 'stats.json', 'bottles.json', 'stores.json', 'locations.json', 'drops.json', 'events.json', 'alerts.json', 'state-quality.json'];
if (hasStatePartitions) required.push(manifest.files.stateDrops);
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
    if (state && !activeStates.has(state) && state !== 'MD-MONTGOMERY') {
      fail(`${file} contains non-active customer-facing state ${state} at ${parts.join('.') || '<root>'}`);
    }
  });
}

const stats = readJson('stats.json');
const stateQuality = readJson('state-quality.json');
const lifecycleConfig = JSON.parse(readFileSync(path.join(root, '..', 'src', 'config', 'state-lifecycle.json'), 'utf8'));
const grandfatheredStates = new Set(lifecycleConfig.reliabilityPolicy?.grandfatheredActiveStates || []);
for (const state of lifecycleConfig.activeStates || []) {
  if (grandfatheredStates.has(state)) continue;
  const manifestPath = path.join(root, 'data', 'state-integration', `${state}.json`);
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest.state !== state) fail(`State integration manifest ${state}.json does not declare ${state}.`);
  } catch {
    fail(`New active state ${state} is missing engine/data/state-integration/${state}.json.`);
  }
}
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
const qualityStateIds = new Set((stateQuality.states || []).map((state) => String(state.state).toUpperCase()));
for (const expected of activeStates) {
  if (!qualityStateIds.has(expected)) fail(`state-quality.json missing active state ${expected}.`);
}
if (stateQuality.summary?.stateCount !== activeStates.size) {
  fail(`state-quality.json summary should contain ${activeStates.size} states, got ${stateQuality.summary?.stateCount}.`);
}
if (stateQuality.regression?.ok !== true) {
  fail(`state-quality.json contains blocked regressions: ${(stateQuality.regression?.failures || []).join(' ')}`);
}
for (const state of stateQuality.states || []) {
  if (!Number.isFinite(state.score) || state.score < 0 || state.score > 100) fail(`${state.state} has invalid quality score ${state.score}.`);
  if (!Array.isArray(state.weaknesses)) fail(`${state.state} quality weaknesses must be an array.`);
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
if (hasStatePartitions) {
  const partitionIndex = readJson(manifest.files.stateDrops);
  const partitionDrops = [];
  for (const expected of activeStates) {
    const entry = (partitionIndex.states || []).find((item) => item.state === expected);
    if (!entry) {
      fail(`${manifest.files.stateDrops} missing active state ${expected}.`);
      continue;
    }
    const payload = readJson(entry.file);
    if (payload.state !== expected) fail(`${entry.file} declares state ${payload.state}, expected ${expected}.`);
    if (payload.count !== (payload.drops || []).length || entry.count !== payload.count) fail(`${entry.file} count is incomplete.`);
    if ((payload.drops || []).some((drop) => drop.state !== expected)) fail(`${entry.file} contains rows from another state.`);
    partitionDrops.push(...(payload.drops || []));
  }
  if (partitionIndex.totalCount !== (drops.drops || []).length || partitionDrops.length !== (drops.drops || []).length) {
    fail(`state drop partitions must preserve all ${(drops.drops || []).length} drops; index=${partitionIndex.totalCount}, combined=${partitionDrops.length}.`);
  }
  const sourceRows = (drops.drops || []).map((drop) => JSON.stringify(drop)).sort();
  const partitionRows = partitionDrops.map((drop) => JSON.stringify(drop)).sort();
  if (sourceRows.some((row, index) => row !== partitionRows[index])) fail('state drop partitions are not a lossless copy of drops.json.');
}
const dropStates = new Set((drops.drops || []).map((drop) => drop.state).filter(Boolean));
if ((drops.drops || []).length !== stats.dropCount) {
  fail(`stats.dropCount should match drops.json length (${(drops.drops || []).length}), got ${stats.dropCount}.`);
}
const requiredDropStates = (process.env.BOURBON_SIGNAL_VERIFY_SITE_REQUIRED_DROP_STATES || 'AL,IL,NC,PA,TN')
  .split(',')
  .map((state) => state.trim().toUpperCase())
  .filter(Boolean);
for (const expected of requiredDropStates) {
  if (!dropStates.has(expected)) fail(`drops.json should still include customer-facing state ${expected}.`);
}
const vaCoverage = coverageStates.find((state) => state.state === 'VA');
if (!vaCoverage) fail('stats.stateCoverage.states missing active state VA.');
const falseFreshInventoryDrops = (drops.drops || []).filter((drop) => {
  const type = String(drop.type || drop.event_type || '').toLowerCase();
  const firstSeenAt = drop.firstSeenAt || drop.first_seen_at;
  const lastConfirmedAt = drop.lastConfirmedAt || drop.last_confirmed_at;
  const displayAt = drop.displayAt || drop.timestamp;
  const timestampBasis = drop.timestampBasis || drop.timestamp_basis;
  if (!type.includes('inventory')) return false;
  if (!firstSeenAt || !lastConfirmedAt || firstSeenAt === lastConfirmedAt) return false;
  return timestampBasis === 'last_confirmed_at' || displayAt === lastConfirmedAt;
});
if (falseFreshInventoryDrops.length) {
  const sample = falseFreshInventoryDrops
    .slice(0, 5)
    .map((drop) => `${drop.state || '??'} ${drop.bottleName || drop.rawName || drop.id}: first ${drop.firstSeenAt || drop.first_seen_at}, displayed ${drop.displayAt || drop.timestamp}`)
    .join('; ');
  fail(`repeated inventory drops must stay anchored to firstSeenAt/source event time, not re-report as lastConfirmedAt; saw ${falseFreshInventoryDrops.length}. Sample: ${sample}`);
}

if (failures.length) {
  console.error('Site contract verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Site contract verification passed for ${activeStates.size} active states: ${[...activeStates].sort().join(', ')}.`);
