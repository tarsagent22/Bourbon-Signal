import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateStateExpansionMetrics, normalizeStateCode, optionValue, readJson, runCommand, writeJsonAtomic } from './lib/state-expansion-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const state = normalizeStateCode(optionValue('state'));
const runMetadataFile = optionValue('run-metadata');
const metricsFile = optionValue('metrics');
if (!runMetadataFile || !metricsFile) throw new Error('--run-metadata and --metrics are required.');
const metadata = await readJson(path.resolve(root, runMetadataFile));
const main = (await runCommand('git', ['rev-parse', 'origin/main'], { cwd: root, capture: true })).stdout.trim();
if (metadata.state !== state || metadata.headSha !== main || metadata.expectedCommit !== main || metadata.conclusion !== 'success') throw new Error('Production refresh metadata is not bound to current origin/main.');
await runCommand('node', ['scripts/verify-release-lane.mjs', '--phase=publish', `--sha=${main}`], { cwd: root, capture: true });
const artifactDir = path.resolve(root, '.operator', 'engine-expansions', state, `production-artifact-${metadata.databaseId}`);
await rm(artifactDir, { recursive: true, force: true });
const gh = process.platform === 'win32' ? 'gh.exe' : 'gh';
await runCommand(gh, ['run', 'download', String(metadata.databaseId), '--repo', 'tarsagent22/Bourbon-Signal', '--name', `inventory-refresh-${metadata.databaseId}`, '--dir', artifactDir], { cwd: root, timeoutMs: 10 * 60_000 });
const stateReport = await readJson(path.join(artifactDir, 'states', `${state}.json`));
const [dropsResponse, coverageResponse, statsResponse] = await Promise.all([
  fetch(`https://www.bourbonsignal.com/api/drops?state=${state}&limit=100`, { signal: AbortSignal.timeout(30_000) }),
  fetch('https://www.bourbonsignal.com/api/coverage', { signal: AbortSignal.timeout(30_000) }),
  fetch('https://www.bourbonsignal.com/api/stats', { signal: AbortSignal.timeout(30_000) }),
]);
if (!dropsResponse.ok || !coverageResponse.ok || !statsResponse.ok) {
  throw new Error(`Production APIs returned drops=${dropsResponse.status} coverage=${coverageResponse.status} stats=${statsResponse.status}.`);
}
const drops = await dropsResponse.json();
const coverage = await coverageResponse.json();
const stats = await statsResponse.json();
const coverageRows = coverage.states || coverage.coverage || (Array.isArray(coverage) ? coverage : []);
const coverageState = Array.isArray(coverageRows)
  ? coverageRows.find((row) => String(row.code || row.state || row.id).toUpperCase() === state)
  : coverageRows[state];
if (!coverageState) throw new Error(`Production coverage has no ${state} entry.`);
if (stateReport.runId !== stats.runId) throw new Error(`Production stats run ${stats.runId || 'missing'} does not match targeted artifact run ${stateReport.runId || 'missing'}.`);
if (Date.parse(stats.generatedAt || '') < Date.parse(stateReport.finishedAt || '')) throw new Error('Production stats predate the targeted state report.');
const metrics = calculateStateExpansionMetrics({
  stateCode: state,
  stateReport,
  siteDrops: drops,
  coverageState,
  representedAreasFloor: 1,
  minimumObservedAtMs: Date.parse(stateReport.startedAt || ''),
});
await writeJsonAtomic(path.resolve(root, metricsFile), metrics);
console.log(JSON.stringify({ ok: true, state, commit: main, run: metadata.databaseId, metrics, stateStatus: stateReport.status }));
