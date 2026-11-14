import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ALL_STATE_SOURCES,STATE_SOURCES} from '../src/state-sources.mjs';
import {STATE_LIFECYCLE_CONFIG} from '../src/state-lifecycle.mjs';
import {verifySouthDakotaFirstPublication} from '../src/verify-sd-first-publication.mjs';
import {collectSouthDakotaProductionState,SOUTH_DAKOTA_PRODUCTION_COHORT_SHA256,southDakotaProductionConfigHash} from '../src/collectors/south-dakota-production.mjs';
import {reviewSouthDakotaPickup} from '../src/research-south-dakota-retailer.mjs';
import {sources,storeId,southDakotaRetailerRequest,southDakotaProductionRuntimeId} from '../src/south-dakota-pickup-policy.mjs';

const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'fixtures','south-dakota-sante');
const terms=new Map([['Wild Turkey','west.json'],['Heaven Hill','south-heaven-hill.json'],['Larceny','south-larceny.json']]);
const names=['Wild Turkey 101 8Y .75l','Heaven Hill Bottled-in-Bond 7 Year','Larceny Barrel Proof'];
const bible={records:names.map((canonical,index)=>({id:`sd-${index}`,canonical,libraryAlertEligible:true,
  libraryIdentities:[{id:`sd-${index}`,canonicalName:canonical,aliases:[],isAlertEligible:true,nationalTier:'limited'}]})),
  match(name){const record=this.records.find(row=>row.canonical===name);return record?{record,confidence:1}:null;}};

function projectedReport(nowMs=Date.now()){
  const observedAt=new Date(nowMs-15_000).toISOString(),signals=[],requests=[];
  for(const source of sources)for(const term of source.terms){
    const payload=readFileSyncFixture(terms.get(term));
    const checked=reviewSouthDakotaPickup(payload,source.id,bible,observedAt,southDakotaRetailerRequest(term));
    assert.ok(checked);for(const signal of checked.signals)signals.push({...signal,sourceRuntimeId:southDakotaProductionRuntimeId,
      sourceProductBinding:{...signal.sourceProductBinding,shadowOnly:false,productionOnSiteOnly:true,productionCohortSha256:SOUTH_DAKOTA_PRODUCTION_COHORT_SHA256},
      raw:{productionOnSiteOnly:true},canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,eligibleForOnSite:true,
      eligibleForDropFeed:true,eligibleForWatch:false,eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false});
    requests.push({storeId:storeId(source),query:term,url:southDakotaRetailerRequest(term),status:200,ok:true,observedAt,
      sha256:createHash('sha256').update('receipt:'+term).digest('hex')});
  }
  const startedAt=new Date(nowMs-30_000).toISOString(),finishedAt=new Date(nowMs).toISOString();
  return{state:'SD',status:'useful',stale:false,startedAt,finishedAt,lastGoodAt:observedAt,signals,
    metadata:{allDeliveryDisabled:true,southDakota:{complete:true,selectedStores:sources.map(storeId),verifiedPremises:sources.map(storeId),
      requests,sourceObservedAt:observedAt,cohortSha256:SOUTH_DAKOTA_PRODUCTION_COHORT_SHA256,productionAlertDeliveryAllowed:false}}};
}

const fixtureCache=new Map();
function readFileSyncFixture(name){return fixtureCache.get(name);}

function syntheticPromotion(){
  const canaryPreviewUrl='https://sd-preview.example.invalid';
  const shadowRuns=Array.from({length:3},(_,index)=>({runId:String(100+index),status:'success',artifactHash:'a'.repeat(64)}));
  const canaryRuns=Array.from({length:2},(_,index)=>({runId:String(200+index),status:'success',artifactHash:'b'.repeat(64)}));
  const immutableEvidence={schemaVersion:1,state:'SD',generatedAt:new Date().toISOString(),sourceConfigHash:southDakotaProductionConfigHash(),
    previewUrl:canaryPreviewUrl,shadowRuns,canaryRuns,provenance:{status:'success',repository:'tarsagent22/Bourbon-Signal',workflowRunId:'300',artifactId:'400',
      commitSha:'c'.repeat(40),artifactDigest:'d'.repeat(64),bundleDigest:'e'.repeat(64),
      workflowRunUrl:'https://github.com/tarsagent22/Bourbon-Signal/actions/runs/300',artifactName:'state-promotion-provenance-SD-300'}};
  const lifecycleConfig={...STATE_LIFECYCLE_CONFIG,activeStates:['SD'],states:{...STATE_LIFECYCLE_CONFIG.states,SD:{publicStatus:'active',inventoryAlertable:false,
    watchAlertable:false,promotionEvidence:{shadowRuns:3,canaryRuns:2,verifiedAt:new Date().toISOString(),canaryPreviewUrl,
      verticalSliceManifest:'engine/data/state-integration/SD.json',fixtureContract:'engine/data/state-fixtures/SD.json',immutableEvidence}}}};
  const manifest={state:'SD',previewUrl:canaryPreviewUrl,lifecycle:{publicStatus:'active',refinementLevel:'store'},collector:{sourceIds:[southDakotaProductionRuntimeId],
    cohortSha256:SOUTH_DAKOTA_PRODUCTION_COHORT_SHA256,sourceConfigHash:southDakotaProductionConfigHash()},
    storeIdentity:{mode:'exact_reviewed_store_pickup',expectedKnownStores:2,storeIds:sources.map(storeId)},
    sourceSemantics:{inventoryAlertable:false,watchAlertable:false},evidence:{immutablePromotionEvidence:immutableEvidence}};
  return{lifecycleConfig,manifest};
}

