import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bibleLookup, publicSignal } from './export-site-contract.mjs';
import { BourbonBible } from './core/bible.mjs';
import { replayWyomingGroceryReport } from './research-wyoming-grocery-runtime.mjs';
import { withResearchLifecycle } from './research-state-registry.mjs';
import { WYOMING_GROCERY_LABEL, WYOMING_GROCERY_STORES, isWyomingGroceryCanaryPreview } from './wyoming-grocery-policy.mjs';

export async function prepareWyomingGroceryCanary({ reportPath, provenance, bible, nowMs = Date.now() }) {
  const bytes = await readFile(reportPath);
  const report = JSON.parse(bytes.toString('utf8'));
  const origin = report.metadata?.origin;
  const reportSha256 = createHash('sha256').update(bytes).digest('hex');
  if (provenance?.status !== 'verified_github_shadow_artifact' || provenance.state !== 'WY'
    || origin?.kind !== 'github_actions' || provenance.repository !== origin.repository
    || String(provenance.workflowRunId) !== origin.workflowRunId || provenance.headSha !== origin.commitSha
    || (provenance.reportSha256 && provenance.reportSha256 !== reportSha256)) {
    throw new Error('Wyoming preview requires its exact verified workflow-issued shadow report');
  }
  const rows = await replayWyomingGroceryReport(report, dirname(reportPath), bible, { nowMs });
  const index = bibleLookup(bible.records);
  const drops = rows.map(row => ({
    ...publicSignal({ ...row, locationName: row.storeName }, index),
    tier: row.tier,
    previewOnly: true,
    eligibleForOnSite: true,
    eligibleForDropFeed: true,
    alertable: false,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    eligibleForWatch: false,
    eligibleForDelivery: false,
    deliveryEligible: false,
    eligibleForEmail: false,
    eligibleForSms: false,
  }));
  if (!drops.length || !drops.every(isWyomingGroceryCanaryPreview)) {
    throw new Error('Wyoming preview lost an exact product binding in the customer export');
  }
  const positiveStores = new Set(drops.map(row => row.storeId));
  const locations = WYOMING_GROCERY_STORES.map(store => ({
    id: store.storeId,
    storeId: store.storeId,
    name: 'Albertsons ' + store.city,
    address: store.address,
    city: store.city,
    state: 'WY',
    zip: store.zip,
    lat: store.lat,
    lng: store.lng,
    type: 'store',
    source: WYOMING_GROCERY_LABEL,
    precision: 'store_level',
    searchable: true,
    collectorAttached: true,
    hasSignals: positiveStores.has(store.storeId),
  }));
  return {
    schemaVersion: 1,
    state: 'WY',
    generatedAt: report.finishedAt,
    scope: 'isolated_canary_input_no_production_activation',
    originalSourceClockPreserved: true,
    workflowSource: { ...provenance, reportSha256 },
    locations,
    drops,
  };
}

async function reportPaths(directory) {
  const reports = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) reports.push(...await reportPaths(file));
    else if (entry.name === 'report.json') reports.push(file);
  }
  return reports;
}

async function main() {
  const arg = name => process.argv.find(item => item.startsWith(`${name}=`))?.slice(name.length + 1);
  const artifact = arg('--artifact-dir'), proofFile = arg('--provenance'), out = arg('--out'), configOut = arg('--config-out');
  if (arg('--state') !== 'WY' || !artifact || !proofFile || out !== 'data/canary-inputs/WY.json'
    || configOut !== 'out/canary-preparation/WY/lifecycle-research.json') {
    throw new Error('Use the fixed Wyoming canary and lifecycle paths with verified shadow inputs');
  }
  const provenance = JSON.parse(await readFile(proofFile, 'utf8'));
  const matches = [];
  for (const file of await reportPaths(artifact)) {
    const report = JSON.parse(await readFile(file, 'utf8'));
    if (report.state === 'WY' && report.metadata?.origin?.workflowRunId === provenance.workflowRunId) matches.push(file);
  }
  if (matches.length !== 1) throw new Error('Expected exactly one matching workflow-issued Wyoming report');
  const result = await prepareWyomingGroceryCanary({ reportPath: matches[0], provenance, bible: await BourbonBible.load() });
  const lifecycle = withResearchLifecycle(JSON.parse(await readFile('../src/config/state-lifecycle.json', 'utf8')));
  for (const [file, value] of [[out, result], [configOut, lifecycle]]) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(value, null, 2) + '\n');
  }
  console.log(JSON.stringify({ state: 'WY', rows: result.drops.length, sourceRun: provenance.workflowRunId }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
