import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { taskPacketDigest } from './lib/engine-expansion-speed.mjs';
import { PENSACOLA_SHOPIFY_SOURCE, PENSACOLA_SHOPIFY_STORES } from '../engine/src/collectors/florida-pensacola-surfaces.mjs';
import { GEORGIA_CITYHIVE_SOURCES, GEORGIA_GOTOLIQUOR_STORES, GEORGIA_LIGHTSPEED_STORES } from '../engine/src/collectors/georgia-retailer-surfaces.mjs';
import { isSouthCarolinaCityHiveInventory } from '../engine/src/south-carolina-retailer-policy.mjs';
import { isGeorgiaRetailerInventory } from '../engine/src/georgia-retailer-policy.mjs';
import { verifyGeorgiaReleasePolicy } from '../engine/src/georgia-release-policy.mjs';
import { bibleLookup, buildDrops } from '../engine/src/export-site-contract.mjs';

import {
  calculateStateExpansionMetrics,
  normalizeStateCode,
  optionValue,
  readJson,
  runCommand,
  writeJsonAtomic,
} from './lib/state-expansion-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const state = normalizeStateCode(optionValue('state'));
const packetFile = optionValue('packet');
const metricsFile = optionValue('metrics');
if (!packetFile || !metricsFile) throw new Error('--packet and --metrics are required.');
if (state !== 'FL' && state !== 'SC' && state !== 'GA') throw new Error('The forced live-probe wrapper supports the reviewed Florida, Georgia, and South Carolina paths only.');

const packet = await readJson(path.resolve(root, packetFile));
const gh = process.platform === 'win32' ? 'gh.exe' : 'gh';
const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || (await runCommand(gh, ['auth', 'token'], { cwd: root, capture: true, timeoutMs: 30_000 })).stdout.trim();
const [{ stdout: phaseHeadCommit }, { stdout: phaseDiff }, { stdout: siteOutputStatus }] = await Promise.all([
  runCommand('git', ['rev-parse', 'HEAD'], { cwd: root, capture: true, timeoutMs: 30_000 }),
  runCommand('git', ['diff', '--binary', 'HEAD'], { cwd: root, capture: true, timeoutMs: 30_000 }),
  runCommand('git', ['status', '--porcelain', '--', 'engine/out/site'], { cwd: root, capture: true, timeoutMs: 30_000 }),
]);
if (packet.state !== state) throw new Error(`Packet state ${packet.state || 'missing'} does not match ${state}.`);
if (siteOutputStatus.trim()) throw new Error('Live probe requires clean engine/out/site artifacts so cleanup cannot overwrite unrelated work.');
const startedAtMs = Date.now();
const env = {
  ...process.env,
  GH_TOKEN: ghToken,
  BOURBON_SIGNAL_RUN_STATES: state,
  BOURBON_SIGNAL_STATE_SCHEDULER: '0',
  BOURBON_SIGNAL_FORCE_SOURCE_RUN: '1',
  BOURBON_SIGNAL_BROWSER_PREFLIGHT: '0',
  BOURBON_SIGNAL_SKIP_BROWSER_COLLECTORS: '1',
  BOURBON_SIGNAL_AUTO_DEPLOY: '0',
  BOURBON_SIGNAL_SC_FORCE_CITYHIVE_LIVE: state === 'SC' ? '1' : '0',
  BOURBON_SIGNAL_SC_FORCE_ALL_AMERICAN_LIVE: state === 'SC' ? '1' : '0',
  BOURBON_SIGNAL_SC_PRECISION_TIMEOUT_MS: state === 'SC' ? '420000' : process.env.BOURBON_SIGNAL_SC_PRECISION_TIMEOUT_MS,
  BOURBON_SIGNAL_FL_PENSACOLA_MAX_COLLECTION_PAGES: process.env.BOURBON_SIGNAL_FL_PENSACOLA_MAX_COLLECTION_PAGES || '1',
  BOURBON_SIGNAL_FL_PENSACOLA_MAX_PRODUCT_PAGES: process.env.BOURBON_SIGNAL_FL_PENSACOLA_MAX_PRODUCT_PAGES || '10',
};
const engineRoot = path.join(root, 'engine');

