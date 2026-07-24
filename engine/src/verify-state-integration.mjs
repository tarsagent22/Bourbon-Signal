#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateStateVerticalSliceManifest } from './state-vertical-slice-contract.mjs';
import { validateStateFixtures } from './verify-state-fixtures.mjs';
import { isMetroRetailerInventory } from './metro-retailer-policy.mjs';

function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function stateOf(row) { return String(row?.state || row?.state_code || '').trim().toUpperCase(); }
function hasText(value) { return typeof value === 'string' && value.trim().length > 0; }
function timePresent(row) {
  return ['observedAt', 'displayAt', 'eventAt', 'firstSeenAt', 'lastConfirmedAt', 'timestamp'].some((key) => Number.isFinite(Date.parse(String(row?.[key] || ''))));
}

export function verifyMetroCanaryRows({ state, rows, generatedAt }) {
  const failures = [];
  const generatedMs = Date.parse(String(generatedAt || ''));
  if (!Number.isFinite(generatedMs)) failures.push(`${state}: canary preview is missing a valid candidate generation timestamp.`);
  for (const row of asArray(rows).filter((candidate) => candidate?.canAlertAsInventory === true)) {
    if (!isMetroRetailerInventory(row)) failures.push(`${state}: canary inventory row fails the production metro identity, premises, pickup, or source policy.`);
    const observedMs = Date.parse(String(row.observedAt || ''));
    if (!Number.isFinite(observedMs) || !Number.isFinite(generatedMs) || observedMs > generatedMs + 15 * 60_000 || generatedMs - observedMs > 4 * 60 * 60_000) failures.push(`${state}: canary inventory row is stale or future-dated relative to the candidate artifact.`);
  }
  return failures;
}

export function verifyStateExportIntegrity({ state, lifecycle, stateDrops, drops, alerts }) {
  const failures = [];
  const rows = asArray(stateDrops?.drops);
  if (Number(stateDrops?.count) !== rows.length) failures.push(`${state}: state partition count does not match rows.`);
  if (rows.some((row) => stateOf(row) !== state)) failures.push(`${state}: state partition contains a row for another state.`);
  for (const row of rows) {
    if (!hasText(row.source) || !hasText(row.sourceUrl)) failures.push(`${state}: export row is missing source provenance.`);
    if (!timePresent(row)) failures.push(`${state}: export row is missing a valid source/event timestamp.`);
    if (row.canAlertAsInventory === true) {
      if (String(row.locationPrecision || '').toLowerCase() !== 'store_level') failures.push(`${state}: inventory-alertable row is not store_level.`);
      if (!hasText(row.storeId)) failures.push(`${state}: inventory-alertable row is missing store identity.`);
      if (!hasText(row.storeAddress)) failures.push(`${state}: inventory-alertable row is missing store address.`);
      if (!hasText(row.inventorySemantics)) failures.push(`${state}: inventory-alertable row is missing availability semantics.`);
    }
  }
  const allRows = asArray(drops?.drops);
  const candidateAlerts = asArray(alerts?.alerts).filter((row) => stateOf(row) === state && row.eligibleForDelivery === true);
  if (lifecycle?.inventoryAlertable === false && lifecycle?.watchAlertable === false && candidateAlerts.length) {
    failures.push(`${state}: lifecycle-denied state emitted delivery-eligible alerts.`);
  }
  for (const alert of candidateAlerts) {
    if (!hasText(alert.source) || !hasText(alert.storeName || alert.locationName || alert.storeId) || !hasText(alert.storeAddress)) {
      failures.push(`${state}: delivery-eligible alert lacks source, store, or address identity.`);
    }
    if (!timePresent(alert) && !Number.isFinite(Number(alert.freshnessHours))) failures.push(`${state}: delivery-eligible alert lacks freshness evidence.`);
  }
  if (candidateAlerts.some((alert) => alert.canAlertAsInventory === false || alert.alertable === false)) {
    failures.push(`${state}: non-inventory/watch-only row entered a delivery alert channel.`);
  }
  if (allRows.length && allRows.filter((row) => stateOf(row) === state).length !== rows.length) {
    failures.push(`${state}: state partition is not a lossless subset of drops export.`);
  }
  return { ok: failures.length === 0, failures };
}

