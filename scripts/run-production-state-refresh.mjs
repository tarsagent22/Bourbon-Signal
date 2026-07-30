import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeStateCode, optionValue, runCommand, writeJsonAtomic } from './lib/state-expansion-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const state = normalizeStateCode(optionValue('state'));
const metadataFile = optionValue('metadata');
if (!metadataFile) throw new Error('--metadata=<file> is required.');
const gh = process.platform === 'win32' ? 'gh.exe' : 'gh';
const before = new Date().toISOString();
const main = (await runCommand('git', ['rev-parse', 'origin/main'], { cwd: root, capture: true })).stdout.trim();
await runCommand(gh, ['workflow', 'run', 'refresh-feed.yml', '--repo', 'tarsagent22/Bourbon-Signal', '--ref', 'main', '-f', `states=${state}`], { cwd: root, capture: true });
let run = null;
for (let attempt = 0; attempt < 24 && !run; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  const listed = await runCommand(gh, ['run', 'list', '--repo', 'tarsagent22/Bourbon-Signal', '--workflow', 'refresh-feed.yml', '--event', 'workflow_dispatch', '--limit', '10', '--json', 'databaseId,headSha,status,conclusion,createdAt,url'], { cwd: root, capture: true });
  run = JSON.parse(listed.stdout).find((row) => row.headSha === main && Date.parse(row.createdAt) >= Date.parse(before) - 5_000) || null;
}
if (!run) throw new Error(`No targeted ${state} refresh appeared for ${main}.`);
await runCommand(gh, ['run', 'watch', String(run.databaseId), '--repo', 'tarsagent22/Bourbon-Signal', '--exit-status'], { cwd: root, timeoutMs: 85 * 60_000 });
const viewed = await runCommand(gh, ['run', 'view', String(run.databaseId), '--repo', 'tarsagent22/Bourbon-Signal', '--json', 'databaseId,headSha,status,conclusion,createdAt,updatedAt,url'], { cwd: root, capture: true });
const metadata = JSON.parse(viewed.stdout);
if (metadata.headSha !== main || metadata.status !== 'completed' || metadata.conclusion !== 'success') throw new Error(`Targeted refresh did not complete successfully for ${main}.`);
await writeJsonAtomic(path.resolve(root, metadataFile), { ...metadata, state, expectedCommit: main });
console.log(JSON.stringify({ ok: true, state, run: metadata.databaseId, commit: main, url: metadata.url }));
