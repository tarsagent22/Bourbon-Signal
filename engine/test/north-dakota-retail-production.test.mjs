import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { BourbonBible } from '../src/core/bible.mjs';
import { bibleLookup, buildDrops, isSafePublicSignal } from '../src/export-site-contract.mjs';
import { STATE_LIFECYCLE_CONFIG } from '../src/state-lifecycle.mjs';
import { verifyNorthDakotaFirstPublication } from '../src/verify-nd-first-publication.mjs';
import {
  NORTH_DAKOTA_CITYHIVE_RUNTIME,
  NORTH_DAKOTA_GROCERY_RUNTIME,
  NORTH_DAKOTA_RETAIL_COHORT_SHA256,
  NORTH_DAKOTA_RETAIL_CONFIG,
  NORTH_DAKOTA_RETAIL_SOURCE_IDS,
  collectNorthDakotaRetailProductionState,
  northDakotaRetailProductionAllowed,
  northDakotaRetailSourceConfigHash,
} from '../src/collectors/north-dakota-retail-production.mjs';

const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));
const held = JSON.parse(await readFile(new URL('./fixtures/north-dakota/joint-run-43647207025.json', import.meta.url), 'utf8'));
const citySignal = held.reportSignals.find(row => row.sourceProductBinding?.source === 'central-cityhive');
const grocerySignals = held.reportSignals.filter(row => row.sourceProductBinding?.source === 'grocery-xapi');
const proofAt = Date.parse(held.reportFinishedAt) + 10_000;
const proofIso = new Date(proofAt).toISOString();

function promotionContext() {
  const previewUrl = 'https://nd-canary-preview.vercel.app';
  const lifecycle = structuredClone(STATE_LIFECYCLE_CONFIG);
  lifecycle.activeStates = [...new Set([...lifecycle.activeStates, 'ND'])];
  lifecycle.states.ND = { customerLabel: 'North Dakota', publicStatus: 'active', promotionStage: 'active',
    inventoryAlertable: false, watchAlertable: false, promotionEvidence: null };
  const manifest = { state: 'ND', lifecycle: { publicStatus: 'active', refinementLevel: 'store' },
    collector: { cohortSha256: NORTH_DAKOTA_RETAIL_COHORT_SHA256, sourceIds: [...NORTH_DAKOTA_RETAIL_SOURCE_IDS] },
    storeIdentity: { exactPremisesOnly: true },
    sourceSemantics: { inventoryAlertable: false, watchAlertable: false }, customerPaths: { delivery: false }, evidence: {} };
  const immutable = { schemaVersion: 1, state: 'ND', generatedAt: proofIso,
    sourceConfigHash: northDakotaRetailSourceConfigHash(manifest), previewUrl,
    shadowRuns: Array.from({ length: 3 }, (_, i) => ({ status: 'success', runId: `shadow-${i}`, artifactHash: String(i).repeat(64) })),
    canaryRuns: Array.from({ length: 2 }, (_, i) => ({ status: 'success', runId: `canary-${i}`, artifactHash: String(i + 3).repeat(64) })),
    provenance: { status: 'success', repository: 'tarsagent22/Bourbon-Signal', workflowRunId: '123', artifactId: '456',
      commitSha: 'a'.repeat(40), artifactDigest: 'b'.repeat(64), bundleDigest: 'c'.repeat(64),
      workflowRunUrl: 'https://github.com/tarsagent22/Bourbon-Signal/actions/runs/123', artifactName: 'provenance-ND-123' } };
  manifest.evidence.immutablePromotionEvidence = immutable;
  const evidence = { shadowRuns: 3, canaryRuns: 2, verifiedAt: proofIso,
    verticalSliceManifest: 'engine/data/state-integration/ND.json', fixtureContract: 'engine/data/state-fixtures/ND.json',
    canaryPreviewUrl: previewUrl, immutableEvidence: immutable };
  lifecycle.states.ND.promotionEvidence = evidence;
  return { lifecycleConfig: lifecycle, promotionManifest: manifest, env: {} };
}

function cityHiveObservation() {
  const row = structuredClone(citySignal);
  row.sourceRuntimeId = 'precision:nd';
  delete row.sourceProductBinding.shadowOnly;
  delete row.raw.shadowOnly;
  const urls = ['bourbon', "Blanton's Gold"].map(term =>
    `https://rockbottleshop.com/shop/?ch-query=${encodeURIComponent(term)}&merchant-id=67c8a2e465e7a028cb538073`);
  return { metadata: { complete: true, selectedStores: [row.storeId], requests: urls.map(url => ({ sourceId: 'rock-bottle-shop:67c8a2e465e7a028cb538073',
      ok: true, status: 200, url })), verifiedPremises: [row.storeId],
    receipts: urls.map(url => ({ url, finalUrl: url, status: 200, observedAt: row.observedAt, bytes: 100, sha256: 'd'.repeat(64) })) }, signals: [row] };
}

