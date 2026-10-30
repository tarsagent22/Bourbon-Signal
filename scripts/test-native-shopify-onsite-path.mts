import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
import{mock}from'node:test';
import{BourbonBible}from'../engine/src/core/bible.mjs';import{NATIVE_PICKUP_PREPARATION_SOURCES}from'../engine/src/native-shopify-preparation-policy.mjs';
import{collectClosedNativePickupObservation}from'../engine/src/collectors/native-shopify-onsite.mjs';import{isNativeShopifyOnSiteSignal}from'../engine/src/native-shopify-onsite-policy.mjs';
import{prepareNativeShopifyCanary,buildNativeShopifyCanaryPayload}from'../engine/src/prepare-native-shopify-canary.mjs';
import{canonicalizeSignal}from'../engine/src/operational-report.mjs';import{buildDrops,bibleLookup,dropHasPositiveAlertInventory}from'../engine/src/export-site-contract.mjs';
import*as entitlementModule from'../src/lib/entitlements.ts';
import*as siteModule from'../src/lib/site-engine-contract.ts';import*as evidenceModule from'../src/lib/public-drop-evidence.ts';
import{buildStores,buildCurrentInventoryAlertsFromDrops}from'../engine/src/export-site-contract.mjs';
import{syntheticNativeAdmission}from'../engine/test/helpers/synthetic-native-shopify.mjs';
import{STATE_LIFECYCLE_CONFIG}from'../engine/src/state-lifecycle.mjs';
import*as classModule from'../src/lib/drop-classification.ts';import*as coverageModule from'../src/lib/coverage-model.ts';
import*as matcherModule from'../src/lib/monitoring-scope-matcher.ts';import*as scopesModule from'../src/lib/monitoring-scopes.ts';
import*as harness from'../apps/mobile/src/astra-test-harness.ts';import*as feedModule from'../src/lib/signals/signal-route.ts';
import*as directoryModule from'../src/lib/sighting-store-directory-core.ts';
import*as knownModule from'../src/lib/coverage-known-stores.ts';import*as receiptModule from'../src/lib/nationwide-pilot-receipt.ts';
const interop=<T>(value:T):T=>(value as{default?:T}).default||value;const{normalizeDropForSite}=interop(siteModule),{isPublicDropFeedEligible}=interop(evidenceModule);
const records=[];for(const file of ['engine/test/fixtures/native-shopify-preparation/bible.json','engine/test/fixtures/pogos-dallas-native-pickup/bible.json'])records.push(...JSON.parse(await readFile(file,'utf8')).records);
const savedFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Offline native customer fixture forbids network/provider I/O');};
const bible=new BourbonBible([...new Map(records.map(row=>[row.id,row])).values()]),results=[];
mock.timers.enable({apis:['Date'],now:Date.parse(NATIVE_PICKUP_PREPARATION_SOURCES[0].clock)});
try{for(const source of NATIVE_PICKUP_PREPARATION_SOURCES){
 const nowMs=Math.max(...source.receipts.map(row=>Date.parse(row.observedAt)))+30000;mock.timers.setTime(nowMs);
 const bodies=new Map(await Promise.all(source.receipts.map(async receipt=>[receipt.url,await readFile('engine/test/fixtures/'+source.base+receipt.artifactPath,'utf8')])));
 const candidate=await prepareNativeShopifyCanary({sourceId:source.definition.runtimeId,captures:source.receipts.map(receipt=>({...receipt,text:bodies.get(receipt.url)})),bible,nowMs});assert.equal(candidate.drops.length,1);
 const collected=await collectClosedNativePickupObservation(source.definition.runtimeId,bible,{observedAt:candidate.drops[0].observedAt,fetchText:async url=>({ok:true,status:200,url,text:bodies.get(url)})});
 const canonical=collected.signals.map(row=>canonicalizeSignal(row,bible));assert.equal(isNativeShopifyOnSiteSignal(canonical[0],{nowMs}),true,'canonical native proof stays valid');
 const drops=buildDrops(canonical,bibleLookup(bible.records),canonical);assert.deepEqual(drops,candidate.drops,'actual raw canary projection is the normal customer input');assert.equal(drops.length,1,'actual nonpreview public export preserves binary on-site availability');assert.deepEqual(buildDrops(canonical,bibleLookup(bible.records),[]),[],'missing current keys cannot renew old native stock');
 const preview=buildNativeShopifyCanaryPayload({candidate,baseDrops:[{state:'TX',sourceRuntimeId:'tx:hotspot-austin',storeId:'hotspot-existing'}],nowMs});assert.equal(preview.drops.length,2);assert.equal(preview.drops[0].storeId,'hotspot-existing');assert.equal(preview.lifecycleChanged,false);assert.equal(preview.stateHealthChanged,false);
 for(const field of ['staleFallback','cacheFallback','sourceRuntimeNonAlertable','shadowOnly','researchOnly']){
  const rejected=canonicalizeSignal({...collected.signals[0],raw:{...collected.signals[0].raw,[field]:true}},bible);assert.equal(rejected.sourceStale,true);assert.equal(buildDrops([rejected],bibleLookup(bible.records),[rejected]).length,0,field);
 }
 const disabledBible=new BourbonBible(bible.records.map(row=>({...row,libraryAlertEligible:false}))),disabled=canonicalizeSignal(collected.signals[0],disabledBible);assert.equal(disabled.sourceStale,true);assert.equal(buildDrops([disabled],bibleLookup(disabledBible.records),[disabled]).length,0,'canonicalization cannot restore a disabled current library identity');
 const normalized=normalizeDropForSite(drops[0]);assert.equal(isNativeShopifyOnSiteSignal(normalized,{nowMs}),true);assert.equal(isPublicDropFeedEligible(normalized,{asOf:nowMs}),true);
 assert.equal(dropHasPositiveAlertInventory(drops[0]),false);for(const field of ['canAlertAsInventory','canAlertAsWatch','eligibleForDelivery','eligibleForEmail','eligibleForSms'])assert.equal(normalized[field],false,field);
 for(const mutation of [{stale:true},{quarantined:true},{variantId:'wrong'},{productId:'wrong'},{storeAddress:'neighbor'},{sourceProductBinding:{...normalized.sourceProductBinding,sizeMl:50}},{sourceProductBinding:{...normalized.sourceProductBinding,pickupSha256:'not-a-hash'}},{observedAt:new Date(nowMs).toISOString()},{eligibleForDelivery:true},{quantity:1}])assert.equal(isPublicDropFeedEligible({...normalized,...mutation},{asOf:nowMs}),false,JSON.stringify(mutation));
 await verifyCustomerPath(source,drops,canonical,new Date(nowMs).toISOString());
 results.push({sourceId:source.definition.runtimeId,scope:'offline_captured_asof_nonpreview_pipeline_not_current_or_admission',originalClock:source.clock,publicFixtureRows:drops.length,customerStoresAdded:0,sourceHttpRequests:0});
}}finally{mock.timers.reset();globalThis.fetch=savedFetch;}console.log(JSON.stringify(results));

