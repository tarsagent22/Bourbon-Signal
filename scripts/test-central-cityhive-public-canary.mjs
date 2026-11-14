import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import * as classificationModule from '../src/lib/drop-classification.ts';
import * as evidenceModule from '../src/lib/public-drop-evidence.ts';
import * as coverageModule from '../src/lib/coverage-model.ts';
import * as contractModule from '../src/lib/site-engine-contract.ts';
import * as knownStoresModule from '../src/lib/coverage-known-stores.ts';
import * as receiptModule from '../src/lib/nationwide-pilot-receipt.ts';
import * as harness from '../apps/mobile/src/astra-test-harness.ts';
import {isCentralCityHiveInventory} from '../engine/src/central-cityhive-policy.mjs';
import {isPearsonsDcResearchInventory,PEARSONS_DC_SOURCE} from '../engine/src/collectors/pearsons-dc-research.mjs';
const {classifyPublicDrop,getDropClassificationIndex}=classificationModule.default||classificationModule;
const {normalizePublicDropEvidenceInput,isPublicDropFeedEligible,isCurrentInventoryEvidence}=evidenceModule.default||evidenceModule;
const {buildCoverageContract}=coverageModule.default||coverageModule;
const {normalizeDropForSite}=contractModule.default||contractModule;
const {loadWithMocks}=harness.default||harness;
const state=process.argv.find(value=>value.startsWith('--state='))?.slice(8);
assert.ok(['WI','OK','RI','DC'].includes(state),'Use reviewed --state=WI|OK|RI|DC');
const read=async file=>JSON.parse(await readFile(file,'utf8'));
const root=`engine/out/canary/${state}/site`,clock=new Date().toISOString();
const partition=await read(root+`/states/${state}/drops.json`),stats=await read(root+'/stats.json');
const lifecycle=await read(root+'/lifecycle-preview.json'),locations=(await read(root+'/locations.json')).locations;
const index=getDropClassificationIndex((await read('src/data/drop-feed-classification.generated.json')).records);
const classified=partition.drops.map(row=>normalizePublicDropEvidenceInput(classifyPublicDrop(normalizeDropForSite(row),index)));
const accepted=classified.filter(row=>isPublicDropFeedEligible(row)&&isCurrentInventoryEvidence(row,clock));
assert.ok(accepted.length>0,'Actual current app-eligible rows must survive the canary customer policy');
assert.ok(accepted.every(row=>(isCentralCityHiveInventory(row)||state==='DC'&&isPearsonsDcResearchInventory(row,{nowMs:Date.parse(clock)}))
  &&row.previewOnly&&row.eligibleForOnSite&&row.canAlertAsInventory===false&&row.canAlertAsWatch===false
  &&row.eligibleForDelivery===false&&row.eligibleForEmail===false&&row.eligibleForSms===false
  &&row.quantityIsExact===false&&(row.sourceProductBinding?.source==='pearsons-shopify-retained-page'?row.quantity==null:row.quantity===0)));
if(state==='DC'){
  const pearson=accepted.find(row=>row.sourceProductBinding?.source==='pearsons-shopify-retained-page');
  assert.ok(pearson,'Pearson first-party pickup offer survives public projection');
  assert.equal(pearson.storeId,PEARSONS_DC_SOURCE.storeId);assert.equal(pearson.storeAddress,PEARSONS_DC_SOURCE.storeAddress);
  assert.equal(pearson.canonicalName,"Blanton's Original Single Barrel");
  assert.ok(pearson.quantity==null,'No shelf quantity is invented for Pearson pickup availability');assert.equal(pearson.quantityIsExact,false);
  assert.equal(pearson.sourceProductBinding?.sourcePageSha256,'19ae33c645f38f237d7e2c73e53cd684b0d9183ccf3892455ccc0a4419af8385');
  assert.equal(pearson.observedAt,'2026-11-14T18:11:32.861Z');
  const pearsonSource=partition.drops.find(row=>row.sourceProductBinding?.source==='pearsons-shopify-retained-page');
  for(const mutation of [{previewOnly:false},{storeAddress:'999 Other Street, Washington, DC 20007'},
    {quantity:1},{canAlertAsInventory:true},{eligibleForDelivery:true}]){
    const changed=normalizePublicDropEvidenceInput(classifyPublicDrop(normalizeDropForSite({...pearsonSource,...mutation}),index));
    assert.equal(isPublicDropFeedEligible(changed),false,`DC preview policy accepted ${JSON.stringify(mutation)}`);
  }
}
const binary=accepted[0];
for(const mutation of [{storeId:'unreviewed'},{productId:'unreviewed'},{quantity:1},{quantityIsExact:true},
  {storeAddress:'999 Other Street'},{sourceStale:true}])assert.equal(isCentralCityHiveInventory({...binary,...mutation}),false);
