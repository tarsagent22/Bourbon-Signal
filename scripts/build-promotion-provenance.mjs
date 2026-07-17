#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const state = String(process.argv.find((value) => value.startsWith('--state='))?.split('=')[1] || '').toUpperCase();
if (!/^[A-Z]{2}(?:-[A-Z0-9]+)?$/.test(state)) throw new Error('Provide --state=AA.');
const root = process.cwd();
const files = [
  `engine/data/state-integration/${state}.json`,
  `engine/data/state-fixtures/${state}.json`,
  'engine/src/state-sources.mjs',
  'engine/src/collectors/precision-probes.mjs',
  'engine/src/export-site-contract.mjs',
  'src/config/state-lifecycle.json',
];
const fileDigests = {};
for (const file of files) {
  const content = await readFile(path.join(root, file));
  fileDigests[file] = createHash('sha256').update(content).digest('hex');
}
const payload = {
  schemaVersion: 1,
  state,
  repository: process.env.GITHUB_REPOSITORY || 'local',
  commitSha: process.env.GITHUB_SHA || 'local',
  workflowRunId: process.env.GITHUB_RUN_ID || 'local',
  workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT || '1',
  generatedAt: new Date().toISOString(),
  fileDigests,
};
payload.bundleDigest = createHash('sha256').update(JSON.stringify(payload.fileDigests)).digest('hex');
const out = path.join(root, 'engine', 'out', 'promotion-provenance', `${state}.json`);
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify({ state, out, bundleDigest: payload.bundleDigest }));
