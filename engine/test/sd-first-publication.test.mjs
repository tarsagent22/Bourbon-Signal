import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ALL_STATE_SOURCES,STATE_SOURCES} from '../src/state-sources.mjs';
import {STATE_LIFECYCLE_CONFIG} from '../src/state-lifecycle.mjs';
import sdManifest from '../data/state-integration/SD.json' with {type:'json'};
import {verifySouthDakotaFirstPublication} from '../src/verify-sd-first-publication.mjs';
import {collectSouthDakotaProductionState,SOUTH_DAKOTA_PRODUCTION_COHORT_SHA256,southDakotaProductionConfigHash,southDakotaSemanticManifestHash,southDakotaProductionRuntimeId,southDakotaProductionAllowed} from '../src/collectors/south-dakota-production.mjs';
import {reviewSouthDakotaPickup} from '../src/research-south-dakota-retailer.mjs';
import {southDakotaCanaryLifecycle} from '../src/prepare-sd-pickup-canary.mjs';
import {sources,storeId,southDakotaRetailerRequest,isSouthDakotaProductionOnSiteSignal,productionCohortSha256} from '../src/south-dakota-pickup-policy.mjs';
import {buildCurrentInventoryAlertsFromDrops,buildDrops,buildStores,bibleLookup} from '../src/export-site-contract.mjs';
import {derivePublicDropEvidence,isPublicDropFeedEligible} from '../../src/lib/public-drop-evidence.ts';

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
  const manifest={state:'SD',previewUrl:canaryPreviewUrl,lifecycle:{publicStatus:'active',refinementLevel:'store'},collector:{sourceIds:[southDakotaProductionRuntimeId],
    cohortSha256:SOUTH_DAKOTA_PRODUCTION_COHORT_SHA256,sourceConfigHash:southDakotaProductionConfigHash()},
    storeIdentity:{mode:'exact_reviewed_store_pickup',expectedKnownStores:2,storeIds:sources.map(storeId)},
    sourceSemantics:{inventoryAlertable:false,watchAlertable:false}};
  const immutableEvidence={schemaVersion:1,state:'SD',generatedAt:new Date().toISOString(),sourceConfigHash:southDakotaSemanticManifestHash(manifest),
    previewUrl:canaryPreviewUrl,shadowRuns,canaryRuns,provenance:{status:'success',repository:'tarsagent22/Bourbon-Signal',workflowRunId:'300',artifactId:'400',
      commitSha:'c'.repeat(40),artifactDigest:'d'.repeat(64),bundleDigest:'e'.repeat(64),
      workflowRunUrl:'https://github.com/tarsagent22/Bourbon-Signal/actions/runs/300',artifactName:'state-promotion-provenance-SD-300'}};
  const lifecycleConfig={...STATE_LIFECYCLE_CONFIG,activeStates:['SD'],states:{...STATE_LIFECYCLE_CONFIG.states,SD:{publicStatus:'active',inventoryAlertable:false,
    watchAlertable:false,promotionEvidence:{shadowRuns:3,canaryRuns:2,verifiedAt:new Date().toISOString(),canaryPreviewUrl,
      verticalSliceManifest:'engine/data/state-integration/SD.json',fixtureContract:'engine/data/state-fixtures/SD.json',immutableEvidence}}}};
  manifest.evidence={immutablePromotionEvidence:immutableEvidence};
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