for(const mutation of [{canAlertAsInventory:true},{can_alert_as_inventory:true},{canAlertAsWatch:true},{alertable:true},
  {eligibleForDelivery:true},{eligibleForEmail:true},{eligibleForSms:true},{eligibleForWatch:true},{eligibleForOnSite:false}]){
  const changed=normalizePublicDropEvidenceInput(classifyPublicDrop(normalizeDropForSite({...partition.drops[0],...mutation}),index));
  assert.equal(isPublicDropFeedEligible(changed),false,`Canary customer policy accepted ${JSON.stringify(mutation)}`);
}
const coverage=buildCoverageContract({lifecycle,stateRows:stats.stateCoverage.states,locations,
  stores:(await read(root+'/stores.json')).stores,drops:classified,degradedStates:[],generatedAt:stats.generatedAt,asOf:clock,healthLimited:false})
  .states.find(row=>row.code===state);
assert.equal(coverage?.capabilities.currentBottleAvailability,true);assert.equal(coverage?.capabilities.restockAlerts,false);
assert.ok(coverage.scope.searchableStores>0);assert.equal(coverage.scope.inventoryMonitoredStores,new Set(accepted.map(row=>row.storeId)).size);
// Authored public Coverage and Finder services execute with only snapshot/cache
// infrastructure replaced. This is local fixture evidence, not a live UI claim.
const payloads=Object.fromEntries(await Promise.all(['stats','locations','stores','drops'].map(async name=>[name,await read(root+'/'+name+'.json')])));
const coverageService=loadWithMocks('src/lib/coverage-server.ts',{
  'server-only':{},'@/config/stateLifecycle':{STATE_LIFECYCLE_CONFIG:lifecycle},'@/config/mississippi-known-stores.json':{stores:[]},
  '@/lib/coverage-model':coverageModule.default||coverageModule,'@/lib/coverage-known-stores':knownStoresModule.default||knownStoresModule,
  '@/lib/retailer-signal-feed':{retailerSubmissionToFeedCard:()=>null},'@/lib/retailer-public-submissions':{readCachedPublicRetailerSubmissions:async()=>[]},
  '@/lib/public-drop-evidence':evidenceModule.default||evidenceModule,'@/lib/drop-classification':classificationModule.default||classificationModule,
  '@/data/drop-feed-classification.generated.json':await read('src/data/drop-feed-classification.generated.json'),
  './nationwide-pilot-receipt':receiptModule.default||receiptModule,
  '@/lib/source-lane-runtime':{readRuntimeSourceDropOverlay: async rows=>({drops:rows,version:'isolated-canary-fixture'})},
  '@/lib/site-engine-contract':{normalizeDropForSite,readSiteExportResults:async names=>names.map(name=>({payload:payloads[name],source:'remote-snapshot',snapshotId:'isolated-canary-fixture'}))},
});
const coverageRoute=loadWithMocks('src/app/api/coverage/route.ts',{
  'next/server':{NextResponse:Response},'@/lib/coverage-server':coverageService,'@/lib/nationwide-pilot-receipt':receiptModule.default||receiptModule,
});
const publicContract=await(await coverageRoute.GET(new Request('https://fixture.test/api/coverage'))).json();
assert.equal(publicContract.states.find(row=>row.code===state).freshness.currentInventoryStores,coverage.scope.inventoryMonitoredStores);
const candidateLocations=locations.filter(row=>row.state===state);
const selectable=loadWithMocks('src/lib/sighting-store-directory.ts',{
  'next/cache':{unstable_cache:fn=>fn},'./approved-catalog-service':{listApprovedLocations:async()=>[]},
  './site-engine-contract':{readSiteExportResults:async()=>[{payload:{stores:candidateLocations}}],readBundledSiteExport:()=>null},
});
const directory=await selectable.readSightingStoreDirectory();
const contractHelpers=contractModule.default||contractModule;
const storeRoute=loadWithMocks('src/app/api/stores/route.ts',{
  '@/lib/sighting-store-directory':{readSightingStoreDirectory:async()=>directory,SIGHTING_STORE_DIRECTORY_VERSION:'isolated-canary-fixture'},
  '@/lib/site-engine-contract':{readSiteExport:async name=>payloads[name],siteExportHeaders:()=>({}),listStates:contractHelpers.listStates,normalizeStoreForSite:contractHelpers.normalizeStoreForSite},
});
const locationRoute=loadWithMocks('src/app/api/locations/route.ts',{
  '@/lib/site-engine-contract':{readSiteExport:async name=>payloads[name],readBundledSiteExport:()=>null,siteExportHeaders:()=>({}),
    listStates:contractHelpers.listStates,normalizeStoreForSite:contractHelpers.normalizeStoreForSite,normalizeDropForSite},
});
for(const location of candidateLocations){
  const searched=await coverageRoute.POST(new Request('https://fixture.test/api/coverage',{method:'POST',body:JSON.stringify({state,query:location.name})}));
  assert.equal(searched.status,200);const search=await searched.json();
  assert.ok(search.results.some(row=>row.kind==='store'&&row.storeId===location.id&&row.status==='actively-monitored'));
  assert.ok(directory.some(row=>row.state===state&&row.id===location.id));
  for(const route of [storeRoute,locationRoute]){
    const response=await route.GET(new Request('https://fixture.test/api/stores?state='+state+'&limit=1000'));
    assert.equal(response.status,200);const result=await response.json();
    assert.ok(result.stores.some(row=>row.id===location.id),location.id);
  }
}
const proof={state,evaluatedAt:clock,scope:'local_customer_projection_of_workflow_canary_not_live_preview',
  rawRows:partition.drops.length,publicCurrentRows:accepted.length,publicCurrentStores:coverage.scope.inventoryMonitoredStores,
  searchableStores:coverage.scope.searchableStores,allDeliveryDisabled:true,noExactShelfQuantityInvented:true,
  actualCoverageAndFinderServicesUnderFixture:true,liveAuthenticatedUiExercised:false,
  ...(state==='DC'?{publicCurrentCities:new Set(accepted.map(row=>row.city)).size,
    exactFinderStores:accepted.map(row=>({storeId:row.storeId,storeName:row.storeName,address:row.storeAddress,
      city:row.city,sourceClock:row.observedAt,quantity:row.quantity??null,quantityIsExact:row.quantityIsExact,
      sourceReceiptSha256:row.sourceProductBinding?.sourcePageSha256||null})).sort((a,b)=>a.storeId.localeCompare(b.storeId))}: {})};
if(state==='DC'){
  assert.equal(proof.publicCurrentStores,3);assert.equal(proof.publicCurrentCities,1);assert.equal(proof.exactFinderStores.length,3);
  const prepared=await read('engine/data/canary-inputs/DC.json');
  proof.workflowSource=prepared.workflowSource;
  proof.sourceReceipts=prepared.sourceReceipts;
  proof.shadowBibleRecordsSha256=prepared.shadowBibleRecordsSha256;
  proof.bibleRecordsSha256=prepared.bibleRecordsSha256;
}
await writeFile(`engine/out/canary/${state}/public-projection.json`,JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
