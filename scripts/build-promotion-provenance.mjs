#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const state = String(process.argv.find((value) => value.startsWith('--state='))?.split('=')[1] || '').toUpperCase();
if (!/^[A-Z]{2}(?:-[A-Z0-9]+)?$/.test(state)) throw new Error('Provide --state=AA.');
const candidateDrops = String(process.env.PROMOTION_CANDIDATE_DROPS || '');
if (!/^data\/canary-inputs\/[A-Za-z0-9._/-]+\.json$/.test(candidateDrops) || candidateDrops.includes('..')) throw new Error('PROMOTION_CANDIDATE_DROPS must bind a repository-controlled canary input.');
const root = process.cwd();
const files = [
  `engine/${candidateDrops}`,
  `engine/data/state-integration/${state}.json`,
  `engine/data/state-fixtures/${state}.json`,
  'engine/src/state-sources.mjs',
  'engine/src/collectors/precision-probes.mjs',
  'engine/src/collectors/metro-retailer-surfaces.mjs',
  'engine/src/metro-retailer-policy.mjs',
  'engine/src/export-site-contract.mjs',
  'src/lib/new-york-area.ts',
  'src/lib/colorado-area.ts',
  'src/config/state-lifecycle.json',
  `engine/out/canary/${state}/site/canary-preview-policy.json`,
  `engine/out/canary/${state}/site/lifecycle-preview.json`,
  `engine/out/canary/${state}/site/states/${state}/drops.json`,
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