// Hydrate only through the canonical release artifact path. The frozen local baseline
// remains audit evidence, but extracted files are not reused without a manifest digest.
let result;
try {
  await runCommand('node', ['scripts/hydrate-state-reports.mjs'], { cwd: root, env, timeoutMs: 12 * 60_000 });
  let localGeorgiaDrops = null;
  if (state === 'GA') {
    await runCommand(process.execPath, ['src/build-bible.mjs'], { cwd: engineRoot, env, timeoutMs: 10 * 60_000 });
    await runCommand(process.execPath, ['src/run.mjs'], { cwd: engineRoot, env, timeoutMs: 25 * 60_000 });
    const [freshGeorgia, biblePayload] = await Promise.all([
      readJson(path.join(engineRoot, 'out', 'states', 'GA.json')),
      readJson(path.join(engineRoot, 'out', 'bourbon-bible.json')),
    ]);
    localGeorgiaDrops = buildDrops(freshGeorgia.signals || [], bibleLookup(biblePayload.records || []), freshGeorgia.signals || []);
    verifyGeorgiaReleasePolicy({ state: freshGeorgia, siteDrops: localGeorgiaDrops, siteAlerts: [] });
  } else {
    await runCommand('node', ['src/refresh-site.mjs'], { cwd: engineRoot, env, timeoutMs: 25 * 60_000 });
    if (state === 'SC') await runCommand(process.execPath, ['src/score-sc-user-reach.mjs'], { cwd: engineRoot, env, timeoutMs: 2 * 60_000 });
    const verifier = state === 'FL' ? 'src/verify-fl.mjs' : 'src/verify-sc.mjs';
    await runCommand(process.execPath, [verifier], { cwd: engineRoot, env, timeoutMs: 8 * 60_000 });
  }

  const stateReport = await readJson(path.join(root, 'engine', 'out', 'states', `${state}.json`));
  const siteDrops = state === 'GA'
    ? { drops: localGeorgiaDrops }
    : await readJson(path.join(root, 'engine', 'out', 'site', 'states', state, 'drops.json'));
  const coverageState = state === 'GA'
    ? {
        representedAreaCount: new Set((stateReport.signals || []).filter(isGeorgiaRetailerInventory).map((row) => row.city).filter(Boolean)).size,
        layers: {
          known: GEORGIA_CITYHIVE_SOURCES.reduce((sum, source) => sum + source.merchants.size, 0)
            + GEORGIA_GOTOLIQUOR_STORES.length + GEORGIA_LIGHTSPEED_STORES.length + 1,
        },
      }
    : JSON.parse((await runCommand(process.execPath, [
        '--no-warnings',
        '--experimental-strip-types',
        path.join(root, 'scripts', 'print-generated-coverage-state.mts'),
        `--state=${state}`,
        `--site-root=${path.join(root, 'engine', 'out', 'site')}`,
      ], { cwd: root, capture: true, timeoutMs: 2 * 60_000 })).stdout);
  if (state !== 'GA') {
    const coverageGeneratedAtMs = Date.parse(coverageState.generatedAt || '');
    if (!Number.isFinite(coverageGeneratedAtMs) || coverageGeneratedAtMs < startedAtMs) {
      throw new Error('Generated coverage contract predates this forced live probe.');
    }
  }
  const drops = Array.isArray(siteDrops) ? siteDrops : (siteDrops?.drops || []);
  const targetCustomerCards = state === 'FL'
    ? (() => {
        const storeIds = new Set([...PENSACOLA_SHOPIFY_STORES.values()].map((store) => store.id));
        return drops.filter((drop) => drop?.state === state
          && drop?.sourceChain === PENSACOLA_SHOPIFY_SOURCE.id
          && storeIds.has(drop?.storeId)
          && drop?.locationPrecision === 'store_level'
          && drop?.canAlertAsInventory === true
          && drop?.sourceStale !== true
          && Date.parse(drop?.observedAt || '') >= startedAtMs);
      })()
    : drops.filter((drop) => drop?.state === state
      && drop?.locationPrecision === 'store_level'
      && drop?.canAlertAsInventory === true
      && drop?.sourceStale !== true
      && Date.parse(drop?.observedAt || '') >= startedAtMs);
  if (!targetCustomerCards.length) {
    throw new Error(state === 'FL'
      ? 'Forced live probe produced no fresh Pensacola customer card.'
      : `Forced live probe produced no fresh ${state} customer card.`);
  }
  const metrics = {
    ...calculateStateExpansionMetrics({
      stateCode: state,
      stateReport,
      siteDrops,
      coverageState,
      minimumObservedAtMs: startedAtMs,
      maxAgeMs: 90 * 60_000,
      strictInventoryValidator: state === 'SC'
        ? (row) => (String(row?.eventType || row?.type || '') === 'cityhive_store_inventory_result'
          || /CityHive/i.test(String(row?.sourceLabel || row?.source || '')))
          ? isSouthCarolinaCityHiveInventory(row)
          : true
        : state === 'GA' ? isGeorgiaRetailerInventory : null,
    }),
    targetCustomerCards: targetCustomerCards.length,
  };
  await writeJsonAtomic(path.resolve(root, metricsFile), metrics);
  await writeJsonAtomic(path.resolve(root, packet.artifacts.acceptanceEvidence), {
    schemaVersion: 'bourbon-signal-engine-expansion-acceptance-v1',
    evidenceId: randomUUID(), state, runId: packet.runId,
    packetDigest: taskPacketDigest(packet), phase: 'live-probe',
    headCommit: phaseHeadCommit.trim(),
    diffDigest: createHash('sha256').update(phaseDiff.trim()).digest('hex'),
    capturedAt: new Date().toISOString(), productionCommit: null, ...metrics,
  });
  result = { ok: true, state, startedAt: new Date(startedAtMs).toISOString(), metrics, stateStatus: stateReport.status };
} finally {
  await runCommand('git', ['restore', '--', 'engine/out/site'], { cwd: root, timeoutMs: 2 * 60_000 });
}
console.log(JSON.stringify(result));