function verifySourceContracts(sourceFiles) {
  const failures = [];
  const required = [
    ['statePreferences', /ACTIVE_ENGINE_STATE_CODES/, 'site state preferences must derive active states from lifecycle'],
    ['dropApi', /normalizeStateCodeParam[\s\S]*drops\.filter/, 'Drop Feed API must normalize and apply state filters'],
    ['locationsApi', /searchParams\.get\(["']state["']\)/, 'Finder locations API must accept a state filter'],
    ['preferencesApi', /supportedStates/, 'preference normalization must retain supported lifecycle states'],
    ['dashboard', /areaPrefs\.states/, 'dashboard must read saved state preferences'],
    ['dropFeed', /feedStateOptions/, 'Drop Feed must expose lifecycle-backed state controls'],
    ['alertDelivery', /state/, 'alert delivery policy must carry state identity'],
    ['productionWatchdog', /state partition/, 'production watchdog must check every active state partition'],
  ];
  for (const [key, expression, message] of required) {
    if (sourceFiles?.[key] != null && !expression.test(sourceFiles[key])) failures.push(message);
  }
  return failures;
}

export function verifyStateIntegration({ state, config, manifest, fixtures, site, sourceFiles = {}, promotionEvidenceRequired = true }) {
  const normalized = String(state || '').toUpperCase();
  const failures = [];
  const lifecycle = config?.states?.[normalized];
  const active = new Set(config?.activeStates || []);
  if (!lifecycle) failures.push(`${normalized}: lifecycle entry is missing.`);
  if (!active.has(normalized)) failures.push(`${normalized}: state is not active in authoritative lifecycle.`);
  if (lifecycle?.publicStatus !== 'active') failures.push(`${normalized}: lifecycle publicStatus is not active.`);

  const contract = validateStateVerticalSliceManifest(manifest);
  failures.push(...contract.failures.map((failure) => `${normalized}: ${failure}`));
  const fixtureContract = validateStateFixtures(fixtures);
  failures.push(...fixtureContract.failures.map((failure) => `${normalized}: fixture ${failure}`));
  if (fixtures?.state && fixtures.state !== normalized) failures.push(`${normalized}: fixture state does not match.`);
  if (manifest?.state && manifest.state !== normalized) failures.push(`${normalized}: vertical-slice manifest state does not match.`);
  for (const field of ['customerLabel', 'publicStatus', 'coverageTier', 'refinementLevel']) {
    if (lifecycle && manifest?.lifecycle?.[field] !== lifecycle[field]) failures.push(`${normalized}: manifest lifecycle.${field} must match authoritative lifecycle.`);
  }
  if (lifecycle?.inventoryAlertable === false && manifest?.sourceSemantics?.inventoryAlertable !== false) failures.push(`${normalized}: manifest cannot enable inventory alerts disabled by lifecycle.`);
  if (lifecycle?.watchAlertable === false && manifest?.sourceSemantics?.watchAlertable !== false) failures.push(`${normalized}: manifest cannot enable watch alerts disabled by lifecycle.`);
  if (promotionEvidenceRequired && lifecycle?.publicStatus === 'active') {
    const immutable = manifest?.evidence?.immutablePromotionEvidence;
    if (!object(immutable)) failures.push(`${normalized}: active promoted state is missing immutable promotion evidence.`);
    else {
      const sourceConfig = JSON.stringify({
        lifecycle: manifest.lifecycle,
        collector: manifest.collector,
        storeIdentity: manifest.storeIdentity,
        sourceSemantics: manifest.sourceSemantics,
        customerPaths: manifest.customerPaths,
      });
      const sourceConfigHash = createHash('sha256').update(sourceConfig).digest('hex');
      if (immutable.sourceConfigHash !== sourceConfigHash) failures.push(`${normalized}: immutable promotion evidence does not bind the current source configuration.`);
      if (JSON.stringify(lifecycle?.promotionEvidence?.immutableEvidence || null) !== JSON.stringify(immutable)) failures.push(`${normalized}: lifecycle promotion evidence drifted from the vertical-slice manifest.`);
    }
  }

  const partitionIndex = site?.stateIndex;
  const partition = asArray(partitionIndex?.states).find((entry) => entry.state === normalized);
  if (!partition) failures.push(`${normalized}: state partition is missing.`);
  const stateDrops = site?.stateDrops?.[normalized];
  if (!stateDrops) failures.push(`${normalized}: state partition payload is missing.`);
  if (!asArray(site?.stats?.stateCoverage?.states).some((entry) => stateOf(entry) === normalized)) failures.push(`${normalized}: monitoring state coverage is missing.`);
  if (partition && stateDrops && Number(partition.count) !== Number(stateDrops.count)) failures.push(`${normalized}: partition index count does not match payload.`);
  if (stateDrops) failures.push(...verifyStateExportIntegrity({ state: normalized, lifecycle, stateDrops, drops: site?.drops, alerts: site?.alerts }).failures);
  if ((normalized === 'NY' || normalized === 'CO') && site?.previewPolicy?.mode === 'canary_preview') {
    failures.push(...verifyMetroCanaryRows({ state: normalized, rows: stateDrops?.drops, generatedAt: site.previewPolicy.generatedAt }));
  }

  const locations = asArray(site?.locations?.locations || site?.locations?.stores);
  const hasFinderIdentity = locations.some((row) => stateOf(row) === normalized && (hasText(row.address) || hasText(row.storeAddress) || hasText(row.id) || hasText(row.storeId)));
  if (manifest?.customerPaths?.finder?.status === 'verified' && !hasFinderIdentity && asArray(stateDrops?.drops).some((row) => row.locationPrecision === 'store_level')) {
    failures.push(`${normalized}: Finder/map has no matching store or address identity.`);
  }
  failures.push(...verifySourceContracts(sourceFiles).map((failure) => `${normalized}: ${failure}`));
  return { ok: failures.length === 0, failures };
}

async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

async function readSource(root, relPath) {
  try { return await readFile(path.join(root, relPath), 'utf8'); } catch { return null; }
}

async function loadSite(siteDir, state) {
  const manifest = await readJson(path.join(siteDir, 'manifest.json'), {});
  const indexPath = manifest?.files?.stateDrops || 'states/index.json';
  const stateIndex = await readJson(path.join(siteDir, indexPath), {});
  const partition = asArray(stateIndex?.states).find((entry) => entry.state === state);
  return {
    manifest,
    stats: await readJson(path.join(siteDir, 'stats.json'), {}),
    drops: await readJson(path.join(siteDir, 'drops.json'), { drops: [] }),
    alerts: await readJson(path.join(siteDir, 'alerts.json'), { alerts: [] }),
    locations: await readJson(path.join(siteDir, 'locations.json'), { locations: [] }),
    previewPolicy: await readJson(path.join(siteDir, 'canary-preview-policy.json'), null),
    stateIndex,
    stateDrops: partition ? { [state]: await readJson(path.join(siteDir, partition.file), null) } : {},
  };
}

function argValue(flag) {
  const inline = process.argv.find((value) => value.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const root = path.resolve('..');
  const requested = argValue('--state');
  const all = process.argv.includes('--all-active');
  const canaryMode = process.argv.includes('--canary');
  if (!requested && !all) throw new Error('Usage: verify-state-integration --state=<STATE> [--site-dir=<path>] or --all-active');
  const configPath = path.resolve(argValue('--config') || path.join(root, 'src', 'config', 'state-lifecycle.json'));
  const manifestDir = path.resolve(argValue('--manifest-dir') || path.join('data', 'state-integration'));
  const siteDir = path.resolve(argValue('--site-dir') || path.join('out', 'site'));
  const config = await readJson(configPath, {});
  const states = all ? (config.activeStates || []) : [String(requested).toUpperCase()];
  const sourceRoot = root;
  const sourceFiles = {
    statePreferences: await readSource(sourceRoot, 'src/lib/statePreferences.ts'),
    dropApi: await readSource(sourceRoot, 'src/app/api/drops/route.ts'),
    locationsApi: await readSource(sourceRoot, 'src/app/api/locations/route.ts'),
    preferencesApi: await readSource(sourceRoot, 'src/app/api/user/preferences/route.ts'),
    dashboard: await readSource(sourceRoot, 'src/app/dashboard/page.tsx'),
    dropFeed: await readSource(sourceRoot, 'src/components/sections/DropFeed.tsx'),
    alertDelivery: await readSource(sourceRoot, 'src/lib/alert-delivery.ts'),
    productionWatchdog: await readSource(sourceRoot, 'scripts/production-engine-watchdog.mjs'),
  };
  const failures = [];
  for (const state of states) {
    const manifest = await readJson(path.join(manifestDir, `${state}.json`), null);
    const fixtures = await readJson(path.join(path.dirname(manifestDir), 'state-fixtures', `${state}.json`), null);
    const grandfathered = new Set(config.reliabilityPolicy?.grandfatheredActiveStates || []);
    if (!manifest && grandfathered.has(state)) {
      console.log(`${state}: grandfathered lifecycle state remains under its existing state-specific quality gates; no new-promotion manifest required.`);
      continue;
    }
    if (!manifest) { failures.push(`${state}: no vertical-slice manifest found.`); continue; }
    const site = await loadSite(siteDir, state);
    failures.push(...verifyStateIntegration({ state, config, manifest, fixtures, site, sourceFiles, promotionEvidenceRequired: !canaryMode }).failures);
  }
  if (failures.length) throw new Error(failures.join('\n'));
  console.log(`State integration verification passed for ${states.join(', ')}.`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) main().catch((error) => { console.error(error.message); process.exit(1); });
