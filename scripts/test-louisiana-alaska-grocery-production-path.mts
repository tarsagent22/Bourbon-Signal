import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {BourbonBible} from '../engine/src/core/bible.mjs';
import {collectState} from '../engine/src/collectors/generic-state.mjs';
import {ALL_STATE_SOURCES} from '../engine/src/state-sources.mjs';
import {canonicalizeSignal,candidateFromChange} from '../engine/src/operational-report.mjs';
import {guardStateReport} from '../engine/src/state-report-guard.mjs';
import {LOUISIANA_ALASKA_GROCERY_SOURCES} from '../engine/src/collectors/louisiana-alaska-grocery-premises.mjs';
import {parseLouisianaAlaskaGroceryInventory} from '../engine/src/collectors/louisiana-alaska-grocery-expansion.mjs';
import {buildDrops,bibleLookup,buildStores,buildCurrentInventoryAlertsFromDrops} from '../engine/src/export-site-contract.mjs';
import {fixture,syntheticPromotedGroceryConfig,syntheticPromotionManifest,mockedCompleteGroceryFetch} from '../engine/test/helpers/synthetic-louisiana-alaska-promotion.mjs';
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
const bible=new BourbonBible(fixture.records),index=getDropClassificationIndex(JSON.parse(await readFile('src/data/drop-feed-classification.generated.json','utf8')).records),output=[];
const positiveEvidenceOnly=process.argv.includes('--positive-evidence-only');
const unconfirmedStore=positiveEvidenceOnly&&process.argv.includes('--unconfirmed-store')?LOUISIANA_ALASKA_GROCERY_SOURCES.find(s=>s.stateCode==='LA'):null;
for(const state of positiveEvidenceOnly?['LA']:['LA','AK']){
  const dir=await mkdtemp(path.join(tmpdir(),'louisiana-alaska-production-path-'));assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));
  try{
    // Explicitly synthetic promotion schemas + frozen HTTP fixtures. These
    // calls exercise the real runtime and services; they are not live evidence.
    const lifecycle=syntheticPromotedGroceryConfig(state),promotion={lifecycleConfig:lifecycle,promotionManifest:syntheticPromotionManifest(state,lifecycle)},config=ALL_STATE_SOURCES.find(row=>row.id===state),at=new Date().toISOString();
    const originalFetch=mockedCompleteGroceryFetch(state),bare=await readFile('engine/test/fixtures/grocery-la-unbound-empty.json','utf8');let replaced=false;
    const report=await collectState(config,bible,{...promotion,sourceRunnerOptions:{checkpointDir:null},grocerySourceOptions:{...promotion,
      cacheDir:path.join(dir,'cache'),incidentDir:path.join(dir,'incidents'),cursorDir:path.join(dir,'cursor'),sleep:async()=>{},fetchText:async value=>{const u=new URL(value),q=u.searchParams.get('q');if(positiveEvidenceOnly&&q&&(unconfirmedStore?u.searchParams.get('storeid')===unconfirmedStore.merchantId:!replaced&&!['bourbon','whiskey'].includes(q))){replaced=true;return{ok:true,status:200,url:value,text:bare};}return originalFetch(value);}}});
    if(positiveEvidenceOnly){assert.equal(report.metadata.grocery.complete,false);assert.equal(report.metadata.grocery.profileScope,'POSITIVE_EVIDENCE_ONLY');assert.equal(report.metadata.grocery.negativeComplete,false);assert.ok(report.metadata.grocery.unconfirmedNegativeQueryCount>0);}
    assert.equal(report.status,'useful');assert.ok(report.signals.length>0);
    const operational=report.signals.map(row=>canonicalizeSignal(row,bible));
    if(unconfirmedStore){
      const oldClock=new Date(Date.now()-60*60000).toISOString(),oldNative=parseLouisianaAlaskaGroceryInventory({response:{docs:fixture.products.map(p=>({...p,storeId:unconfirmedStore.merchantId}))}},unconfirmedStore,bible,{observedAt:oldClock})[0];
      const prior=canonicalizeSignal({...oldNative,sourceRuntimeId:'la:grocery-xapi',canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,eligibleForDelivery:false,deliveryEligible:false,eligibleForEmail:false,eligibleForSms:false},bible);
      const guarded=guardStateReport({previous:{...report,signals:[prior]},candidate:report});assert.equal(guarded.accepted,true);assert.ok(guarded.report.signals.every(r=>r.storeId!==unconfirmedStore.storeId));
      const cwd=path.join(dir,'operational-check'),out=path.join(cwd,'out');await mkdir(path.join(out,'history','snapshots'),{recursive:true});
      await writeFile(path.join(out,'bourbon-bible.json'),JSON.stringify({records:bible.records}));await writeFile(path.join(out,'signals.json'),JSON.stringify({signals:guarded.report.signals}));
      const original=JSON.stringify({generatedAt:oldClock,signals:[prior]}),priorFile=path.join(out,'history','snapshots','0000-prior.json');await writeFile(priorFile,original);
      execFileSync(process.execPath,[path.resolve('engine/src/operational-report.mjs')],{cwd,stdio:'pipe',windowsHide:true});
      const diff=JSON.parse(await readFile(path.join(out,'diff.json'),'utf8')),missing=diff.changes.find(c=>c.type==='missing_signal'&&c.before.storeId===unconfirmedStore.storeId);assert.ok(missing);assert.equal(missing.after,null);assert.equal(missing.before.observedAt,oldClock);
      const candidate=candidateFromChange(missing);assert.equal(candidate.eligibleForDelivery,false);assert.equal(candidate.action,'do_not_alert_context_only');assert.ok(candidate.blockers.includes('missing_signal_not_sendable'));
      assert.equal(createHash('sha256').update(await readFile(priorFile)).digest('hex'),createHash('sha256').update(original).digest('hex'),'Original historical snapshot and clock remain unchanged');
      const historicalExport=buildDrops([...operational,prior],bibleLookup(bible.records),operational);assert.ok(historicalExport.every(r=>r.storeId!==unconfirmedStore.storeId),'Unknown absence cannot backfill old stock or invent a zero-stock row');
    }
    const drops=buildDrops(operational,bibleLookup(bible.records),operational);
    assert.equal(buildDrops(operational,bibleLookup(bible.records),[]).length,0,'A complete current negative observation cannot resurrect historical LA/AK availability');
    assert.ok(drops.length>0);assert.ok(drops.every(row=>!Object.hasOwn(row,'previewOnly')));
    assert.ok(drops.every(row=>row.quantity===0&&row.quantityIsExact===false&&row.canAlertAsInventory===false&&row.canAlertAsWatch===false
      &&row.alertable===false&&row.eligibleForOnSite===true&&row.eligibleForDropFeed===true&&row.eligibleForWatch===false
      &&row.eligibleForDelivery===false&&row.eligibleForEmail===false&&row.eligibleForSms===false));
    assert.equal(buildCurrentInventoryAlertsFromDrops(drops).length,0);
    const rows=drops.map(row=>normalizePublicDropEvidenceInput(classifyPublicDrop(normalizeDropForSite(row),index)));
    const accepted=rows.filter(row=>isPublicDropFeedEligible(row)&&isCurrentInventoryEvidence(row));
    assert.equal(accepted.length,drops.length);assert.ok(accepted.every(row=>row.quantity===0&&row.quantityIsExact===false));
    for(const mutation of [{storeId:'unreviewed'},{productId:'unreviewed'},{sourceStale:true},{quarantined:true},{previewOnly:true},
      {can_alert_as_inventory:true},{can_alert_as_watch:true},{deliveryEligible:true},{eligibleForDelivery:true},{eligibleForWatch:true},{eligibleForEmail:true},{eligibleForSms:true},{alertable:true},{researchOnly:true},{customerVisible:false},{canAlertAsInventory:true},{raw:{sourceRuntimeNonAlertable:true}},{raw:{staleFallback:true}}]){
      assert.equal(isPublicDropFeedEligible({...rows[0],...mutation}),false,JSON.stringify(mutation));
    }
    const stores=buildStores(operational).filter(row=>row.state===state).map(normalizeStoreForSite);
    assert.equal(stores.length,(state==='LA'?15:19)-(unconfirmedStore?1:0));assert.ok(stores.every(row=>row.signalCount>0));
    const knownUnconfirmed=unconfirmedStore?{id:unconfirmedStore.storeId,storeId:unconfirmedStore.storeId,name:unconfirmedStore.name,storeName:unconfirmedStore.name,address:unconfirmedStore.address,storeAddress:unconfirmedStore.address,state,city:unconfirmedStore.city,zip:unconfirmedStore.zip,lat:unconfirmedStore.lat,lng:unconfirmedStore.lng,signalCount:0,hasSignals:false,type:'store',locationType:'store',collectorAttached:true}:null;
    const knownLocations=knownUnconfirmed?[...stores,knownUnconfirmed]:stores;
    const stateRows=[{state,publicStatus:'active',coverageTier:'sparse_live_store_inventory',signalCount:accepted.length}];
    const args={lifecycle,stateRows,stores,locations:knownLocations,drops:rows,degradedStates:[],healthLimited:false,asOf:at};
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
        name==='drops'?{drops}:name==='stats'?{generatedAt:at,stateCoverage:{states:stateRows}}:name==='stores'?{stores}:{locations:knownLocations}}))},
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
    if(knownUnconfirmed){const response=await coverageRoute.POST(new Request('https://fixture.test/api/coverage',{method:'POST',body:JSON.stringify({state,query:knownUnconfirmed.storeAddress})}));const body=await response.json();assert.ok(body.results.some((r:any)=>r.storeId===knownUnconfirmed.storeId&&r.status==='known-expansion-candidate'));assert.ok(!body.results.some((r:any)=>r.storeId===knownUnconfirmed.storeId&&r.status==='actively-monitored'));}
    const later=new Date(Date.now()+121*60_000).toISOString();assert.ok(rows.every(row=>!isCurrentInventoryEvidence(row,later)));
    assert.equal(buildCoverageContract({...args,asOf:later}).states.find(row=>row.code===state)!.capabilities.currentBottleAvailability,false);
    output.push({state,scope:'synthetic_runtime_and_actual_customer_pipeline_only_not_source_or_promotion_evidence',rows:accepted.length,stores:stores.length,
      sourceObservationScope:report.metadata.grocery.profileScope,negativeComplete:report.metadata.grocery.negativeComplete,unconfirmedNegativeQueryCount:report.metadata.grocery.unconfirmedNegativeQueryCount,
      unknownPriorStoreNotSoldOut:unconfirmedStore?true:null,unknownPriorSnapshotClockPreserved:unconfirmedStore?true:null,
      actualFeedRoute:true,actualCoveragePost:true,actualSelectableDirectoryAndLocations:true,coverageStoreSearchAndScope:true,previewOnlyPropertyAbsent:true,allDeliveryDisabled:true});
  }finally{await rm(dir,{recursive:true,force:true});}
}
console.log(JSON.stringify(output));
