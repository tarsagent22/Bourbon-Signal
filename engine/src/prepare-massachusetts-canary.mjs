#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BourbonBible } from './core/bible.mjs';
import { MA_ESPLANDA_PRODUCTS, parseMassachusettsEsplandaProduct } from './collectors/massachusetts-esplanda.mjs';
import { MA_JULIOS_SOURCE } from './collectors/massachusetts-retailer-surfaces.mjs';
import { isMassachusettsResearchInventory } from './massachusetts-research-policy.mjs';
import { buildDrops, bibleLookup } from './export-site-contract.mjs';
import { prepareCentralCityHiveCanary } from './prepare-central-cityhive-canary.mjs';
import { withResearchLifecycle } from './research-state-registry.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const SOURCE_BIBLE_SHA = 'a222d6990e2d248780c116eff1fafb142db9c7434644201f8443683e879f5f1d';
const CURRENT_BIBLE_SHA = 'd175443d4945c401e636e64fa9738ca09c2966b5e9e4b79038eec18a8b754460';
const CITY_RUN = '43627853806';
const ESPLANDA_RUN = '43624193800';

async function findReport(directory, predicate) {
  const matches = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) matches.push(...await findReport(file, predicate));
    else if (entry.name === 'report.json') {
      const report = JSON.parse(await readFile(file, 'utf8'));
      if (predicate(report)) matches.push({ report, directory: path.dirname(file) });
    }
  }
  return matches;
}

function verifyOrigin(provenance, state, expectedRun) {
  if (provenance?.status !== 'verified_github_shadow_artifact' || provenance.state !== state
    || provenance.repository !== 'tarsagent22/Bourbon-Signal' || provenance.workflowRunId !== expectedRun
    || provenance.artifactName !== `state-expansion-shadow-${expectedRun}`
    || !/^[a-f0-9]{64}$/.test(provenance.artifactDigest || '')
    || !/^[a-f0-9]{40}$/.test(provenance.headSha || '')) {
    throw new Error(`MA canary requires verified hosted ${expectedRun} shadow provenance.`);
  }
}

export function reconcileMassachusettsCityHiveBible(report, currentBibleSha) {
  const sourceBibleSha = report?.metadata?.bibleRecordsSha256;
  if (!/^[a-f0-9]{64}$/.test(sourceBibleSha || '') || !/^[a-f0-9]{64}$/.test(currentBibleSha || '')
    || !((sourceBibleSha === SOURCE_BIBLE_SHA && currentBibleSha === CURRENT_BIBLE_SHA)
      || sourceBibleSha === currentBibleSha && sourceBibleSha === CURRENT_BIBLE_SHA)) {
    throw new Error('MA shadow evidence does not match the reviewed source/current Bible pair.');
  }
  // The only reviewed delta between these exact full-library digests is the
  // NC Old Forester King Ranch tier override. All MA raw bodies are reparsed
  // below against CURRENT_BIBLE_SHA; the source report remains immutable.
  return { replayReport: sourceBibleSha === currentBibleSha ? report : {
    ...report, metadata: { ...report.metadata, bibleRecordsSha256: currentBibleSha },
  }, sourceBibleSha, currentBibleSha };
}

