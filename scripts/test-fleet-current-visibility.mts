import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {mock} from 'node:test';
import {BourbonBible} from '../engine/src/core/bible.mjs';
import {canonicalizeSignal} from '../engine/src/operational-report.mjs';
import {bibleLookup,buildDrops,buildCurrentInventoryAlertsFromDrops} from '../engine/src/export-site-contract.mjs';
import {mergePartialRefreshDrops,mergeHistoricalBoardShipmentDrops,mergeHistoricalTimelineDrops} from '../engine/src/partial-refresh-contract.mjs';
import {buildStateDropPartitions,verifyStateDropPartitions} from '../engine/src/site-state-partitions.mjs';
import {collectWesternGroceryProductionSource} from '../engine/src/collectors/western-grocery-production.mjs';
import {collectCentralCityHiveProductionSource} from '../engine/src/collectors/central-cityhive-production.mjs';
import {syntheticPromotedGroceryConfig,syntheticPromotionManifest,mockedCompleteGroceryFetch} from '../engine/test/helpers/synthetic-grocery-promotion.mjs';
import {syntheticCentralPromotion,mockedCentralFetch} from '../engine/test/helpers/synthetic-central-production.mjs';
import * as siteModule from '../src/lib/site-engine-contract.ts';
import * as classificationModule from '../src/lib/drop-classification.ts';
import * as evidenceModule from '../src/lib/public-drop-evidence.ts';
import * as coverageModule from '../src/lib/coverage-model.ts';
import * as harnessModule from '../apps/mobile/src/astra-test-harness.ts';
import * as feedModule from '../src/lib/signals/signal-route.ts';
const interop=<T>(value:T):T=>(value as {default?:T}).default||value;
const {normalizeDropForSite}=interop(siteModule),{getDropClassificationIndex,classifyPublicDrop}=interop(classificationModule);
const {isPublicDropFeedEligible,isFreshPublicDrop}=interop(evidenceModule),{buildCoverageContract}=interop(coverageModule);
const {loadWithMocks}=interop(harnessModule),{createSignalFeedHandler}=interop(feedModule);
const fixture=JSON.parse(readFileSync('engine/test/fixtures/fleet-visibility/current-ca-id-ia.json','utf8'));
const now=Date.parse(fixture.sourceGeneratedAt);mock.timers.enable({apis:['Date'],now});
// Offline schemas combine existing source identity fixtures with exact records
// captured with the CA/ID/IA rows; a seed-only or missing live out/ is valid.
const records=new Map();
for(const file of ['california-grocery-expansion/identity.json','washington-xapi-expansion/identity.json','new-mexico-grocery-expansion/identity.json']){
 for(const record of JSON.parse(readFileSync('engine/test/fixtures/'+file,'utf8')).records)records.set(record.id,record);
}
for(const record of fixture.records)records.set(record.id,record);
const bible=new BourbonBible([...records.values()]),lookup=bibleLookup(bible.records);
const index=getDropClassificationIndex(JSON.parse(readFileSync('src/data/drop-feed-classification.generated.json','utf8')).records);
const directory=await mkdtemp(path.join(tmpdir(),'fleet-visibility-'));
try {
 // Only synthetic promotion schemas and fixture fetchers; no source HTTP or activation.
 const waConfig=syntheticPromotedGroceryConfig('WA'),wiOptions=syntheticCentralPromotion('WI');
 const wa=await collectWesternGroceryProductionSource({id:'WA'},bible,{lifecycleConfig:waConfig,promotionManifest:syntheticPromotionManifest('WA',waConfig),
  cacheDir:path.join(directory,'wa-cache'),incidentDir:path.join(directory,'wa-incidents'),cursorDir:path.join(directory,'wa-cursor'),sleep:async()=>{},fetchText:mockedCompleteGroceryFetch('WA')});
 const wi=await collectCentralCityHiveProductionSource({id:'WI'},bible,{...wiOptions,cacheDir:path.join(directory,'wi-cache'),incidentDir:path.join(directory,'wi-incidents'),
  cursorDir:path.join(directory,'wi-cursor'),sleep:async()=>{},fetchText:mockedCentralFetch()});
 assert.ok(wa.signals.length>0&&wi.signals.length>0);
 const targets=[...fixture.signals,wa.signals[0],wi.signals[0]].map(s=>canonicalizeSignal(s,bible));
 assert.deepEqual(targets.map(s=>s.state),['CA','ID','IA','WA','WI']);
 for(let i=0;i<fixture.signals.length;i++){assert.equal(targets[i].canonicalBottleId,fixture.signals[i].canonicalBottleId);assert.equal(targets[i].observedAt,fixture.signals[i].observedAt);}
 const noLongerCurrent=targets.filter(s=>['WA','WI'].includes(s.state));
 assert.equal(buildDrops(noLongerCurrent,lookup,targets.filter(s=>!['WA','WI'].includes(s.state))).length,0,'complete current source with no positive row must not reuse prior onsite stock');
 const template={state:'PA',rawName:'1792 Full Proof',canonicalName:'1792 Full Proof',canonicalBottleId:targets[0].canonicalBottleId,
  sourceLabel:'Synthetic fleet depth fixture',sourceUrl:'https://fixture.invalid/fleet',eventType:'store_inventory_aggregate',locationPrecision:'store_aggregate',
  quantity:1,warehouseQty:1,price:47.99,canAlertAsInventory:false,canAlertAsWatch:false,observedAt:new Date(now-86400000).toISOString(),confidence:.9};
 const history=Array.from({length:10_050},(_,i)=>canonicalizeSignal({...template,id:'history-'+i,locationName:'Synthetic aggregate '+i},bible));
 const historicalPool=[...history,...targets];
 const fromHistory=buildDrops(historicalPool,lookup,targets);
 for(const state of ['CA','ID','IA','WA','WI'])assert.ok(fromHistory.some(row=>row.state===state),state+' lost to historical fleet depth');
 assert.equal(fromHistory.filter(row=>row.state==='PA').length,10_000,'only optional context retains the row cap');
 const currentNoise=Array.from({length:10_050},(_,i)=>canonicalizeSignal({...template,id:'current-'+i,locationName:'Synthetic current aggregate '+i,observedAt:fixture.sourceGeneratedAt},bible));
 const current=[...currentNoise,...targets],projected=buildDrops(current,lookup,current);
 assert.equal(projected.length,10_055,'every admitted current row survives, rather than inflating a fixed cap');
 const protectedRows=Array.from({length:10_000},(_,i)=>({id:'protected-'+i,state:'VA',observedAt:new Date(now-86400000).toISOString(),canAlertAsInventory:true}));
 const targetDrops=projected.filter(row=>row.state!=='PA');
 const merged=mergePartialRefreshDrops({currentDrops:targetDrops,currentSourceDrops:targetDrops,previousDrops:protectedRows,
  attemptedStateIds:['VA','CA','ID','IA','WA','WI'],fallbackStateIds:['VA']});
 assert.equal(merged.length,10_005);assert.equal(merged.filter(row=>row.state==='VA').length,10_000);
 const final=mergeHistoricalTimelineDrops({now:fixture.sourceGeneratedAt,currentDrops:mergeHistoricalBoardShipmentDrops({now:fixture.sourceGeneratedAt,currentDrops:merged,currentSourceDrops:targetDrops})});
 assert.equal(final.length,merged.length,'later history merges must not re-truncate protected/current rows');
 for(const target of targetDrops)assert.deepEqual(final.find(row=>row.id===target.id),target,'source clocks/proofs changed');
 const partitions=buildStateDropPartitions(final,{contractVersion:'fixture',generatedAt:fixture.sourceGeneratedAt,activeStates:['CA','ID','IA','WA','WI','VA']});
 assert.deepEqual(verifyStateDropPartitions(final,partitions),{ok:true,errors:[]});
 const normalized=projected.map(row=>classifyPublicDrop(normalizeDropForSite(row),index));
 for(const state of ['CA','ID','IA','WA','WI'])assert.ok(normalized.some(row=>row.state===state&&isPublicDropFeedEligible(row)&&isFreshPublicDrop(row)),state+' fails actual normalized/classified gate');
 const lifecycle=structuredClone(waConfig);lifecycle.activeStates.push('WI');lifecycle.states.WI=wiOptions.lifecycleConfig.states.WI;
 const coverage=buildCoverageContract({lifecycle,stateRows:['CA','ID','IA','WA','WI'].map(state=>({state,status:'useful',bestLocationPrecision:'store_level',coverageTier:'sparse_live_store_inventory'})),
  drops:normalized,generatedAt:fixture.sourceGeneratedAt,asOf:fixture.sourceGeneratedAt});
 for(const state of ['CA','ID','WA','WI'])assert.ok(coverage.states.find(row=>row.code===state)!.freshness.currentInventoryStores>0,state+' lost in Coverage');
 assert.ok(coverage.states.find(row=>row.code==='IA')!.freshness.freshPublicUpdates>0);assert.equal(coverage.states.find(row=>row.code==='IA')!.freshness.currentInventoryStores,0);
 const duplicateA=canonicalizeSignal({...template,id:'first-identical-projection',sourceLabel:'Alpha',locationName:'Duplicate premise',observedAt:fixture.sourceGeneratedAt},bible);
 const duplicateB=canonicalizeSignal({...template,id:'second-identical-projection',sourceLabel:'Beta',locationName:'Duplicate premise',observedAt:fixture.sourceGeneratedAt},bible);
 const duplicates=buildDrops([duplicateA,duplicateB],lookup,[duplicateA,duplicateB]);
 assert.equal(duplicates.length,1);assert.equal(duplicates[0].sourceLabel,'Alpha','Set dedup must retain the same first duplicate as findIndex');
 const payload={drops:projected,generatedAt:fixture.sourceGeneratedAt};
 const route=(member=true)=>loadWithMocks('src/app/api/drops/route.ts',{
  'next/server':{NextResponse:Response},'next/cache':{unstable_cache:(fn:Function)=>fn},
  '@clerk/nextjs/server':{auth:async()=>({userId:member?'fixture-member':null}),clerkClient:async()=>({users:{getUser:async()=>({publicMetadata:{}})}})},
  '@/lib/activeStates':{ACTIVE_ENGINE_STATE_NAMES:{CA:'California',ID:'Idaho',IA:'Iowa',WA:'Washington',WI:'Wisconsin',PA:'Pennsylvania'}},
  '@/lib/server-entitlements':{getServerEntitlements:async()=>({tier:'barrel',feedPreviewLimit:null,canUseStateFilter:true,canUseAdvancedFilters:true,canUseBottleSearch:true,canUseDropFeedFilters:true})},
  '@/lib/source-lane-runtime':{readRuntimeSourceDropOverlay:async(rows:unknown[])=>({drops:rows,version:'fleet-fixture'})},
  '@/lib/site-engine-contract':{normalizeDropForSite,readSiteExportIdentity:async()=> 'fleet-fixture',readSiteExportResults:async()=>[{payload,snapshotId:'fleet-fixture',source:'remote-snapshot'},{payload:{generatedAt:fixture.sourceGeneratedAt}}],siteExportHeaders:()=>({})},
  '@/lib/retailer-public-submissions':{readCachedPublicRetailerSubmissions:async()=>[]},
 });
 const paid=route();for(const state of ['CA','ID','IA','WA','WI']){const response=await paid.GET(new Request('https://fixture.test/api/drops?state='+state));assert.equal(response.status,200);
  const page=await response.json();assert.equal(page.drops.length,1,state+' actual full-fleet Drop route');
  assert.equal((await route(false).GET(new Request('https://fixture.test/api/drops?state='+state))).status,403);}
 const feed=createSignalFeedHandler({getDrops:(request:Request)=>paid.GET(request),getSightings:async()=>Response.json({sightings:[],totalSightings:0})});
 for(const state of ['CA','ID','IA','WA','WI']){const response=await feed(new Request('https://fixture.test/api/v1/signals?view=market&state='+state));assert.equal(response.status,200);const page=await response.json();assert.equal(page.signals.length,1);}
 const onsite=targetDrops.filter(row=>['WA','WI'].includes(row.state));assert.ok(onsite.every(row=>row.quantity===0&&row.eligibleForOnSite===true&&!row.canAlertAsInventory&&!row.canAlertAsWatch&&!row.eligibleForDelivery));
 assert.equal(buildCurrentInventoryAlertsFromDrops(onsite).length,0);
 console.log('Fleet regression passed: >10000 admitted current rows and historical context, exact CA/ID/IA + nonpreview WA/WI survive full export/merge/partitions/normalization/classification/paid Feed/Coverage; original clocks and normal anonymous403 preserved. All source fetches/promotion schemas are test fixtures.');
} finally {mock.timers.reset();await rm(directory,{recursive:true,force:true});}
