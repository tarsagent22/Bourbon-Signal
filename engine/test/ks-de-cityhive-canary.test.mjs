import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {BourbonBible} from '../src/core/bible.mjs';
import {prepareCentralCityHiveCanary} from '../src/prepare-central-cityhive-canary.mjs';
import {CENTRAL_CITYHIVE_RESEARCH_SOURCES} from '../src/collectors/central-cityhive-research-premises.mjs';
import {buildCurrentInventoryAlertsFromDrops} from '../src/export-site-contract.mjs';
import {buildCanaryPreviewPayload} from '../src/build-state-canary-preview.mjs';
import {withResearchLifecycle} from '../src/research-state-registry.mjs';
import {verifyStateIntegration} from '../src/verify-state-integration.mjs';

const fixtureRoot=fileURLToPath(new URL('./fixtures/ks-de-cityhive/',import.meta.url));
const bible=await BourbonBible.load(new URL('../out/bourbon-bible.json',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

for(const state of ['KS','DE'])test(`${state} retained CityHive receipts replay with exact premise, identity, and original clocks`,async t=>{
  const manifest=JSON.parse(await readFile(path.join(fixtureRoot,state,'manifest.json'),'utf8'));
  const sources=CENTRAL_CITYHIVE_RESEARCH_SOURCES.filter(source=>source.state===state);
  assert.equal(manifest.state,state);
  assert.equal(manifest.shadowOnly,true);
  assert.equal(manifest.productionActivationAllowed,false);
  assert.equal(manifest.customerDeliveryAllowed,false);
  assert.equal(manifest.bibleRecordsSha256,sha(Buffer.from(JSON.stringify(bible.records||[]))));
  assert.ok(/^[a-f0-9]{64}$/.test(manifest.originalReportSha256));
  assert.equal(manifest.sources.length,sources.length);
  assert.equal(manifest.requests.length,manifest.receipts.length);
  assert.equal(manifest.receipts.length,state==='KS'?6:4);
  for(const receipt of manifest.receipts){
    const original=manifest.originalSourceReceipts.find(row=>row.url===receipt.url);
    assert.ok(original,'compact receipt retains a link to the actual source capture');
    assert.equal(receipt.observedAt,original.observedAt);
    assert.ok(original.verifiedLocalBytes>receipt.bytes);
    assert.match(original.verifiedLocalSha256,/^[a-f0-9]{64}$/);
  }
  const report={state,finishedAt:manifest.finishedAt,sources:manifest.sources,signals:[{id:'untrusted-report-row',tier:'unicorn',price:1}],metadata:{
    complete:true,shadowOnly:true,productionActivationAllowed:false,customerDeliveryAllowed:false,
    requests:manifest.requests,receipts:manifest.receipts,bibleRecordsSha256:manifest.bibleRecordsSha256,origin:manifest.origin,
  }};
  const before=structuredClone(report);
  const provenance={status:'verified_github_shadow_artifact',state,repository:'tarsagent22/Bourbon-Signal',
    workflowRunId:String(manifest.origin.workflowRunId),headSha:manifest.origin.commitSha,artifactId:'456',artifactDigest:'b'.repeat(64)};
  const nowMs=Date.parse(manifest.finishedAt)+60_000;
  t.mock.timers.enable({apis:['Date'],now:nowMs});
  const result=await prepareCentralCityHiveCanary({state,report,reportDirectory:path.join(fixtureRoot,state),bible,provenance,nowMs});
  assert.deepEqual(report,before,'preparation does not mutate its immutable source report');
  assert.equal(result.generatedAt,manifest.finishedAt);
  assert.equal(result.originalSourceClockPreserved,true);
  assert.equal(result.locations.length,sources.length);
  assert.equal(result.sourceReceipts.length,manifest.receipts.length);
  assert.ok(result.drops.length>0);
  assert.ok(result.drops.every(row=>row.id!=='untrusted-report-row'));
  assert.ok(result.drops.every(row=>sources.some(source=>source.storeId===row.storeId&&source.address===row.storeAddress)));
  assert.ok(result.drops.every(row=>result.sourceReceipts.some(receipt=>receipt.observedAt===row.observedAt)));
  assert.ok(result.drops.every(row=>row.previewOnly&&row.eligibleForOnSite&&!row.canAlertAsInventory&&!row.canAlertAsWatch
    &&!row.eligibleForWatch&&!row.eligibleForDelivery&&!row.eligibleForEmail&&!row.eligibleForSms&&row.quantity===0&&row.quantityIsExact===false));
  assert.equal(buildCurrentInventoryAlertsFromDrops(result.drops).length,0);
  const fixture=JSON.parse(await readFile(new URL(`../data/state-fixtures/${state}.json`,import.meta.url),'utf8'));
  const integration=JSON.parse(await readFile(new URL(state==='KS'?'../data/ks-cityhive-canary-manifest.json':`../data/state-integration/${state}.json`,import.meta.url),'utf8'));
  const productionLifecycle=JSON.parse(await readFile(new URL('../../src/config/state-lifecycle.json',import.meta.url),'utf8'));
  const previewLifecycle=withResearchLifecycle(productionLifecycle);
  previewLifecycle.activeStates=[...new Set([...previewLifecycle.activeStates,state])];
  previewLifecycle.states[state]={...previewLifecycle.states[state],publicStatus:'active',promotionStage:'canary'};
  const preview=buildCanaryPreviewPayload({state,candidateDrops:result.drops,candidateLocations:result.locations,candidateGeneratedAt:result.generatedAt,
    base:{manifest:{},drops:{drops:[]},stateIndex:{states:[]},alerts:{alerts:[]},stats:{stateCoverage:{states:[]}},locations:{locations:[]}}});
  const integrationResult=verifyStateIntegration({state,config:previewLifecycle,manifest:integration,fixtures:fixture,
    site:{manifest:preview.manifest,drops:preview.drops,stateIndex:preview.stateIndex,stateDrops:{[state]:preview.stateDrops},
      alerts:preview.alerts,stats:preview.stats,locations:preview.locations,previewPolicy:preview.previewPolicy},sourceFiles:{},promotionEvidenceRequired:false});
  assert.deepEqual(integrationResult,{ok:true,failures:[]},integrationResult.failures.join('; '));
  if(state==='KS'){
    assert.deepEqual(result.drops.map(row=>[row.storeName,row.city,row.canonicalName,row.tier]).sort(),[
      ['Kings Liquor','Olathe','Weller Special Reserve','allocated'],
      ['RJ Liquor','Wichita','Elijah Craig Barrel Proof','limited'],
      ['RJ Liquor','Wichita','Larceny Barrel Proof','limited'],
      ["Vern's Retail Liquor",'Topeka','Larceny Barrel Proof','limited'],
    ]);
  }else{
    assert.equal(result.drops.length,4);
    assert.ok(result.drops.every(row=>row.tier==='limited'));
    assert.deepEqual(new Set(result.drops.map(row=>row.canonicalName)),new Set(['Elijah Craig Barrel Proof','Larceny Barrel Proof']));
  }
  const missing=structuredClone(report);missing.metadata.receipts=missing.metadata.receipts.filter(receipt=>
    new URL(receipt.url).searchParams.get('merchant-id')!==sources.at(-1).merchantId);
  missing.metadata.requests=missing.metadata.requests.filter(request=>
    new URL(request.url).searchParams.get('merchant-id')!==sources.at(-1).merchantId);
  await assert.rejects(()=>prepareCentralCityHiveCanary({state,report:missing,reportDirectory:path.join(fixtureRoot,state),bible,provenance,nowMs}),/Partial per-store/);
  const wrongLibrary=structuredClone(report);wrongLibrary.metadata.bibleRecordsSha256='0'.repeat(64);
  await assert.rejects(()=>prepareCentralCityHiveCanary({state,report:wrongLibrary,reportDirectory:path.join(fixtureRoot,state),bible,provenance,nowMs}),/library-mismatched/);
});
