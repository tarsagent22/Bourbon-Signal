import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildStateCanaryPreview, buildCanaryPreviewPayload } from './build-state-canary-preview.mjs';
import { bibleLookup, buildDrops } from './export-site-contract.mjs';
import { isMassachusettsResearchInventory } from './massachusetts-research-policy.mjs';
import { DEFAULT_RELIABILITY_SLO } from './reliability-policy.mjs';

const disabled = ['alertable', 'eligibleForOnSite', 'eligibleForDelivery', 'eligibleForEmail', 'eligibleForSms'];

// Export-only rehearsal. The authoritative lifecycle remains unchanged, so this
// cannot stand in for a promoted-state canary or customer-path verification.
export function verifyMaResearchCanary({ baseline, report, drops, lifecycle, nowMs = Date.now() }) {
  assert.ok(!lifecycle.activeStates.includes('MA') && !lifecycle.states.MA, 'MA must remain outside the production lifecycle');
  const age = nowMs - Date.parse(baseline.generatedAt);
  assert.ok(Number.isFinite(age) && age >= 0 && age <= DEFAULT_RELIABILITY_SLO.maxSnapshotAgeMs, 'Published baseline must be current');
  assert.ok(baseline.runId && baseline.engineGeneratedAt, 'Published baseline identity is required');
  assert.equal(report.state, 'MA');
  assert.equal(report.status, 'useful');
  assert.equal(report.stale, false);
  assert.equal(report.roadblocks.length, 0);
  assert.equal(report.sources.length, 2);
  assert.ok(report.sources.every(source => source.ok === true && source.status === 200), 'Both reviewed source pages must pass');
  assert.ok(report.signals.length > 0 && report.signals.every(row => isMassachusettsResearchInventory(row, { nowMs })), 'Every source observation must retain the reviewed research policy');
  assert.equal(new Set(report.signals.map(row => row.storeId)).size, 1, 'This source represents one physical store');
  assert.ok(drops.length > 0, 'A real research export candidate is required');
  for (const row of drops) {
    assert.equal(row.state, 'MA');
    assert.equal(row.storeId, 'ma-julios-westborough');
    assert.equal(row.quantity, null, 'Binary pickup orderability is not an exact shelf count');
    assert.equal(row.quantityIsExact, false);
    assert.ok(row.eligibleForOnSite === false && row.eligibleForDelivery === false
      && disabled.every(key => row[key] !== true), 'All customer delivery flags must remain disabled');
    assert.ok(report.signals.some(source => source.id === row.id && source.observedAt === row.observedAt), 'Export must preserve original source identity and time');
  }
  return true;
}

export function verifyMaPreviewIsolation(base, preview, candidates) {
  assert.deepEqual(preview.drops.drops.filter(row => row.state !== 'MA'), base.drops.drops.filter(row => row.state !== 'MA'));
  assert.deepEqual(preview.stateDrops.drops, candidates);
  assert.deepEqual(preview.alerts.alerts, base.alerts.alerts.filter(row => row.state !== 'MA'));
  assert.ok(!preview.alerts.alerts.some(row => row.state === 'MA'));
  assert.equal(preview.previewPolicy.alertDeliveryEnabled, false);
  assert.equal(preview.previewPolicy.productionSnapshotPublicationEnabled, false);
  assert.equal(preview.previewPolicy.productionDeploymentEnabled, false);
}

async function main() {
  assert.equal(process.env.BOURBON_SIGNAL_AUTO_DEPLOY, '0');
  assert.equal(process.env.BOURBON_SIGNAL_ALERT_QUEUE_MODE, 'shadow');
  for (const key of ['ALERT_DELIVERY_ENABLED', 'ALERT_ONSITE_DELIVERY_ENABLED', 'ALERT_EMAIL_DELIVERY_ENABLED', 'ALERT_SMS_DELIVERY_ENABLED']) assert.equal(process.env[key], '0', `${key} must be disabled`);
  const json = async file => JSON.parse(await readFile(file, 'utf8'));
  const runs = (await readdir('out/shadow/MA')).sort();
  const reportFile = path.join('out/shadow/MA', runs.at(-1), 'report.json');
  const report = await json(reportFile);
  const bible = await json('out/bourbon-bible.json');
  const lifecycleBytes = await readFile('../src/config/state-lifecycle.json');
  const lifecycle = JSON.parse(lifecycleBytes);
  const baseline = await json('out/site/manifest.json');
  const healthResponse = await fetch('https://www.bourbonsignal.com/api/ops/health', { redirect: 'error', signal: AbortSignal.timeout(15_000), cache: 'no-store' });
  assert.ok([200, 503].includes(healthResponse.status), 'Canonical baseline metadata must be readable');
  const health = await healthResponse.json();
  assert.equal(health.engine?.exportGeneratedAt, baseline.generatedAt, 'Restored cache must match the current published export');
  const drops = buildDrops(report.signals, bibleLookup(bible.records), report.signals);
  verifyMaResearchCanary({ baseline, report, drops, lifecycle });
  const base = { manifest: baseline, drops: await json('out/site/drops.json'), stateIndex: await json('out/site/states/index.json'), alerts: await json('out/site/alerts.json'), locations: await json('out/site/locations.json'), stats: await json('out/site/stats.json') };
  const generatedAt = new Date().toISOString();
  const preview = buildCanaryPreviewPayload({ base, state: 'MA', candidateDrops: drops, candidateGeneratedAt: generatedAt });
  verifyMaPreviewIsolation(base, preview, drops);
  const outDir = path.join('out/shadow/MA', runs.at(-1), 'export-canary');
  await buildStateCanaryPreview({ state: 'MA', candidateDrops: drops, candidateGeneratedAt: generatedAt, lifecycleConfig: lifecycle, siteDir: 'out/site', outDir });
  assert.deepEqual(JSON.parse(await readFile(path.join(outDir, 'lifecycle-preview.json'))), lifecycle);
  assert.deepEqual(await readFile('../src/config/state-lifecycle.json'), lifecycleBytes);
  const proof = { schemaVersion: 1, state: 'MA', mode: 'research_export_canary', generatedAt, workflowRunId: process.env.GITHUB_RUN_ID || null, sourceHead: process.env.GITHUB_SHA || null, baseline: { runId: baseline.runId, generatedAt: baseline.generatedAt, engineGeneratedAt: baseline.engineGeneratedAt, canonicalSnapshotId: health.engine?.snapshotId }, reportHash: createHash('sha256').update(await readFile(reportFile)).digest('hex'), sourceRows: report.signals.length, uniqueStores: 1, candidateRows: drops.length, customerActive: false, deliveryEnabled: false, productionChanged: false, promotionEligible: false, limit: 'Export-only evidence; normal state canaries, customer paths, independent activation review, promotion provenance and live production verification remain required.' };
  await writeFile(path.join(outDir, 'ma-research-canary.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
