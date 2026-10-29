import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {BourbonBible} from '../engine/src/core/bible.mjs';
import {collectState} from '../engine/src/collectors/generic-state.mjs';
import {ALL_STATE_SOURCES} from '../engine/src/state-sources.mjs';
import {canonicalizeSignal} from '../engine/src/operational-report.mjs';
import {buildDrops,bibleLookup,buildStores,buildCurrentInventoryAlertsFromDrops} from '../engine/src/export-site-contract.mjs';
import {syntheticNewEnglandPromotion,mockedNewEnglandFetch,bibleFile} from '../engine/test/helpers/synthetic-new-england-production.mjs';
import * as siteModule from '../src/lib/site-engine-contract.ts';
import * as classModule from '../src/lib/drop-classification.ts';
import * as evidenceModule from '../src/lib/public-drop-evidence.ts';
import * as coverageModule from '../src/lib/coverage-model.ts';
import * as matcherModule from '../src/lib/monitoring-scope-matcher.ts';
import * as scopesModule from '../src/lib/monitoring-scopes.ts';
import * as harness from '../apps/mobile/src/astra-test-harness.ts';
import * as feedModule from '../src/lib/signals/signal-route.ts';
import * as knownModule from '../src/lib/coverage-known-stores.ts';
import * as receiptModule from '../src/lib/nationwide-pilot-receipt.ts';
import * as directoryCoreModule from '../src/lib/sighting-store-directory-core.ts';
const interop=<T>(value:T):T=>(value as {default?:T}).default||value;
const {normalizeDropForSite,normalizeStoreForSite,listStates}=interop(siteModule);
const {classifyPublicDrop,getDropClassificationIndex}=interop(classModule);
const {normalizePublicDropEvidenceInput,isPublicDropFeedEligible,isCurrentInventoryEvidence}=interop(evidenceModule);
const {buildCoverageContract,searchCoverageTargets,findCoverageStoreTarget}=interop(coverageModule);
const {loadWithMocks}=interop(harness),{createSignalFeedHandler}=interop(feedModule);
const {candidateMatchesMonitoringScopes}=interop(matcherModule),{monitoringScopesFromPreferences}=interop(scopesModule);
const bible=await BourbonBible.load(bibleFile),index=getDropClassificationIndex(JSON.parse(await readFile('src/data/drop-feed-classification.generated.json','utf8')).records),output=[];
for(const state of ['MA','CT','RI']){
  const dir=await mkdtemp(path.join(tmpdir(),'central-production-path-'));assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));
  try{
    // Explicitly synthetic promotion schemas + frozen HTTP fixtures. These
    // calls exercise the real runtime and services; they are not live evidence.
    const promotion=syntheticNewEnglandPromotion(state),lifecycle=promotion.lifecycleConfig,config=ALL_STATE_SOURCES.find(row=>row.id===state),at=new Date().toISOString();
    const report=await collectState(config,bible,{...promotion,sourceRunnerOptions:{checkpointDir:null},newEnglandSourceOptions:{...promotion,
      cacheDir:path.join(dir,'cache'),incidentDir:path.join(dir,'incidents'),cursorDir:path.join(dir,'cursor'),sleep:async()=>{},fetchText:mockedNewEnglandFetch()}});
    assert.equal(report.status,'useful');assert.ok(report.signals.length>0);
    const operational=report.signals.map(row=>canonicalizeSignal(row,bible));
    const drops=buildDrops(operational,bibleLookup(bible.records),operational);
    assert.ok(drops.length>0);assert.ok(drops.every(row=>!Object.hasOwn(row,'previewOnly')));
    assert.ok(drops.every(row=>row.quantity===0&&row.quantityIsExact===false&&row.canAlertAsInventory===false&&row.canAlertAsWatch===false
      &&row.alertable===false&&row.eligibleForOnSite===true&&row.eligibleForDropFeed===true&&row.eligibleForWatch===false
      &&row.eligibleForDelivery===false&&row.eligibleForEmail===false&&row.eligibleForSms===false));
    assert.equal(buildCurrentInventoryAlertsFromDrops(drops).length,0);
    const rows=drops.map(row=>normalizePublicDropEvidenceInput(classifyPublicDrop(normalizeDropForSite(row),index)));
    const accepted=rows.filter(row=>isPublicDropFeedEligible(row)&&isCurrentInventoryEvidence(row));
    assert.equal(accepted.length,drops.length);assert.ok(accepted.every(row=>row.quantity===0&&row.quantityIsExact===false));
    for(const mutation of [{storeId:'unreviewed'},{productId:'unreviewed'},{sourceStale:true},{quarantined:true},{previewOnly:true},
      {eligibleForDelivery:true},{canAlertAsInventory:true},{raw:{sourceRuntimeNonAlertable:true}},{raw:{staleFallback:true}}]){
      assert.equal(isPublicDropFeedEligible({...rows[0],...mutation}),false,JSON.stringify(mutation));
    }
    const stores=buildStores(operational).filter(row=>row.state===state).map(normalizeStoreForSite);
    assert.equal(stores.length,state==='CT'?3:2);assert.ok(stores.every(row=>row.signalCount>0));
    const stateRows=[{state,publicStatus:'active',coverageTier:'sparse_live_store_inventory',signalCount:accepted.length}];
    const args={lifecycle,stateRows,stores,locations:stores,drops:rows,degradedStates:[],healthLimited:false,asOf:at};
    const coverage=buildCoverageContract(args).states.find(row=>row.code===state)!;
    assert.equal(coverage.capabilities.currentBottleAvailability,true);assert.equal(coverage.capabilities.restockAlerts,false);
    assert.equal(coverage.scope.inventoryMonitoredStores,stores.length);
    for(const store of stores){
      assert.ok(searchCoverageTargets({...args,stateCode:state,query:store.name as string}).some(row=>row.storeId===store.id));
      assert.ok(findCoverageStoreTarget({...args,stateCode:state,storeId:store.id as string}));
      const scopes=monitoringScopesFromPreferences({states:[state],monitoringScopes:[{type:'store',id:`store:${state}:${store.id}`,state,label:store.name}]});
      assert.ok(rows.some(row=>candidateMatchesMonitoringScopes(row,scopes)));assert.equal(candidateMatchesMonitoringScopes({...rows[0],storeId:'elsewhere',store_id:'elsewhere'},scopes),false);
    }
    const route=loadWithMocks('src/app/api/drops/route.ts',{
      'next/server':{NextResponse:Response},'next/cache':{unstable_cache:(fn:Function)=>fn},
      '@clerk/nextjs/server':{auth:async()=>({userId:'synthetic-member'}),clerkClient:async()=>({users:{getUser:async()=>({publicMetadata:{}})}})},
      '@/lib/server-entitlements':{getServerEntitlements:async()=>({tier:'barrel',feedPreviewLimit:null,canUseStateFilter:true,canUseAdvancedFilters:true,canUseBottleSearch:true,canUseDropFeedFilters:true})},
      '@/lib/source-lane-runtime':{readRuntimeSourceDropOverlay:async(base:unknown[])=>({drops:base,version:'synthetic-production-only'})},
      '@/lib/site-engine-contract':{normalizeDropForSite,readSiteExportIdentity:async()=> 'synthetic-production-only',readSiteExportResults:async()=>[
        {payload:{drops,generatedAt:at},snapshotId:'synthetic-production-only',source:'remote-snapshot'},{payload:{generatedAt:at}}],siteExportHeaders:()=>({})},
      '@/lib/retailer-public-submissions':{readCachedPublicRetailerSubmissions:async()=>[]},
    });
    const feed=createSignalFeedHandler({getDrops:(request)=>route.GET(request),getSightings:async()=>Response.json({sightings:[],totalSightings:0})});
    const response=await feed(new Request('https://fixture.test/api/v1/signals?view=market&state='+state));
    assert.equal(response.status,200);const page=await response.json();assert.equal(page.signals.length,accepted.length);
    for(const store of stores){
      const filtered=await route.GET(new Request('https://fixture.test/api/drops?state='+state+'&store='+encodeURIComponent(String(store.name))));
      assert.equal(filtered.status,200);const storePage=await filtered.json();
      assert.ok(storePage.drops.length>0);assert.ok(storePage.drops.every((row:any)=>row.storeId===store.id||row.store_id===store.id));
    }
    const directoryModule=loadWithMocks('src/lib/sighting-store-directory.ts',{
      'next/cache':{unstable_cache:(fn:Function)=>fn},
      './site-engine-contract':{readSiteExportResults:async()=>[{payload:{stores}}],readBundledSiteExport:()=>null},
      './approved-catalog-service':{listApprovedLocations:async()=>[]},
    });
    const directory=await directoryModule.readSightingStoreDirectory();
    const {searchSightingStoreDirectory}=interop(directoryCoreModule);
    for(const store of stores)assert.ok(searchSightingStoreDirectory(directory,String(store.name),state).some((row:any)=>row.id===store.id));
    const storeRoute=loadWithMocks('src/app/api/stores/route.ts',{
      '@/lib/sighting-store-directory':{readSightingStoreDirectory:async()=>directory,SIGHTING_STORE_DIRECTORY_VERSION:'synthetic-production-only'},
      '@/lib/site-engine-contract':{readSiteExport:async()=>({generatedAt:at}),siteExportHeaders:()=>({}),listStates,normalizeStoreForSite},
    });
    const selectable=(await(await storeRoute.GET(new Request('https://fixture.test/api/stores?state='+state+'&limit=1000'))).json()).stores;
    for(const store of stores)assert.ok(selectable.some((row:any)=>row.id===store.id));
    const locationsRoute=loadWithMocks('src/app/api/locations/route.ts',{
      '@/lib/site-engine-contract':{readSiteExport:async(name:string)=>name==='drops'?{drops}:{stores,generatedAt:at},readBundledSiteExport:()=>null,
        siteExportHeaders:()=>({}),listStates,normalizeStoreForSite,normalizeDropForSite},
    });
    const locations=(await(await locationsRoute.GET(new Request('https://fixture.test/api/locations?state='+state))).json()).stores;
    for(const store of stores)assert.ok(locations.some((row:any)=>row.id===store.id&&row.signalCount>0));
    const coverageServer=loadWithMocks('src/lib/coverage-server.ts',{
      'server-only':{},'@/config/stateLifecycle':{STATE_LIFECYCLE_CONFIG:lifecycle},'@/config/mississippi-known-stores.json':{stores:[]},
      '@/lib/coverage-model':interop(coverageModule),'@/lib/coverage-known-stores':interop(knownModule),
      '@/lib/retailer-signal-feed':{retailerSubmissionToFeedCard:()=>null},'@/lib/retailer-public-submissions':{readCachedPublicRetailerSubmissions:async()=>[]},
      '@/lib/public-drop-evidence':interop(evidenceModule),'@/lib/drop-classification':interop(classModule),
      '@/data/drop-feed-classification.generated.json':{records:JSON.parse(await readFile('src/data/drop-feed-classification.generated.json','utf8')).records},
      './nationwide-pilot-receipt':interop(receiptModule),'@/lib/source-lane-runtime':{readRuntimeSourceDropOverlay:async(rows:unknown[])=>({drops:rows,version:'synthetic-production-only'})},
      '@/lib/site-engine-contract':{normalizeDropForSite,readSiteExportResults:async(names:string[])=>names.map(name=>({source:'remote-snapshot',snapshotId:'synthetic-production-only',payload:
        name==='drops'?{drops}:name==='stats'?{generatedAt:at,stateCoverage:{states:stateRows}}:name==='stores'?{stores}:{locations:stores}}))},
    });
    const coverageRoute=loadWithMocks('src/app/api/coverage/route.ts',{
      'next/server':{NextResponse:Response},'@/lib/coverage-server':coverageServer,'@/lib/nationwide-pilot-receipt':interop(receiptModule),
    });
    for(const store of stores){
      const response=await coverageRoute.POST(new Request('https://fixture.test/api/coverage',{method:'POST',body:JSON.stringify({state,query:store.name})}));
      assert.equal(response.status,200);const payload=await response.json();
      assert.ok(payload.results.some((row:any)=>row.kind==='store'&&row.storeId===store.id&&row.status==='actively-monitored'));
    }
    const publicCoverage=await(await coverageRoute.GET(new Request('https://fixture.test/api/coverage'))).json();
    assert.equal(publicCoverage.states.find((row:any)=>row.code===state).freshness.currentInventoryStores,stores.length);
    const later=new Date(Date.now()+121*60_000).toISOString();assert.ok(rows.every(row=>!isCurrentInventoryEvidence(row,later)));
    assert.equal(buildCoverageContract({...args,asOf:later}).states.find(row=>row.code===state)!.capabilities.currentBottleAvailability,false);
    output.push({state,scope:'synthetic_runtime_and_actual_customer_pipeline_only_not_source_or_promotion_evidence',rows:accepted.length,stores:stores.length,
      actualFeedRoute:true,actualCoveragePost:true,actualSelectableDirectoryAndLocations:true,coverageStoreSearchAndScope:true,previewOnlyPropertyAbsent:true,allDeliveryDisabled:true});
  }finally{await rm(dir,{recursive:true,force:true});}
}
console.log(JSON.stringify(output));