export async function prepareMassachusettsCanary({ cityArtifactDir, cityProvenance, esplandaArtifactDir,
  esplandaProvenance, bible, nowMs = Date.now() } = {}) {
  verifyOrigin(cityProvenance, 'MA', CITY_RUN);
  verifyOrigin(esplandaProvenance, 'MA', ESPLANDA_RUN);
  const cityMatches = await findReport(cityArtifactDir, report => report.state === 'MA'
    && String(report.metadata?.origin?.workflowRunId) === CITY_RUN);
  if (cityMatches.length !== 1) throw new Error('Expected one exact CityHive/Julio report.');
  const [cityMatch] = cityMatches;
  const cityReport = cityMatch.report;
  const currentBibleSha = sha(Buffer.from(JSON.stringify(bible.records || [])));
  const bibleBinding = reconcileMassachusettsCityHiveBible(cityReport, currentBibleSha);
  if (cityReport.metadata?.origin?.commitSha !== cityProvenance.headSha
    || cityReport.metadata?.origin?.workflowRunId !== CITY_RUN) throw new Error('MA shadow evidence is not bound to the reviewed source and current Bible.');
  const city = await prepareCentralCityHiveCanary({ state: 'MA', report: bibleBinding.replayReport, reportDirectory: cityMatch.directory,
    bible, provenance: cityProvenance, nowMs });

  const esplandaMatches = await findReport(esplandaArtifactDir, report => report.state === 'MA'
    && report.metadata?.sourceSet === 'massachusetts-esplanda-only');
  if (esplandaMatches.length !== 1) throw new Error('Expected one exact Esplanda-only report.');
  const { report, directory: esplandaDir } = esplandaMatches[0];
  if (report.state !== 'MA' || report.metadata?.complete !== true || report.metadata?.shadowOnly !== true
    || report.metadata?.productionActivationAllowed !== false || report.metadata?.customerDeliveryAllowed !== false
    || report.startedAt !== '2026-11-14T18:01:24.253Z' || report.finishedAt !== '2026-11-14T18:01:26.523Z'
    || esplandaProvenance.headSha !== cityProvenance.headSha) throw new Error('MA Esplanda report is incomplete or not from the same reviewed source revision.');
  const esplandaRows = [];
  for (const source of MA_ESPLANDA_PRODUCTS) {
    const sourceReport = report.sources?.find(item => item.url === source.requestUrl);
    const receipt = sourceReport?.receipt;
    if (sourceReport?.ok !== true || receipt?.status !== 200 || receipt.finalUrl !== source.requestUrl
      || !Number.isSafeInteger(receipt.bytes) || receipt.bytes < 1 || receipt.bytes > 2 * 1024 * 1024
      || !/^[a-f0-9]{64}$/.test(receipt.sha256 || '') || !Number.isFinite(Date.parse(receipt.observedAt))
      || Date.parse(receipt.observedAt) > Date.parse(report.finishedAt) || nowMs - Date.parse(receipt.observedAt) < 0
      || nowMs - Date.parse(receipt.observedAt) > 2 * 60 * 60_000) throw new Error('MA Esplanda source receipt is stale or incomplete.');
    const body = await readFile(path.join(esplandaDir, receipt.artifactPath));
    if (body.length !== receipt.bytes || sha(body) !== receipt.sha256) throw new Error('MA Esplanda retained source body failed its receipt digest.');
    const row = parseMassachusettsEsplandaProduct(body.toString('utf8'), source, bible,
      { requestedUrl: source.requestUrl, observedAt: receipt.observedAt });
    if (!row || !isMassachusettsResearchInventory(row, { nowMs })) throw new Error('MA Esplanda page no longer proves exact current pickup.');
    esplandaRows.push(row);
  }

  const juliosRows = cityReport.signals.filter(row => String(row.sourceRuntimeId || '').startsWith('precision:ma:julios-westborough:'));
  const juliosSources = cityReport.sources.filter(row => String(row.sourceRuntimeId || '').startsWith('precision:ma:julios-westborough:'));
  if (juliosRows.length !== 3 || juliosSources.length !== 2 || juliosSources.some(row => row.ok !== true || Number(row.status) !== 200)
    || juliosRows.some(row => !isMassachusettsResearchInventory(row, { nowMs }))) throw new Error('MA Julio report no longer proves exact current pickup.');
  const supplementalSignals = [...esplandaRows, ...juliosRows].map(row => {
    const esplandaSource = MA_ESPLANDA_PRODUCTS.find(source => source.id === row.raw?.esplandaSourceId);
    const julios = !esplandaSource && row.storeId === MA_JULIOS_SOURCE.storeId;
    const source = esplandaSource || (julios ? MA_JULIOS_SOURCE : null);
    if (!source) throw new Error('MA supplemental row is not from a registered source.');
    return { ...row, sourceProductBinding: {
      schemaVersion: 1, source: esplandaSource ? 'massachusetts-esplanda' : 'massachusetts-julios',
      sourceId: esplandaSource?.id || MA_JULIOS_SOURCE.id,
      merchantId: row.merchantId, storeId: row.storeId, storeAddress: row.storeAddress,
      productId: row.productId, optionId: row.variantId, sourceUrl: row.sourceUrl,
      rawName: row.rawName, canonicalBottleId: row.canonicalBottleId, canonicalName: row.canonicalName,
      price: row.price, observedAt: row.observedAt, premisesVerified: true, pickupOfferVerified: true,
      identityMethod: esplandaSource?.identity.identityMethod || 'exact_bible_match',
      quantitySemantics: 'binary_retailer_orderable_no_exact_count',
    } };
  });
  const supplementalDrops = buildDrops(supplementalSignals, bibleLookup(bible.records), supplementalSignals)
    .map(row => ({ ...row, previewOnly: true, canAlertAsInventory: false,
    canAlertAsWatch: false, eligibleForOnSite: true, eligibleForDropFeed: true, eligibleForWatch: false,
    eligibleForDelivery: false, eligibleForEmail: false, eligibleForSms: false }));
  const drops = [...city.drops, ...supplementalDrops];
  const locationMap = new Map();
  for (const source of MA_ESPLANDA_PRODUCTS) locationMap.set(source.storeId, {
    id: source.storeId, storeId: source.storeId, name: source.storeName, storeName: source.storeName,
    address: source.address, storeAddress: source.address, city: source.city, state: 'MA', zip: source.zip,
    lat: source.lat, lng: source.lng, type: 'store', locationType: 'store', precision: 'store_level', searchable: true,
  });
  locationMap.set(MA_JULIOS_SOURCE.storeId, { id: MA_JULIOS_SOURCE.storeId, storeId: MA_JULIOS_SOURCE.storeId,
    name: MA_JULIOS_SOURCE.storeName, storeName: MA_JULIOS_SOURCE.storeName, address: MA_JULIOS_SOURCE.address,
    storeAddress: MA_JULIOS_SOURCE.address, city: MA_JULIOS_SOURCE.city, state: 'MA', lat: MA_JULIOS_SOURCE.lat,
    lng: MA_JULIOS_SOURCE.lng, type: 'store', locationType: 'store', precision: 'store_level', searchable: true });
  for (const location of city.locations) locationMap.set(location.storeId, location);
  const locations = [...locationMap.values()];
  if (drops.length !== 7 || locations.length !== 5 || drops.some(row => row.canAlertAsInventory !== false
    || row.canAlertAsWatch !== false || row.eligibleForDelivery !== false || row.eligibleForEmail !== false
    || row.eligibleForSms !== false || row.quantityIsExact !== false)) throw new Error('MA isolated preview must contain seven silent binary rows across five exact premises.');
  return { generatedAt: cityReport.finishedAt, drops, locations, sourceEvidence: {
    cityHiveRun: CITY_RUN, esplandaRun: ESPLANDA_RUN, currentBibleSha256: currentBibleSha,
    cityHiveSourceBibleSha256: bibleBinding.sourceBibleSha,
    cityHiveArtifactSha256: cityProvenance.artifactDigest, esplandaArtifactSha256: esplandaProvenance.artifactDigest,
    cityHiveHeadSha: cityProvenance.headSha, cityHiveReportFinishedAt: cityReport.finishedAt,
    esplandaReportFinishedAt: report.finishedAt, originalSourceClocksPreserved: true,
    alertDeliveryEnabled: false, productionSnapshotPublicationEnabled: false,
  } };
}