function groceryObservation() {
  const endpoint = 'https://www.albertsons.com/abs/pub/xapi/search/substitute';
  const receipt = (term, observedAt) => {
    const url = new URL(endpoint);
    url.search = new URLSearchParams({ 'request-id': '1', url: url.origin, pageurl: url.origin, pagename: 'search',
      rows: '100', start: '0', 'search-type': 'keyword', storeid: '28', featured: 'true', 'search-uid': '', q: term,
      channel: 'instore', banner: 'albertsons' }).toString();
    return { url: url.href, finalUrl: url.href, status: 200, observedAt, bytes: 100, sha256: 'e'.repeat(64),
      storeId: 'albertsons:28', term };
  };
  const observedAt = grocerySignals[0].observedAt;
  return { signals: structuredClone(grocerySignals), plan: { terms: ["blanton's gold"] }, unconfirmedQueries: [],
    receipts: [{ url: 'https://local.albertsons.com/nd/williston/20-26th-st-e/Beer-Wine-Liquor.html',
      finalUrl: 'https://local.albertsons.com/nd/williston/20-26th-st-e/Beer-Wine-Liquor.html', status: 200, observedAt,
      storeId: 'albertsons:28', bytes: 100, sha256: 'f'.repeat(64) }, receipt('bourbon', observedAt), receipt("blanton's gold", observedAt)] };
}

test('North Dakota production admission remains closed without authoritative lifecycle and immutable evidence', async () => {
  assert.equal(northDakotaRetailProductionAllowed(), false);
  const calls = [];
  const result = await collectNorthDakotaRetailProductionState(NORTH_DAKOTA_RETAIL_CONFIG, bible, {
    collectCityHiveObservation: async () => { calls.push('cityhive'); throw new Error('must stay gated'); },
    collectGroceryObservation: async () => { calls.push('grocery'); throw new Error('must stay gated'); },
  });
  assert.equal(result.status, 'not_promoted');
  assert.equal(result.metadata.blockedByPromotion, true);
  assert.equal(result.metadata.requestCount, 0);
  assert.equal(result.metadata.allDeliveryDisabled, true);
  assert.deepEqual(calls, []);
  const approved = promotionContext();
  assert.equal(northDakotaRetailProductionAllowed(approved.lifecycleConfig, approved), true);
  const disabled = { ...approved, env: { BOURBON_SIGNAL_DISABLED_STATES: 'ND' } };
  assert.equal(northDakotaRetailProductionAllowed(approved.lifecycleConfig, disabled), false);
  const wrongCohort = structuredClone(approved.promotionManifest); wrongCohort.collector.sourceIds.pop();
  assert.equal(northDakotaRetailProductionAllowed(approved.lifecycleConfig, { ...approved, promotionManifest: wrongCohort }), false);
});

test('North Dakota keeps its two exact retail sources independently healthy and non-alertable', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'north-dakota-retail-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const approved = promotionContext();
  const nowMs = proofAt;
  const result = await collectNorthDakotaRetailProductionState(NORTH_DAKOTA_RETAIL_CONFIG, bible, {
    ...approved, nowMs, incidentDirectory: directory, attemptsFile: path.join(directory, 'attempts.json'),
    sourceRunnerOptions: { now: () => proofIso, sleep: async () => {} },
    collectCityHiveObservation: async () => cityHiveObservation(),
    collectGroceryObservation: async () => groceryObservation(),
  });
  assert.equal(result.status, 'useful');
  assert.equal(result.metadata.complete, true);
  assert.equal(result.sources.length, 2);
  assert.deepEqual(result.sources.map(source => source.sourceRuntimeId).sort(), [...NORTH_DAKOTA_RETAIL_SOURCE_IDS].sort());
  assert.equal(result.signals.length, 3);
  assert.deepEqual(new Set(result.signals.map(row => row.city)), new Set(['Grand Forks', 'Williston']));
  assert.ok(result.signals.every(row => row.quantity === 0 && row.quantityIsExact === false
    && row.canAlertAsInventory === false && row.canAlertAsWatch === false && row.alertable === false
    && row.eligibleForOnSite === true && row.eligibleForDropFeed === true && row.eligibleForWatch === false
    && row.eligibleForDelivery === false && row.eligibleForEmail === false && row.eligibleForSms === false));
  assert.equal(result.lastGoodAt, '2026-11-14T22:16:44.262Z');
  assert.deepEqual(result.metadata.sourceHealth.map(row => row.sourceRuntimeId).sort(), [...NORTH_DAKOTA_RETAIL_SOURCE_IDS].sort());
  assert.equal(result.metadata.allDeliveryDisabled, true);
  const currentProjectionRows=result.signals.map(row=>{
    const observedAt=new Date(Date.now()-1_000).toISOString();
    return {...row,observedAt,fetchedAt:observedAt,sourceProductBinding:{...row.sourceProductBinding,observedAt}};
  });
  assert.ok(currentProjectionRows.every(row=>isSafePublicSignal(row)));
  const publicDrops=buildDrops(currentProjectionRows,bibleLookup(bible.records),currentProjectionRows);
  assert.equal(publicDrops.length,3);
  assert.ok(publicDrops.every(row=>row.state==='ND'&&row.quantity===0&&row.quantityIsExact===false
    &&row.canAlertAsInventory===false&&row.canAlertAsWatch===false));
  const published={...result,startedAt:'2026-11-14T22:16:43.000Z',finishedAt:held.reportFinishedAt};
  const sample={state:'ND',count:result.signals.length,drops:result.signals};
  const verified=verifyNorthDakotaFirstPublication(published,sample,bible,{nowMs});
  assert.equal(verified.publishedStores,2);
  assert.equal(verified.indexedSearches.length,2);
  const altered=structuredClone(sample);
  altered.drops[0].price+=1;
  assert.throws(()=>verifyNorthDakotaFirstPublication(published,altered,bible,{nowMs}),/source time/);
  const incomplete=structuredClone(published);
  incomplete.metadata.sourceObservations[NORTH_DAKOTA_GROCERY_RUNTIME].receipts.pop();
  assert.throws(()=>verifyNorthDakotaFirstPublication(incomplete,sample,bible,{nowMs}),/both complete/);
});