test('South Dakota production rows pass engine and shared customer projections without enabling alerts',async t=>{
  for(const filename of terms.values())if(!fixtureCache.has(filename))fixtureCache.set(filename,await readFile(path.join(root,filename),'utf8').then(JSON.parse));
  const dir=await mkdtemp(path.join(os.tmpdir(),'sd-customer-path-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const nowMs=Date.now(),{lifecycleConfig,manifest}=syntheticPromotion();
  const result=await collectSouthDakotaProductionState(ALL_STATE_SOURCES.find(row=>row.id==='SD'),bible,{nowMs,lifecycleConfig,promotionManifest:manifest,
    incidentFile:path.join(dir,'state.json'),fetchText:async(url,options)=>{
      const term=JSON.parse(new URL(url).searchParams.get('input'))['2'].json.text;
      await options.onResponse({status:200,retryAfterSeconds:0});
      return{status:200,url,text:JSON.stringify(fixtureCache.get(terms.get(term)))};
    }});
  const drops=buildDrops(result.signals,bibleLookup(bible.records),result.signals);
  assert.equal(productionCohortSha256,SOUTH_DAKOTA_PRODUCTION_COHORT_SHA256,'shared customer policy remains bound to the collector cohort');
  assert.equal(drops.length,3,'buildDrops must admit all verified current product rows');
  assert.deepEqual(new Set(drops.map(row=>row.storeAddress)),new Set(sources.map(source=>`${source.address}, Rapid City, SD ${source.zip}`)));
  assert.ok(drops.every(row=>row.state==='SD'&&row.type==='retailer_store_inventory_result'
    &&row.eligibleForOnSite===true&&row.eligibleForDropFeed===true&&row.eligibleForWatch===false
    &&row.eligibleForDelivery===false&&row.eligibleForEmail===false&&row.eligibleForSms===false
    &&row.canAlertAsInventory===false&&row.canAlertAsWatch===false&&row.alertable===false
    &&row.pickupOfferVerified===true&&row.premisesVerified===true
    &&row.inventorySemantics.includes('not an exact shelf count')&&row.inventoryCaveat.includes('exact shelf count')
    &&row.raw?.productionOnSiteOnly===true));
  const stores=buildStores(result.signals).filter(row=>row.state==='SD'&&row.hasSignals);
  assert.equal(stores.length,2);
  assert.deepEqual(new Set(stores.map(row=>row.address)),new Set(drops.map(row=>row.storeAddress)));
  const projectionNow=Date.now()+1000;
  assert.ok(drops.every(row=>isPublicDropFeedEligible(row,{asOf:projectionNow})), `shared customer feed accepts the production projection: direct=${isSouthDakotaProductionOnSiteSignal(drops[0],{nowMs:projectionNow})}`);
  assert.deepEqual(buildCurrentInventoryAlertsFromDrops(drops),[],'the production projection cannot create inventory alerts');
  const evidence=derivePublicDropEvidence(drops,projectionNow).get('SD');
  assert.ok(evidence);
  assert.equal(evidence.currentInventoryStores.length,2);
  assert.equal(evidence.currentInventoryCities,1);
  assert.equal(evidence.alertableInventoryStores.length,0);
  assert.equal(evidence.freshPublicSignalCount,3);
  assert.deepEqual(new Set(evidence.currentInventoryStores.map(store=>store.address)),new Set(drops.map(row=>row.storeAddress)));

  const invalid=[
    {...result.signals[0],sourceRuntimeId:'sd:other'},
    {...result.signals[0],sourceProductBinding:{...result.signals[0].sourceProductBinding,productionCohortSha256:'0'.repeat(64)}},
    {...result.signals[0],storeAddress:'1 Other Road, Rapid City, SD 57702'},
    {...result.signals[0],eligibleForDelivery:true},
    {...result.signals[0],canAlertAsInventory:true},
    {...result.signals[0],previewOnly:true},
    {...result.signals[0],observedAt:new Date(nowMs-2*60*60_000-1).toISOString()},
  ];
  for(const row of invalid){
    assert.deepEqual(buildDrops([row],bibleLookup(bible.records),[row]),[],JSON.stringify(row));
    assert.equal(isPublicDropFeedEligible({...drops[0],...row,observedAt:row.observedAt},{asOf:projectionNow}),false);
  }
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

test('South Dakota keeps runtime config and immutable semantic manifest hashes independent',()=>{
  const {lifecycleConfig,manifest}=syntheticPromotion();
  assert.notEqual(southDakotaProductionConfigHash(),southDakotaSemanticManifestHash(manifest));
  assert.equal(southDakotaProductionAllowed({lifecycleConfig,manifest}),true);
  const wrongRuntime=structuredClone(manifest);wrongRuntime.collector.sourceConfigHash='0'.repeat(64);
  assert.equal(southDakotaProductionAllowed({lifecycleConfig,manifest:wrongRuntime}),false);
  const wrongSemantic=structuredClone(manifest);wrongSemantic.evidence.immutablePromotionEvidence.sourceConfigHash='1'.repeat(64);
  assert.equal(southDakotaProductionAllowed({lifecycleConfig,manifest:wrongSemantic}),false);
});

test('South Dakota canary replay stays research-only when activation candidate config is active',()=>{
  const production=structuredClone(STATE_LIFECYCLE_CONFIG);
  production.activeStates=[...production.activeStates,'SD'];
  production.states.SD={customerLabel:'South Dakota',publicStatus:'active',shadowEligible:false,lifecycle:'retailer_store_inventory',
    coverageTier:'sparse_live_store_inventory',refinementLevel:'store',inventoryAlertable:false,watchAlertable:false};
  const preview=southDakotaCanaryLifecycle(production);
  assert.ok(!preview.activeStates.includes('SD'));
  assert.equal(preview.states.SD.publicStatus,'research_only');
  assert.equal(preview.states.SD.inventoryAlertable,false);
  assert.equal(preview.states.SD.watchAlertable,false);
});

test('South Dakota active candidate remains blocked without immutable promotion proof',async()=>{
  assert.ok(ALL_STATE_SOURCES.some(row=>row.id==='SD'));
  assert.ok(STATE_SOURCES.some(row=>row.id==='SD'));
  assert.equal(STATE_LIFECYCLE_CONFIG.states.SD.publicStatus,'active');
  const lifecycleConfig=structuredClone(STATE_LIFECYCLE_CONFIG);delete lifecycleConfig.states.SD.promotionEvidence;
  const manifest=structuredClone(sdManifest);delete manifest.evidence;const source=ALL_STATE_SOURCES.find(row=>row.id==='SD');
  assert.equal(southDakotaProductionAllowed({lifecycleConfig,manifest}),false);
  let requests=0;
  const result=await collectSouthDakotaProductionState(source,bible,{lifecycleConfig,promotionManifest:manifest,fetchText:async()=>{requests++;}});
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
