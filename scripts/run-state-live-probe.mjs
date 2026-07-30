import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateStateExpansionMetrics, normalizeStateCode, optionValue, readJson, runCommand, writeJsonAtomic } from './lib/state-expansion-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const state = normalizeStateCode(optionValue('state'));
const metricsFile = optionValue('metrics');
const force = optionValue('force', `precision:${state.toLowerCase()}`);
if (!metricsFile) throw new Error('--metrics=<file> is required.');
const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const env = {
  ...process.env,
  BOURBON_SIGNAL_STATE_SCHEDULER: '1',
  BOURBON_SIGNAL_RUN_STATES: state,
  BOURBON_SIGNAL_FORCE_SOURCE_RUN: '1',
  BOURBON_SIGNAL_FORCE_SOURCES: force,
  BOURBON_SIGNAL_BROWSER_PREFLIGHT: '0',
};
let stateReport;
let metrics;
try {
  await runCommand(process.execPath, [npmCli, '--prefix', 'engine', 'run', 'bible'], { cwd: root, env, timeoutMs: 10 * 60_000 });
  await runCommand('node', ['scripts/hydrate-state-reports.mjs'], { cwd: root, env, timeoutMs: 10 * 60_000 });
  await runCommand(process.execPath, [npmCli, '--prefix', 'engine', 'run', 'refresh:site'], { cwd: root, env, timeoutMs: 30 * 60_000 });
  await runCommand(process.execPath, [npmCli, '--prefix', 'engine', 'run', `verify:${state.toLowerCase()}`], { cwd: root, env, timeoutMs: 10 * 60_000 });
  await runCommand('node', ['src/verify-site-contract.mjs'], { cwd: path.join(root, 'engine'), env, timeoutMs: 10 * 60_000 });
  const [freshStateReport, siteDrops, registry] = await Promise.all([
    readJson(path.join(root, 'engine', 'out', 'states', `${state}.json`)),
    readJson(path.join(root, 'engine', 'out', 'site', 'drops.json'), { drops: [] }),
    import('../engine/src/collectors/georgia-retailer-surfaces.mjs'),
  ]);
  stateReport = freshStateReport;
  const registeredStores = state === 'GA'
    ? registry.GEORGIA_CITYHIVE_SOURCES.reduce((sum, source) => sum + source.merchants.size, 0)
      + registry.GEORGIA_GOTOLIQUOR_STORES.length + registry.GEORGIA_LIGHTSPEED_STORES.length + 1
    : 0;
  metrics = calculateStateExpansionMetrics({
    stateCode: state,
    stateReport,
    siteDrops,
    knownStoreFloor: registeredStores,
    representedAreasFloor: 1,
    minimumObservedAtMs: Date.parse(stateReport.startedAt || ''),
  });
  await writeJsonAtomic(path.resolve(root, metricsFile), metrics);
} finally {
  await runCommand('git', ['restore', '--', 'engine/out/site'], { cwd: root, timeoutMs: 2 * 60_000 });
}
console.log(JSON.stringify({ ok: true, state, metricsFile, metrics, status: stateReport.status, precisionMetadata: stateReport.precisionMetadata || null }));