test('South Dakota recurring production adapter reparses exact current positives and remains silent',async t=>{
  for(const filename of terms.values())if(!fixtureCache.has(filename))fixtureCache.set(filename,await readFile(path.join(root,filename),'utf8').then(JSON.parse));
  const dir=await mkdtemp(path.join(os.tmpdir(),'sd-production-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const nowMs=Date.parse('2026-11-14T21:36:00.000Z'),{lifecycleConfig,manifest}=syntheticPromotion(),calls=[];
  const result=await collectSouthDakotaProductionState(ALL_STATE_SOURCES.find(row=>row.id==='SD'),bible,{nowMs,lifecycleConfig,promotionManifest:manifest,
    incidentFile:path.join(dir,'state.json'),fetchText:async(url,options)=>{
      const term=JSON.parse(new URL(url).searchParams.get('input'))['2'].json.text;calls.push(term);
      await options.onResponse({status:200,retryAfterSeconds:0});
      return{status:200,url,text:JSON.stringify(fixtureCache.get(terms.get(term)))};
    }});
  assert.deepEqual(calls,['Wild Turkey','Heaven Hill','Larceny']);assert.equal(result.status,'useful');assert.equal(result.signals.length,3);
  assert.ok(result.signals.every(row=>row.sourceRuntimeId===southDakotaProductionRuntimeId&&row.sourceProductBinding.productionOnSiteOnly
    &&row.sourceProductBinding.shadowOnly===false&&row.canAlertAsInventory===false&&row.canAlertAsWatch===false
    &&row.eligibleForOnSite===true&&row.eligibleForDropFeed===true&&row.eligibleForDelivery===false&&row.quantity===0));
  assert.equal(result.metadata.southDakota.requests.length,3);assert.equal(result.metadata.allDeliveryDisabled,true);
  const ledger=JSON.parse(await readFile(path.join(dir,'state.json'),'utf8'));
  assert.equal(Date.parse(ledger.nextAllowedAt)-Date.parse(ledger.lastAttemptAt),30*60_000);assert.equal(ledger.inFlight,null);
});

test('South Dakota production denial persists before response and blocks the exact host for 24 hours',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'sd-denial-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const nowMs=Date.now(),{lifecycleConfig,manifest}=syntheticPromotion(),incidentFile=path.join(dir,'state.json');let calls=0;
  const options={nowMs,lifecycleConfig,promotionManifest:manifest,incidentFile,fetchText:async(url,request)=>{
    calls++;await request.onResponse({status:429,retryAfterSeconds:0});return{status:429,url,text:''};
  }};
  await assert.rejects(collectSouthDakotaProductionState(ALL_STATE_SOURCES.find(row=>row.id==='SD'),bible,options),/exact pickup verification failed/);
  let ledger=JSON.parse(await readFile(incidentFile,'utf8'));const host='www.mrliquor.com';
  assert.equal(ledger.hosts[host].httpStatus,429);
  assert.ok(Date.parse(ledger.hosts[host].nextAllowedAt)-Date.parse(ledger.hosts[host].lastAttemptAt)>=24*60*60_000);
  assert.equal(ledger.inFlight,null);
  await assert.rejects(collectSouthDakotaProductionState(ALL_STATE_SOURCES.find(row=>row.id==='SD'),bible,{...options,nowMs:Date.now()+1000}),/source host is denied/);
  assert.equal(calls,1,'denied storefront is not retried');
});

test('South Dakota production adapter is dormant in the registered candidate lifecycle',async()=>{
  assert.ok(ALL_STATE_SOURCES.some(row=>row.id==='SD'));
  assert.ok(!STATE_SOURCES.some(row=>row.id==='SD'));
  assert.equal(STATE_LIFECYCLE_CONFIG.states.SD.publicStatus,'research_only');
  let requests=0;
  const result=await collectSouthDakotaProductionState(ALL_STATE_SOURCES.find(row=>row.id==='SD'),bible,{fetchText:async()=>{requests++;}});
  assert.equal(result.status,'not_promoted');assert.equal(result.metadata.allDeliveryDisabled,true);assert.equal(requests,0);
});

test('South Dakota first-publication verifier binds the fresh one-city report and silent partition',async()=>{
  for(const filename of terms.values())fixtureCache.set(filename,await readFile(path.join(root,filename),'utf8').then(JSON.parse));
  const nowMs=Date.parse('2026-11-14T21:36:00.000Z'),report=projectedReport(nowMs),drops=report.signals.map(row=>({...row}));
  const reportBytes=JSON.stringify(report),partition={state:'SD',count:drops.length,drops},partitionBytes=JSON.stringify(partition);
  const result=verifySouthDakotaFirstPublication({report,partition,reportBytes,partitionBytes,nowMs,workflowRunId:'43643508900'});
  assert.equal(result.ok,true,result.failures.join('; '));
  assert.equal(result.receipt.publishedRows,3);assert.equal(result.receipt.publishedStores,2);assert.deepEqual(result.receipt.cities,['Rapid City']);
  assert.equal(result.receipt.indexedRows,3);assert.equal(result.receipt.allDeliveryChannelsDisabled,true);
  assert.equal(result.receipt.sourceReportSha256,createHash('sha256').update(reportBytes).digest('hex'));
  const modified=structuredClone(partition);modified.drops[0].eligibleForDelivery=true;
  assert.equal(verifySouthDakotaFirstPublication({report,partition:modified,nowMs,workflowRunId:'43643508900'}).ok,false);
  const statewide=structuredClone(partition);statewide.drops[0].city='Sioux Falls';
  assert.equal(verifySouthDakotaFirstPublication({report,partition:statewide,nowMs,workflowRunId:'43643508900'}).ok,false);
  const missing=structuredClone(report);missing.metadata.southDakota.requests.pop();
  assert.equal(verifySouthDakotaFirstPublication({report:missing,partition,nowMs,workflowRunId:'43643508900'}).ok,false);
});
