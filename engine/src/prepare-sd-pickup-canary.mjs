import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BourbonBible } from './core/bible.mjs';
import { buildStateCanaryPreview } from './build-state-canary-preview.mjs';
import { reviewSouthDakotaPickup } from './research-south-dakota-retailer.mjs';
import { isSouthDakotaCanaryPickup, sources, storeId, fullAddress } from './south-dakota-pickup-policy.mjs';
import { withResearchLifecycle } from './research-state-registry.mjs';

const hash = content => createHash('sha256').update(content).digest('hex');
const candidateIds = sources.map(storeId).sort();

export async function prepareSouthDakotaCanary(directory, {bible, nowMs = Date.now(), workflowRunId} = {}) {
  const sd = path.join(directory, 'SD');
  const [folder, ...rest] = await readdir(sd);
  if (!folder || rest.length) throw Error('Expected one isolated South Dakota observation.');
  const base = path.join(sd, folder);
  const report = JSON.parse(await readFile(path.join(base, 'report.json'), 'utf8'));
  const evidence = report.metadata;
  if (report.state !== 'SD' || report.status !== 'useful' || evidence?.complete !== true || evidence.shadowOnly !== true
    || evidence.productionActivationAllowed !== false || evidence.customerDeliveryAllowed !== false
    || evidence.origin?.repository !== 'tarsagent22/Bourbon-Signal' || evidence.origin.kind !== 'github_actions'
    || String(evidence.origin.workflowRunId) !== String(workflowRunId) || !/^\d+$/.test(workflowRunId)
    || evidence.requests.length !== 3 || JSON.stringify([...evidence.verifiedPremises].sort()) !== JSON.stringify(candidateIds)) {
    throw Error('South Dakota canary requires an exact hosted source report.');
  }
  const pairs = new Set();
  const candidate = new Map();
  for (const receipt of evidence.requests) {
    const source = sources.find(entry => storeId(entry) === receipt.storeId && entry.terms.includes(receipt.query));
    const time = Date.parse(receipt.observedAt);
    const identity = receipt.storeId + ':' + receipt.query;
    if (!source || receipt.status !== 200 || receipt.ok !== true || pairs.has(identity)
      || !Number.isFinite(time) || time > nowMs || time < nowMs - 2 * 60 * 60_000 || time > Date.parse(report.finishedAt)
      || !/^[a-f0-9]{64}$/.test(receipt.sha256) || !/^source-captures\/[1-3]-[a-f0-9]{12}\.json$/.test(receipt.artifactPath)) {
      throw Error('South Dakota receipt does not match its reviewed premise, query, or clock.');
    }
    pairs.add(identity);
    const raw = await readFile(path.join(base, receipt.artifactPath));
    if (raw.length > 512 * 1024 || hash(raw) !== receipt.retainedCaptureSha256) throw Error('South Dakota retained capture digest drifted.');
    const result = reviewSouthDakotaPickup(JSON.parse(raw), source.id, bible, receipt.observedAt, receipt.url);
    if (!result) throw Error('South Dakota capture lost its exact store or pickup semantics.');
    for (const row of result.signals) {
      const projected = {
        ...row, previewOnly: true, eligibleForOnSite: true, eligibleForDropFeed: true,
        type: row.eventType, bottleName: row.canonicalName, zip: row.postalCode,
        storeQty: 0, sourceStale: false, can_alert_as_inventory: false,
        sourceProductBinding: {...row.sourceProductBinding, shadowOnly: false},
        raw: {...row.raw, shadowOnly: false},
      };
      if (!isSouthDakotaCanaryPickup(projected, nowMs)) throw Error('South Dakota preview rows must remain exact, fresh, and silent.');
      candidate.set(row.id, projected);
    }
  }
  const drops = [...candidate.values()];
  if (!drops.length) throw Error('South Dakota run has no current exact pickup results.');
  return {
    generatedAt: report.finishedAt, drops, locations: sources.map(source => ({
      id: storeId(source), storeId: storeId(source), state: 'SD', name: source.name, address: fullAddress(source),
      city: 'Rapid City', zip: source.zip, type: 'store', locationType: 'store', precision: 'store_level',
      searchable: true, collectorAttached: true, hasSignals: drops.some(row => row.storeId === storeId(source)),
    })),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [directory, workflowRunId] = process.argv.slice(2);
  if (!directory || !workflowRunId) throw Error('Provide isolated shadow artifact directory and hosted workflow run ID.');
  const bible = await BourbonBible.load();
  const candidate = await prepareSouthDakotaCanary(directory, {bible, workflowRunId});
  const config = JSON.parse(await readFile('../src/config/state-lifecycle.json', 'utf8'));
  await buildStateCanaryPreview({state: 'SD', candidateDrops: candidate.drops, candidateLocations: candidate.locations,
    candidateGeneratedAt: candidate.generatedAt, lifecycleConfig: withResearchLifecycle(config), outDir: path.resolve('out/canary/SD/site')});
  console.log(JSON.stringify({state: 'SD', rows: candidate.drops.length, stores: candidate.locations.length, sourceRun: workflowRunId}));
}
