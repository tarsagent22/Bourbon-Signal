import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BourbonBible} from '../engine/src/core/bible.mjs';
import {canonicalizeSignal} from '../engine/src/operational-report.mjs';
import {buildDrops,bibleLookup,buildStores,buildCurrentInventoryAlertsFromDrops} from '../engine/src/export-site-contract.mjs';
import {collectWesternGroceryProductionSource} from '../engine/src/collectors/western-grocery-production.mjs';
import {collectCentralCityHiveProductionSource} from '../engine/src/collectors/central-cityhive-production.mjs';
import {collectLouisianaAlaskaGroceryProductionSource} from '../engine/src/collectors/louisiana-alaska-grocery-production.mjs';
import {collectNewEnglandProductionSource} from '../engine/src/collectors/new-england-production.mjs';
import * as westernFixture from '../engine/test/helpers/synthetic-grocery-promotion.mjs';
import * as centralFixture from '../engine/test/helpers/synthetic-central-production.mjs';
import * as laakFixture from '../engine/test/helpers/synthetic-louisiana-alaska-promotion.mjs';
import * as neFixture from '../engine/test/helpers/synthetic-new-england-production.mjs';
import * as siteModule from '../src/lib/site-engine-contract.ts';
import * as classModule from '../src/lib/drop-classification.ts';
import * as evidenceModule from '../src/lib/public-drop-evidence.ts';
import * as coverageModule from '../src/lib/coverage-model.ts';
import * as knownModule from '../src/lib/coverage-known-stores.ts';
import * as receiptModule from '../src/lib/nationwide-pilot-receipt.ts';
import * as harnessModule from '../apps/mobile/src/astra-test-harness.ts';
import * as signalModule from '../src/lib/signals/signal-route.ts';
import * as lifecycleModule from '../src/config/stateLifecycle.ts';
const interop=(v:any)=>v.default||v;
const {normalizeDropForSite,normalizeStoreForSite}=interop(siteModule),{classifyPublicDrop,getDropClassificationIndex}=interop(classModule);
const {normalizePublicDropEvidenceInput,isPublicDropFeedEligible,isCurrentInventoryEvidence,publicDropDegradedStateReasons,derivePublicDropEvidence}=interop(evidenceModule);
const {buildCoverageContract}=interop(coverageModule),{loadWithMocks}=interop(harnessModule),{createSignalFeedHandler}=interop(signalModule);
const {STATE_LIFECYCLE_CONFIG}=interop(lifecycleModule);
const fixture=JSON.parse(readFileSync('scripts/fixtures/native-overdue-sibling/nm-40965098976.json','utf8'));
assert.equal(fixture.currentSignals.length,35);assert.equal(fixture.expiredSignal.id,'d28f74815b083d67');
assert.deepEqual(fixture.stateHealth.anomalyCodes,['inventory_confirmation_overdue']);assert.equal(fixture.stateHealth.fallback.status,'none');
assert.equal(fixture.stateHealth.evidenceFreshness.inventory.freshCount,35);assert.equal(fixture.stateHealth.evidenceFreshness.inventory.overdueCount,1);
const RealDate=Date,originalFetch=globalThis.fetch,asOf=fixture.asOf,nowMs=RealDate.parse(asOf);
class ArchiveDate extends RealDate {constructor(value?:any){super(value===undefined?nowMs:value);}static now(){return nowMs;}}
globalThis.Date=ArchiveDate as any;
globalThis.fetch=async()=>{throw Error('Retailer/provider HTTP is forbidden in this offline regression');};
const index=getDropClassificationIndex(JSON.parse(readFileSync('src/data/drop-feed-classification.generated.json','utf8')).records);
const normalized=(rows:any[])=>rows.map(row=>normalizePublicDropEvidenceInput(classifyPublicDrop(normalizeDropForSite(row),index)));
const options=(state:string,health:any[])=>({asOf,degradedStateCodes:new Set([state]),degradedStateReasons:publicDropDegradedStateReasons(health)});
const overdue=(state:string)=>[{state,status:'degraded',staleReason:'inventory_confirmation_overdue'}];
const accepted=(rows:any[],state:string,health:any[])=>rows.filter(row=>isPublicDropFeedEligible(row,options(state,health))&&isCurrentInventoryEvidence(row,asOf));
try{
 const bible=new BourbonBible(fixture.bibleRecords),operational=fixture.currentSignals.map((r:any)=>canonicalizeSignal(r,bible)),current=buildDrops(operational,bibleLookup(bible.records),operational);
 const historical=canonicalizeSignal(fixture.expiredSignal,bible),rows=normalized([...current,historical]);
 assert.equal(current.length,35);assert.equal(rows.length,36);assert.equal(rows.at(-1).observedAt,fixture.expiredSignal.observedAt);assert.equal(rows.at(-1).sourceStale,true);
 const actualHealth=fixture.stats.refreshHealth.degradedStates,strict=accepted(rows,'NM',actualHealth);assert.equal(strict.length,35);assert.equal(new Set(strict.map((r:any)=>r.storeId)).size,16);
 assert.equal(isPublicDropFeedEligible(rows.at(-1),options('NM',actualHealth)),false,'actual expired historical sibling stays excluded');
 assert.equal(derivePublicDropEvidence(rows,asOf,options('NM',actualHealth)).get('NM')!.independentFreshPublicSignalCount,35);
 assert.equal(accepted(rows,'NM',[{state:'NM',status:'degraded'}]).length,0,'reasonless state remains blocked');
 const stores=buildStores(operational).filter((row:any)=>row.state==='NM').map(normalizeStoreForSite),model={lifecycle:STATE_LIFECYCLE_CONFIG,stateRows:fixture.stats.stateCoverage.states,stores,locations:stores,drops:rows,degradedStates:actualHealth,healthLimited:false,asOf};
 const contract=buildCoverageContract(model).states.find((r:any)=>r.code==='NM')!;assert.equal(contract.freshness.currentInventoryStores,16);assert.equal(contract.capabilities.currentBottleAvailability,true);assert.equal(contract.capabilities.restockAlerts,false);
 assert.equal(buildCoverageContract({...model,healthLimited:true}).states.find((r:any)=>r.code==='NM')!.freshness.currentInventoryStores,0,'global snapshot completeness veto survives');
 let revision=0,routeRows=rows,routeHealth=actualHealth;
 const next={'next/server':{NextResponse:Response},'next/cache':{unstable_cache:(fn:Function)=>fn},'server-only':{}};
 const stats=()=>({...fixture.stats,refreshHealth:{...fixture.stats.refreshHealth,degradedStates:routeHealth}});
 const overlay={readRuntimeSourceDropOverlay:async(base:any[])=>({drops:base,version:'offline-actual-nm-regression'})};
 const site={normalizeDropForSite,readSiteExportIdentity:async()=>`actual-nm-regression-${revision}`,siteExportHeaders:()=>({}),readSiteExportResults:async(names:string[])=>names.map(name=>({source:'remote-snapshot',snapshotId:`actual-nm-regression-${revision}`,payload:name==='drops'?{drops:routeRows,generatedAt:asOf}:name==='stats'?stats():name==='stores'?{stores}:{locations:stores}}))};
 const route=loadWithMocks('src/app/api/drops/route.ts',{...next,'@/lib/site-engine-contract':site,'@/lib/source-lane-runtime':overlay,
  '@clerk/nextjs/server':{auth:async()=>({userId:'offline-fixture-member'}),clerkClient:async()=>({users:{getUser:async()=>({publicMetadata:{}})}})},
  '@/lib/server-entitlements':{getServerEntitlements:async()=>({tier:'barrel',feedPreviewLimit:null,canUseStateFilter:true,canUseAdvancedFilters:true,canUseBottleSearch:true,canUseDropFeedFilters:true})},'@/lib/retailer-public-submissions':{readCachedPublicRetailerSubmissions:async()=>[]}});
 const feed=createSignalFeedHandler({getDrops:(request:any)=>route.GET(request),getSightings:async()=>Response.json({sightings:[],totalSightings:0})});
 const server=loadWithMocks('src/lib/coverage-server.ts',{...next,'@/config/stateLifecycle':{STATE_LIFECYCLE_CONFIG},'@/config/mississippi-known-stores.json':{stores:[]},
  '@/lib/coverage-model':interop(coverageModule),'@/lib/coverage-known-stores':interop(knownModule),'@/lib/public-drop-evidence':interop(evidenceModule),'@/lib/drop-classification':interop(classModule),
  '@/data/drop-feed-classification.generated.json':{records:JSON.parse(readFileSync('src/data/drop-feed-classification.generated.json','utf8')).records},'./nationwide-pilot-receipt':interop(receiptModule),
  '@/lib/retailer-signal-feed':{retailerSubmissionToFeedCard:()=>null},'@/lib/retailer-public-submissions':{readCachedPublicRetailerSubmissions:async()=>[]},'@/lib/source-lane-runtime':overlay,'@/lib/site-engine-contract':site});
 const coverage=loadWithMocks('src/app/api/coverage/route.ts',{...next,'@/lib/coverage-server':server,'@/lib/nationwide-pilot-receipt':interop(receiptModule)});
 async function routeCounts(){const f=await feed(new Request('https://offline.invalid/api/v1/signals?view=market&state=NM')),c=await coverage.GET(new Request('https://offline.invalid/api/coverage'));assert.equal(f.status,200);assert.equal(c.status,200);return{feed:(await f.json()).signals.length,stores:(await c.json()).states.find((r:any)=>r.code==='NM').freshness.currentInventoryStores};}
 assert.deepEqual(await routeCounts(),{feed:35,stores:16});
 for(const store of stores){const response=await coverage.POST(new Request('https://offline.invalid/api/coverage',{method:'POST',body:JSON.stringify({state:'NM',query:store.address||store.name})}));assert.equal(response.status,200);const body=await response.json();assert.ok(body.results.some((r:any)=>r.kind==='store'&&r.storeId===store.id&&r.status==='actively-monitored'),JSON.stringify({storeId:store.id,address:store.address,results:body.results.map((r:any)=>({id:r.storeId,status:r.status,kind:r.kind}))}));}
 for(const reason of['source_access_denied','unresolved_source_attempt','quarantined','unknown_reason']){routeHealth=[...overdue('NM'),{state:'NM',status:'degraded',staleReason:reason}];revision++;assert.deepEqual(await routeCounts(),{feed:0,stores:0},reason);}
 routeHealth=actualHealth;routeRows=rows.filter((r:any)=>r.sourceStale);revision++;assert.deepEqual(await routeCounts(),{feed:0,stores:0},'historical-only output cannot become stock');
 const report:any[]=[];
 for(const state of['WA','NM','WI','OK','LA','AK','MA','CT','RI']){
  const dir=await mkdtemp(path.join(tmpdir(),'native-overdue-fixture-'));assert.ok(dir.startsWith(path.resolve(tmpdir())+path.sep));
  try{
   let source:any,caseBible=bible,promotion:any,fetchText:any;
   if(['WA','NM'].includes(state)){source=collectWesternGroceryProductionSource;caseBible=new BourbonBible(westernFixture.fixture.records);const lifecycle=westernFixture.syntheticPromotedGroceryConfig(state);promotion={lifecycleConfig:lifecycle,promotionManifest:westernFixture.syntheticPromotionManifest(state,lifecycle)};fetchText=westernFixture.mockedCompleteGroceryFetch(state);}
   else if(['WI','OK'].includes(state)){source=collectCentralCityHiveProductionSource;promotion=centralFixture.syntheticCentralPromotion(state);fetchText=centralFixture.mockedCentralFetch();}
   else if(['LA','AK'].includes(state)){source=collectLouisianaAlaskaGroceryProductionSource;caseBible=new BourbonBible(laakFixture.fixture.records);const lifecycle=laakFixture.syntheticPromotedGroceryConfig(state);promotion={lifecycleConfig:lifecycle,promotionManifest:laakFixture.syntheticPromotionManifest(state,lifecycle)};fetchText=laakFixture.mockedCompleteGroceryFetch(state);}
   else{source=collectNewEnglandProductionSource;promotion=neFixture.syntheticNewEnglandPromotion(state);fetchText=neFixture.mockedNewEnglandFetch();}
   const fixtureReport=await source({id:state},caseBible,{...promotion,env:{},forceLive:true,nowMs,sleep:async()=>{},fetchText,cacheDir:path.join(dir,'cache'),incidentDir:path.join(dir,'incidents'),cursorDir:path.join(dir,'cursor')});
   assert.equal(fixtureReport.metadata.complete,true);const op=fixtureReport.signals.map((r:any)=>canonicalizeSignal(r,caseBible)),exported=buildDrops(op,bibleLookup(caseBible.records),op),candidates=normalized(exported);
   const row=candidates.find((r:any)=>isPublicDropFeedEligible(r,{asOf})&&isCurrentInventoryEvidence(r,asOf));assert.ok(row,state+' fixture must exercise strict ordinary production visibility');
   const opts=options(state,overdue(state));assert.equal(isPublicDropFeedEligible(row,opts),true,state+' sole overdue sibling');assert.equal(derivePublicDropEvidence([row],asOf,opts).get(state)!.independentFreshPublicSignalCount,1);
   const omitted=structuredClone(row);delete omitted.quantity;delete omitted.quantity_in_stock;delete omitted.storeQty;delete omitted.store_qty;assert.equal(isPublicDropFeedEligible(omitted,opts),true,state+' full native binary proof permits omitted internal zero');assert.equal(Object.hasOwn(omitted,'quantity'),false,'proof evaluation must not add a displayed quantity');
   const omittedEvidence=derivePublicDropEvidence([omitted],asOf,opts).get(state)!;assert.equal(omittedEvidence.independentFreshPublicSignalCount,1);assert.equal(omittedEvidence.currentInventoryStores.length,1,state+' omitted binary zero still establishes exact current store evidence');
   const futureLifecycle=JSON.parse(readFileSync('engine/test/fixtures/nine-state-admission/lifecycle.json','utf8'));assert.equal(futureLifecycle.activeStates.length,33);
   const omittedCoverage=buildCoverageContract({lifecycle:futureLifecycle,stateRows:[{state,publicStatus:'active',coverageTier:'sparse_live_store_inventory',signalCount:1}],drops:[omitted],stores:[],locations:[],degradedStates:overdue(state),healthLimited:false,asOf}).states.find((r:any)=>r.code===state)!;
   assert.equal(omittedCoverage.freshness.currentInventoryStores,1,state+' future33 Coverage counts the same exact proof as Feed');assert.equal(omittedCoverage.capabilities.currentBottleAvailability,true);assert.equal(omittedCoverage.capabilities.restockAlerts,false);assert.equal(Object.hasOwn(omitted,'quantity'),false);
   const mutations:[string,(r:any)=>void][]=[['stale',r=>{r.stale=true;}],['source-stale',r=>{r.sourceStale=true;}],['quarantine',r=>{r.quarantined=true;}],['nonalert-source',r=>{r.raw.sourceRuntimeNonAlertable=true;}],['fallback',r=>{r.raw.staleFallback=true;}],['cache-fallback',r=>{r.raw.cacheFallback=true;}],['preview',r=>{r.previewOnly=true;}],['research',r=>{r.researchOnly=true;}],['hidden',r=>{r.customerVisible=false;}],['shadow',r=>{r.raw.shadowOnly=true;}],['binding-shadow',r=>{r.sourceProductBinding.shadowOnly=true;}],['premise',r=>{r.storeAddress='1 Foreign Road';}],['store',r=>{r.storeId='foreign';}],['product',r=>{r.productId='foreign';}],['variant',r=>{r.variantId='foreign';r.optionId='foreign';}],['missing-proof',r=>{r.sourceProductBinding=null;}],['marker-only',r=>{r.sourceProductBinding=null;r.sourcePollId='marker';r.sourceLaneId='marker';}],['price',r=>{r.price+=1;}],['onsite',r=>{r.eligibleForOnSite=false;}],['feed',r=>{r.eligibleForDropFeed=false;}],['inventory-alert',r=>{r.canAlertAsInventory=true;}],['watch-alert',r=>{r.canAlertAsWatch=true;}],['snake-alert',r=>{r.can_alert_as_inventory=true;}],['snake-watch',r=>{r.can_alert_as_watch=true;}],['alertable',r=>{r.alertable=true;}],['watch',r=>{r.eligibleForWatch=true;}],['delivery',r=>{r.eligibleForDelivery=true;}],['delivery-alias',r=>{r.deliveryEligible=true;}],['email',r=>{r.eligibleForEmail=true;}],['sms',r=>{r.eligibleForSms=true;}],['expired-original-new-confirmation',r=>{r.observedAt=new RealDate(nowMs-3*3600000).toISOString();r.observed_at=r.observedAt;r.sourceProductBinding.observedAt=r.observedAt;r.lastConfirmedAt=asOf;r.last_confirmed_at=asOf;}],['old-confirmation',r=>{r.lastConfirmedAt=new RealDate(nowMs-3*3600000).toISOString();r.last_confirmed_at=r.lastConfirmedAt;}]];
   for(const[label,mutate]of mutations){const changed=structuredClone(row);changed.raw||={};mutate(changed);assert.equal(isPublicDropFeedEligible(changed,opts),false,state+': '+label);assert.equal(derivePublicDropEvidence([changed],asOf,opts).get(state)?.independentFreshPublicSignalCount||0,0,state+': '+label+' Coverage');}
   const healthCases=[[],[{state,status:'degraded'}],[{state,status:'blocked',staleReason:'inventory_confirmation_overdue'}],[{state,status:'source_access_denied',staleReason:'inventory_confirmation_overdue'}],...['source_access_denied','unresolved_source_attempt','quarantined','unknown_reason'].flatMap(reason=>[[{state,status:'degraded',staleReason:reason}],[{state,status:'degraded',staleReason:'inventory_confirmation_overdue',reasons:[reason]}]])];
   for(const health of healthCases){assert.equal(isPublicDropFeedEligible(row,options(state,health)),false,state+': unknown/mixed/absent/blocked health');}
   assert.equal(buildCurrentInventoryAlertsFromDrops(exported).length,0);assert.ok(candidates.every((r:any)=>r.canAlertAsInventory===false&&r.canAlertAsWatch===false&&r.eligibleForDelivery===false&&r.eligibleForEmail===false&&r.eligibleForSms===false));
   report.push({state,scope:'synthetic_schema_and_captured_native_fixture_controls_not_source_or_promotion_evidence',mutationNegatives:mutations.length,healthNegatives:healthCases.length,omittedBinaryZeroProofOnly:true,independentFreshCount:1,allChannelsFalse:true});
  }finally{await rm(dir,{recursive:true,force:true});}
 }
 console.log(JSON.stringify({scope:'offline_actual_NM_source_health_customer_path_and_explicit_synthetic_family_controls_not_live_publication',actualSourceRun:fixture.source.runId,originalAsOf:asOf,actualFreshRows:35,actualExpiredHistoricalRows:1,normalFeed:35,coverageGetStores:16,exactAddressCoveragePostStores:16,stateHealthWarningRetained:true,authenticatedSession:false,physicalDevice:false,retailerHTTP:0,families:report}));
}finally{globalThis.Date=RealDate;globalThis.fetch=originalFetch;}
