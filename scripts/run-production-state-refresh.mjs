import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeStateCode, optionValue, runCommand, writeJsonAtomic } from './lib/state-expansion-runtime.mjs';
import { sourceRefreshScope } from '../engine/src/source-scoped-refresh.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const state = normalizeStateCode(optionValue('state'));
const sources = optionValue('sources') || '';
if (sources) sourceRefreshScope({ BOURBON_SIGNAL_RUN_STATES: state, BOURBON_SIGNAL_REFRESH_SOURCES: sources });
const metadataFile = optionValue('metadata');
if (!metadataFile) throw new Error('--metadata=<file> is required.');
const gh = process.platform === 'win32' ? 'gh.exe' : 'gh';
const before = new Date().toISOString();
const main = (await runCommand('git', ['rev-parse', 'origin/main'], { cwd: root, capture: true })).stdout.trim();
const incident = `coverage-${Date.now()}-${process.pid}`;
await runCommand(gh, ['workflow', 'run', 'refresh-feed.yml', '--repo', 'tarsagent22/Bourbon-Signal', '--ref', 'main', '-f', `states=${state}`,
  '-f', `incident_key=${incident}`, ...(sources ? ['-f', `sources=${sources}`] : [])], { cwd: root, capture: true });
let run = null;
for (let attempt = 0; attempt < 24 && !run; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  const listed = await runCommand(gh, ['run', 'list', '--repo', 'tarsagent22/Bourbon-Signal', '--workflow', 'refresh-feed.yml', '--event', 'workflow_dispatch', '--limit', '10', '--json', 'databaseId,displayTitle,headSha,status,conclusion,createdAt,url'], { cwd: root, capture: true });
  run = JSON.parse(listed.stdout).find((row) => row.displayTitle === `Inventory recovery ${incident}` && row.headSha === main && Date.parse(row.createdAt) >= Date.parse(before) - 5_000) || null;
}
if (!run) throw new Error(`No targeted ${state} refresh appeared for ${main}.`);
await runCommand(gh, ['run', 'watch', String(run.databaseId), '--repo', 'tarsagent22/Bourbon-Signal', '--exit-status'], { cwd: root, timeoutMs: 85 * 60_000 });
const viewed = await runCommand(gh, ['run', 'view', String(run.databaseId), '--repo', 'tarsagent22/Bourbon-Signal', '--json', 'databaseId,headSha,status,conclusion,createdAt,updatedAt,url'], { cwd: root, capture: true });
const metadata = JSON.parse(viewed.stdout);
if (metadata.headSha !== main || metadata.status !== 'completed' || metadata.conclusion !== 'success') throw new Error(`Targeted refresh did not complete successfully for ${main}.`);
await writeJsonAtomic(path.resolve(root, metadataFile), { ...metadata, state, sources, incident, expectedCommit: main });
console.log(JSON.stringify({ ok: true, state, run: metadata.databaseId, commit: main, url: metadata.url }));
