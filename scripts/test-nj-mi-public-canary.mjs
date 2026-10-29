import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import * as classificationModule from '../src/lib/drop-classification.ts';
import * as evidenceModule from '../src/lib/public-drop-evidence.ts';
import * as coverageModule from '../src/lib/coverage-model.ts';
import * as contractModule from '../src/lib/site-engine-contract.ts';
import * as knownStoresModule from '../src/lib/coverage-known-stores.ts';
import * as receiptModule from '../src/lib/nationwide-pilot-receipt.ts';
import * as harness from '../apps/mobile/src/astra-test-harness.ts';
import {isNjMiResearchInventory} from '../engine/src/nj-mi-research-policy.mjs';
const {classifyPublicDrop,getDropClassificationIndex}=classificationModule.default||classificationModule;
const {normalizePublicDropEvidenceInput,isPublicDropFeedEligible,isCurrentInventoryEvidence}=evidenceModule.default||evidenceModule;
const {buildCoverageContract}=coverageModule.default||coverageModule;
const {normalizeDropForSite}=contractModule.default||contractModule;
const {loadWithMocks}=harness.default||harness;
const state=process.argv.find(value=>value.startsWith('--state='))?.slice(8);
assert.ok(['NJ','MI'].includes(state),'Use reviewed --state=NJ|MI');
const read=async file=>JSON.parse(await readFile(file,'utf8'));
const root=`engine/out/canary/${state}/site`,clock=new Date().toISOString();
const partition=await read(root+`/states/${state}/drops.json`),stats=await read(root+'/stats.json');
const lifecycle=await read(root+'/lifecycle-preview.json'),locations=(await read(root+'/locations.json')).locations;
const index=getDropClassificationIndex((await read('src/data/drop-feed-classification.generated.json')).records);
const classified=partition.drops.map(row=>normalizePublicDropEvidenceInput(classifyPublicDrop(normalizeDropForSite(row),index)));
const accepted=classified.filter(row=>isPublicDropFeedEligible(row)&&isCurrentInventoryEvidence(row,clock));
assert.ok(accepted.length>0,'Actual current app-eligible rows must survive the canary customer policy');
assert.ok(accepted.every(row=>isNjMiResearchInventory(row)&&row.previewOnly&&row.eligibleForOnSite
  &&row.canAlertAsInventory===false&&row.canAlertAsWatch===false&&row.eligibleForDelivery===false
  &&row.eligibleForEmail===false&&row.eligibleForSms===false&&row.quantity===0&&row.quantityIsExact===false));
const binary=accepted[0];
for(const mutation of [{storeId:'unreviewed'},{productId:'unreviewed'},{quantity:1},{quantityIsExact:true},
  {storeAddress:'999 Other Street'},{sourceStale:true}])assert.equal(isNjMiResearchInventory({...binary,...mutation}),false);
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
  '@/lib/source-lane-runtime':{readRuntimeSourceDropOverlay:async rows=>({drops:rows,version:'isolated-canary-fixture'})},
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
  './site-engine-contract':{readSiteExportResults:async names=>names.map(name=>({payload:payloads[name]})),readBundledSiteExport:()=>null},
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
  searchableStores:coverage.scope.searchableStores,allDeliveryDisabled:true,binaryQuantityRemainsZero:true,
  actualCoverageAndFinderServicesUnderFixture:true,liveAuthenticatedUiExercised:false};
await writeFile(`engine/out/canary/${state}/public-projection.json`,JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