async function verifyCustomerPath(source:any,drops:any[],canonical:any[],at:string){
 const {getEntitlements}=interop(entitlementModule);
 const state=source.definition.state,{classifyPublicDrop,getDropClassificationIndex}=interop(classModule),{buildCoverageContract,searchCoverageTargets}=interop(coverageModule);
 const {normalizeStoreForSite,listStates}=interop(siteModule),{isCurrentInventoryEvidence,normalizePublicDropEvidenceInput}=interop(evidenceModule);
 const {loadWithMocks}=interop(harness),{createSignalFeedHandler}=interop(feedModule),{candidateMatchesMonitoringScopes}=interop(matcherModule),{monitoringScopesFromPreferences}=interop(scopesModule);
 const index=getDropClassificationIndex(JSON.parse(await readFile('src/data/drop-feed-classification.generated.json','utf8')).records);
 const rows=drops.map(row=>normalizePublicDropEvidenceInput(classifyPublicDrop(normalizeDropForSite(row),index)));
 assert.equal(rows.filter(row=>isPublicDropFeedEligible(row)&&isCurrentInventoryEvidence(row)).length,1);assert.equal(buildCurrentInventoryAlertsFromDrops(drops).length,0);
 const stores=buildStores(canonical).filter(row=>row.state===state&&row.signalCount>0).map(normalizeStoreForSite);assert.equal(stores.length,1);
 const lifecycle=state==='MI'?syntheticNativeAdmission(source.definition.runtimeId).config:STATE_LIFECYCLE_CONFIG;
 const stateRows=[{state,publicStatus:'active',coverageTier:'sparse_live_store_inventory',signalCount:1}],args={lifecycle,stateRows,stores,locations:stores,drops:rows,degradedStates:[],healthLimited:false,asOf:at};
 const coverage=buildCoverageContract(args).states.find(row=>row.code===state)!;assert.equal(coverage.scope.inventoryMonitoredStores,1);assert.equal(coverage.capabilities.currentBottleAvailability,true);assert.equal(coverage.capabilities.restockAlerts,false);
 for(const reason of ['inventory_confirmation_overdue','source_access_denied','source_blocked','unresolved_attempt','quarantined']){
  const health={...args,drops:rows.map(row=>({...row,sourcePollId:'invented-marker',sourceLaneId:'invented-marker'})),degradedStates:[{state,status:'degraded',staleReason:reason}]};
  assert.equal(buildCoverageContract(health).states.find(row=>row.code===state)!.scope.inventoryMonitoredStores,0,'Markers cannot bypass '+reason);
 }
 assert.equal(isPublicDropFeedEligible(rows[0],{asOf:Date.parse(rows[0].observedAt)+3600001}),false,'One-hour original native clock is never renewed');
 assert.ok(searchCoverageTargets({...args,stateCode:state,query:stores[0].address}).some(row=>row.storeId===stores[0].id));
 const scopes=monitoringScopesFromPreferences({states:[state],monitoringScopes:[{type:'store',id:`store:${state}:${stores[0].id}`,state,label:stores[0].name}]});assert.equal(candidateMatchesMonitoringScopes(rows[0],scopes),true);assert.equal(candidateMatchesMonitoringScopes({...rows[0],storeId:'elsewhere',store_id:'elsewhere'},scopes),false);
 const role={userId:'offline-native-fixture' as string|null,paid:true};
 const route=loadWithMocks('src/app/api/drops/route.ts',{'next/server':{NextResponse:Response},'next/cache':{unstable_cache:(fn:Function)=>fn},
  '@clerk/nextjs/server':{auth:async()=>({userId:role.userId}),clerkClient:async()=>({users:{getUser:async()=>({publicMetadata:{}})}})},
  '@/lib/server-entitlements':{getServerEntitlements:async()=>getEntitlements(role.paid?'standard':'free')},
  '@/lib/source-lane-runtime':{readRuntimeSourceDropOverlay:async(base:unknown[])=>({drops:base,version:'offline-native-fixture'})},
  '@/lib/site-engine-contract':{normalizeDropForSite,readSiteExportIdentity:async()=> 'offline-native-fixture',readSiteExportResults:async()=>[{payload:{drops,generatedAt:at},snapshotId:'offline-native-fixture',source:'remote-snapshot'},{payload:{generatedAt:at}}],siteExportHeaders:()=>({})},
  '@/lib/retailer-public-submissions':{readCachedPublicRetailerSubmissions:async()=>[]}});
 const feed=createSignalFeedHandler({getDrops:(request)=>route.GET(request),getSightings:async()=>Response.json({sightings:[],totalSightings:0})});
 const response=await feed(new Request('https://fixture.test/api/v1/signals?view=market&state='+state));assert.equal(response.status,200);const signalBody=await response.json();assert.equal(signalBody.signals.length,1);assert.equal(signalBody.signals[0].location.store.id,stores[0].id);assert.deepEqual(signalBody.signals[0].alertEligibility,{inventory:false,watch:false});
 const exact=await route.GET(new Request('https://fixture.test/api/drops?state='+state+'&store='+encodeURIComponent(stores[0].address)));assert.equal(exact.status,200);const exactBody=await exact.json();assert.equal(exactBody.drops.length,1);assert.equal(exactBody.drops[0].storeId||exactBody.drops[0].store_id,stores[0].id);
 role.paid=false;assert.equal((await route.GET(new Request('https://fixture.test/api/drops?state='+state))).status,403);role.userId=null;assert.equal((await route.GET(new Request('https://fixture.test/api/drops?state='+state))).status,403);role.userId='offline-native-fixture';role.paid=true;
 assert.equal((await route.GET(new Request('https://fixture.test/api/drops?state='+state,{headers:{'x-bourbon-signal-engine-verification':'forged'}}))).status,401);
 const directoryApi=loadWithMocks('src/lib/sighting-store-directory.ts',{'next/cache':{unstable_cache:(fn:Function)=>fn},'./site-engine-contract':{readSiteExportResults:async()=>[{payload:{stores}}],readBundledSiteExport:()=>null},'./approved-catalog-service':{listApprovedLocations:async()=>[]}});
 const directory=await directoryApi.readSightingStoreDirectory(),{searchSightingStoreDirectory}=interop(directoryModule);assert.ok(searchSightingStoreDirectory(directory,stores[0].name,state).some((row:any)=>row.id===stores[0].id),'reviewed native premise must remain selectable');
 const storeRoute=loadWithMocks('src/app/api/stores/route.ts',{'@/lib/sighting-store-directory':{readSightingStoreDirectory:async()=>directory,SIGHTING_STORE_DIRECTORY_VERSION:'offline-native-fixture'},'@/lib/site-engine-contract':{readSiteExport:async()=>({generatedAt:at}),siteExportHeaders:()=>({}),listStates,normalizeStoreForSite}});
 assert.ok((await(await storeRoute.GET(new Request('https://fixture.test/api/stores?state='+state+'&limit=1000'))).json()).stores.some((row:any)=>row.id===stores[0].id));
 const locationsRoute=loadWithMocks('src/app/api/locations/route.ts',{'@/lib/site-engine-contract':{readSiteExport:async(name:string)=>name==='drops'?{drops}:{stores,generatedAt:at},readBundledSiteExport:()=>null,siteExportHeaders:()=>({}),listStates,normalizeStoreForSite,normalizeDropForSite}});
 assert.ok((await(await locationsRoute.GET(new Request('https://fixture.test/api/locations?state='+state))).json()).stores.some((row:any)=>row.id===stores[0].id&&row.signalCount>0));
 const coverageServer=loadWithMocks('src/lib/coverage-server.ts',{'server-only':{},'@/config/stateLifecycle':{STATE_LIFECYCLE_CONFIG:lifecycle},'@/config/mississippi-known-stores.json':{stores:[]},
  '@/lib/coverage-model':interop(coverageModule),'@/lib/coverage-known-stores':interop(knownModule),'@/lib/retailer-signal-feed':{retailerSubmissionToFeedCard:()=>null},'@/lib/retailer-public-submissions':{readCachedPublicRetailerSubmissions:async()=>[]},
  '@/lib/public-drop-evidence':interop(evidenceModule),'@/lib/drop-classification':interop(classModule),'@/data/drop-feed-classification.generated.json':{records:JSON.parse(await readFile('src/data/drop-feed-classification.generated.json','utf8')).records},
  './nationwide-pilot-receipt':interop(receiptModule),'@/lib/source-lane-runtime':{readRuntimeSourceDropOverlay:async(base:unknown[])=>({drops:base,version:'offline-native-fixture'})},
  '@/lib/site-engine-contract':{normalizeDropForSite,readSiteExportResults:async(names:string[])=>names.map(name=>({source:'remote-snapshot',snapshotId:'offline-native-fixture',payload:name==='drops'?{drops}:name==='stats'?{generatedAt:at,stateCoverage:{states:stateRows}}:name==='stores'?{stores}:{locations:stores}}))}});
 const coverageRoute=loadWithMocks('src/app/api/coverage/route.ts',{'next/server':{NextResponse:Response},'@/lib/coverage-server':coverageServer,'@/lib/nationwide-pilot-receipt':interop(receiptModule)});
 const searched=await coverageRoute.POST(new Request('https://fixture.test/api/coverage',{method:'POST',body:JSON.stringify({state,query:stores[0].address})}));assert.equal(searched.status,200);assert.ok((await searched.json()).results.some((row:any)=>row.kind==='store'&&row.storeId===stores[0].id&&row.status==='actively-monitored'));
 const actualCoverage=await(await coverageRoute.GET(new Request('https://fixture.test/api/coverage'))).json();assert.equal(actualCoverage.states.find((row:any)=>row.code===state).freshness.currentInventoryStores,1);
}