async function main() {
  const arg = flag => process.argv.find(value => value.startsWith(`${flag}=`))?.slice(flag.length + 1);
  const cityArtifactDir = arg('--city-artifact-dir'), esplandaArtifactDir = arg('--esplanda-artifact-dir');
  const cityProofPath = arg('--city-provenance'), esplandaProofPath = arg('--esplanda-provenance');
  if (!cityArtifactDir || !esplandaArtifactDir || !cityProofPath || !esplandaProofPath) throw new Error('MA preview requires both hosted shadow artifacts and provenance files.');
  const bible = await BourbonBible.load(arg('--bible') || undefined);
  const result = await prepareMassachusettsCanary({ cityArtifactDir, cityProvenance: JSON.parse(await readFile(cityProofPath, 'utf8')),
    esplandaArtifactDir, esplandaProvenance: JSON.parse(await readFile(esplandaProofPath, 'utf8')), bible });
  const config = withResearchLifecycle(JSON.parse(await readFile('../src/config/state-lifecycle.json', 'utf8')));
  config.states.MA = { ...config.states.MA, publicStatus: 'active', lifecycle: 'canary_preview', coverageTier: 'sparse_live_store_inventory',
    refinementLevel: 'store', inventoryAlertable: false, watchAlertable: false, promotionStage: 'canary' };
  const candidate = { schemaVersion: 1, state: 'MA', generatedAt: result.generatedAt, scope: 'isolated_canary_input_no_production_activation',
    drops: result.drops, locations: result.locations, sourceEvidence: result.sourceEvidence };
  await mkdir(path.dirname('data/canary-inputs/MA.json'), { recursive: true });
  await writeFile('data/canary-inputs/MA.json', JSON.stringify(candidate, null, 2) + '\n');
  await mkdir(path.dirname('out/canary-preparation/MA/lifecycle-research.json'), { recursive: true });
  await writeFile('out/canary-preparation/MA/lifecycle-research.json', JSON.stringify(config, null, 2) + '\n');
  const manifest = JSON.parse(await readFile('data/state-integration/MA.json', 'utf8'));
  const runUrl = process.env.CANARY_RUN_URL;
  if (!runUrl || !/^https:\/\/github\.com\/tarsagent22\/Bourbon-Signal\/actions\/runs\/\d+$/.test(runUrl)) {
    throw new Error('MA canary requires the repository workflow run URL.');
  }
  manifest.evidence.canary = { status: 'verified', runs: 1, artifact: runUrl,
    sourceEvidence: result.sourceEvidence, allDeliveryChannelsDisabled: true };
  manifest.customerPaths.coverage = { status: 'verified', assertion: 'The isolated hosted canary presents the five reviewed Massachusetts premises in Coverage and the state filter.' };
  manifest.customerPaths.finder = { status: 'verified', assertion: 'The isolated hosted canary presents all five reviewed premises with their exact store name and address in Finder.' };
  await mkdir('out/canary-preparation/MA/state-integration', { recursive: true });
  await writeFile('out/canary-preparation/MA/state-integration/MA.json', JSON.stringify(manifest, null, 2) + '\n');
  await mkdir('out/canary-preparation/MA/state-fixtures', { recursive: true });
  await copyFile('data/state-fixtures/MA.json', 'out/canary-preparation/MA/state-fixtures/MA.json');
  await mkdir('out/canary/MA/source-evidence', { recursive: true });
  await writeFile('out/canary/MA/source-evidence/manifest.json', JSON.stringify(result.sourceEvidence, null, 2) + '\n');
  console.log(JSON.stringify({ state: 'MA', rows: result.drops.length, stores: result.locations.length,
    sourceRuns: [CITY_RUN, ESPLANDA_RUN], productionActivationAllowed: false, alertsEnabled: false }));
}

if (import.meta.url === (process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '')) main().catch(error => { console.error(error.stack || error.message); process.exit(1); });
