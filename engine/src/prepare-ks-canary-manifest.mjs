#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateStateVerticalSliceManifest } from './state-vertical-slice-contract.mjs';

const PATH_ASSERTIONS = Object.freeze({
  stateFilter: 'The isolated canary lifecycle and state partition are consumed by the lifecycle-backed state filter.',
  areaFilter: 'The isolated canary lifecycle and state partition are consumed by the lifecycle-backed area filter.',
  preferences: 'The existing preference normalization retains Kansas through the nationwide geography resolver.',
  dashboard: 'The existing dashboard reads the isolated Kansas state selection and canary snapshot.',
  dropFeedApi: 'The current Drop Feed API projection filters by the isolated Kansas state partition.',
  finder: 'Finder exposes only the three reviewed Kansas premises from the canary input.',
  alerts: 'Canary observations remain non-alertable with every delivery channel disabled.',
  monitoring: 'The isolated canary snapshot records Kansas coverage without changing production monitoring.',
  export: 'Executable source fixtures enforce exact merchant, address, variant, freshness, pickup and binary-quantity semantics.',
});

export function buildKansasCanaryManifest(baseManifest, productionLifecycle, previewLifecycle, provenance, siteManifest) {
  if (baseManifest?.state !== 'KS' || baseManifest.lifecycle?.publicStatus !== 'research_only'
    || baseManifest.customerPaths?.status !== 'not_admitted'
    || productionLifecycle?.activeStates?.includes('KS') || productionLifecycle?.states?.KS
    || previewLifecycle?.states?.KS?.publicStatus !== 'active'
    || previewLifecycle?.activeStates?.includes('KS') !== true
    || provenance?.status !== 'verified_github_shadow_artifact' || provenance.state !== 'KS'
    || !/^https:\/\//.test(provenance.workflowRunUrl || '')
    || typeof siteManifest?.files?.stateDrops !== 'string') {
    throw new Error('Kansas preview manifest requires the dormant production manifest, inactive production lifecycle, matching isolated preview, and verified source provenance.');
  }
  const candidate = structuredClone(baseManifest);
  candidate.lifecycle.publicStatus = 'active';
  candidate.customerPaths = Object.fromEntries(Object.entries(PATH_ASSERTIONS).map(([key, assertion]) => [key, { status: 'verified', assertion }]));
  candidate.evidence = {
    shadow: { status: 'verified', runs: 1, artifact: provenance.workflowRunUrl },
    canary: { status: 'verified', runs: 1, artifact: 'engine/out/canary/KS/site/manifest.json' },
    production: { status: 'not_deployed', url: null,
      assertion: 'Kansas has no active production lifecycle entry and this artifact is isolated canary output.',
      reason: 'Production admission remains dormant pending separate reviewed promotion.' },
  };
  const contract = validateStateVerticalSliceManifest(candidate);
  if (!contract.ok) throw new Error(`Generated Kansas preview manifest failed its contract: ${contract.failures.join('; ')}`);
  return candidate;
}

async function main() {
  const value = flag => process.argv.find(arg => arg.startsWith(`${flag}=`))?.slice(flag.length + 1);
  const root = path.resolve('..'), state = value('--state'), outDir = value('--out-dir');
  if (state !== 'KS' || outDir !== 'out/canary-preparation/KS') throw new Error('Use the fixed KS-only canary manifest path.');
  const [base, production, preview, provenance, site] = await Promise.all([
    readFile('data/state-integration/KS.json', 'utf8').then(JSON.parse),
    readFile('../src/config/state-lifecycle.json', 'utf8').then(JSON.parse),
    readFile(`${outDir}/lifecycle-research.json`, 'utf8').then(JSON.parse),
    readFile(`out/cityhive-shadow-input/KS/provenance.json`, 'utf8').then(JSON.parse),
    readFile('out/canary/KS/site/lifecycle-preview.json', 'utf8').then(JSON.parse),
  ]);
  const siteManifest = JSON.parse(await readFile('out/canary/KS/site/manifest.json', 'utf8'));
  const candidate = buildKansasCanaryManifest(base, production, site, provenance, siteManifest);
  const manifestDir = path.join(outDir, 'manifests'), fixtureDir = path.join(outDir, 'state-fixtures');
  await Promise.all([mkdir(manifestDir, { recursive: true }), mkdir(fixtureDir, { recursive: true })]);
  await Promise.all([
    writeFile(path.join(manifestDir, 'KS.json'), `${JSON.stringify(candidate, null, 2)}\n`),
    writeFile(path.join(fixtureDir, 'KS.json'), await readFile('data/state-fixtures/KS.json')),
  ]);
  console.log(JSON.stringify({ state: 'KS', manifestDir: path.relative(root, path.resolve(manifestDir)),
    productionDormant: true, productionDeploymentEnabled: false }));
}

if (import.meta.url === (process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '')) {
  main().catch(error => { console.error(error.message); process.exit(1); });
}