test('a failed North Dakota sibling preserves its own stale fallback without masking a fresh source', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'north-dakota-retail-fallback-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const approved = promotionContext();
  const successful = await collectNorthDakotaRetailProductionState(NORTH_DAKOTA_RETAIL_CONFIG, bible, {
    ...approved, nowMs: proofAt, incidentDirectory: directory, attemptsFile: path.join(directory, 'attempts.json'),
    sourceRunnerOptions: { now: () => proofIso, sleep: async () => {} },
    collectCityHiveObservation: async () => cityHiveObservation(), collectGroceryObservation: async () => groceryObservation(),
  });
  const cityRows = successful.signals.filter(row => row.sourceRuntimeId === NORTH_DAKOTA_CITYHIVE_RUNTIME);
  const groceryRows = successful.signals.filter(row => row.sourceRuntimeId === NORTH_DAKOTA_GROCERY_RUNTIME);
  const previousSourceResults = {
    [NORTH_DAKOTA_CITYHIVE_RUNTIME]: { value: { signals: cityRows, metadata: { source: 'cityhive' }, observedAt: successful.lastGoodAt },
      lastGoodAt: successful.lastGoodAt, checkedAt: successful.lastGoodAt, status: 'success' },
    [NORTH_DAKOTA_GROCERY_RUNTIME]: { value: { signals: groceryRows, metadata: { source: 'albertsons' }, observedAt: successful.lastGoodAt },
      lastGoodAt: successful.lastGoodAt, checkedAt: successful.lastGoodAt, status: 'success' },
  };
  const partial = await collectNorthDakotaRetailProductionState(NORTH_DAKOTA_RETAIL_CONFIG, bible, {
    ...approved, nowMs: proofAt, previousSourceResults, incidentDirectory: directory, attemptsFile: path.join(directory, 'attempts.json'),
    sourceRunnerOptions: { now: () => proofIso, sleep: async () => {} },
    collectCityHiveObservation: async () => { throw new Error('Grand Forks test outage'); },
    collectGroceryObservation: async () => groceryObservation(),
  });
  assert.equal(partial.status, 'partial_useful');
  assert.equal(partial.metadata.complete, false);
  assert.equal(partial.sources.find(row => row.sourceRuntimeId === NORTH_DAKOTA_CITYHIVE_RUNTIME).ok, false);
  assert.equal(partial.sources.find(row => row.sourceRuntimeId === NORTH_DAKOTA_GROCERY_RUNTIME).ok, true);
  assert.ok(partial.signals.some(row => row.sourceRuntimeId === NORTH_DAKOTA_CITYHIVE_RUNTIME && row.stale === true
    && row.observedAt === successful.lastGoodAt && row.canAlertAsInventory === false && row.canAlertAsWatch === false));
  assert.ok(partial.signals.some(row => row.sourceRuntimeId === NORTH_DAKOTA_GROCERY_RUNTIME && row.stale !== true
    && row.observedAt === grocerySignals[0].observedAt));
  assert.equal(partial.lastGoodAt, null);
  assert.equal(partial.metadata.allDeliveryDisabled, true);
});
