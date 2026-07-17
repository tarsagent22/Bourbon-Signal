#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const state = String(process.argv.find((value) => value.startsWith('--state='))?.split('=')[1] || '').toUpperCase();
const online = process.argv.includes('--online');
if (!/^[A-Z]{2}(?:-[A-Z0-9]+)?$/.test(state)) throw new Error('Provide --state=AA.');
const config = JSON.parse(await readFile(path.resolve('src/config/state-lifecycle.json'), 'utf8'));
const provenance = config.states?.[state]?.promotionEvidence?.immutableEvidence?.provenance;
if (!provenance) throw new Error(`${state}: missing workflow-issued promotion provenance.`);
if (!online) {
  console.log(`${state}: promotion provenance contract present for run ${provenance.workflowRunId}.`);
  process.exit(0);
}
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'bourbon-signal-promotion-verifier' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
async function github(pathname) {
  const response = await fetch(`https://api.github.com/repos/${provenance.repository}${pathname}`, { headers, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`GitHub provenance API ${pathname} returned ${response.status}.`);
  return response.json();
}
const run = await github(`/actions/runs/${provenance.workflowRunId}`);
if (run.conclusion !== 'success' || run.head_sha !== provenance.commitSha || String(run.id) !== String(provenance.workflowRunId)) throw new Error(`${state}: workflow run provenance mismatch.`);
const artifacts = await github(`/actions/runs/${provenance.workflowRunId}/artifacts?per_page=100`);
const artifact = (artifacts.artifacts || []).find((item) => String(item.id) === String(provenance.artifactId));
if (!artifact || artifact.expired || artifact.name !== provenance.artifactName || String(artifact.digest || '').replace(/^sha256:/, '') !== provenance.artifactDigest) throw new Error(`${state}: workflow artifact provenance mismatch or expired.`);
console.log(`${state}: online promotion provenance verified against successful run ${run.id} and artifact ${artifact.id}.`);
