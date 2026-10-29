import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {BourbonBible} from '../engine/src/core/bible.mjs';
import {CALIFORNIA_GROCERY_SOURCES} from '../engine/src/collectors/california-grocery-premises.mjs';
import {parseGroceryExpansionInventory} from '../engine/src/collectors/grocery-xapi-expansion.mjs';
import {canonicalizeSignal} from '../engine/src/operational-report.mjs';
import {bibleLookup,buildDrops,buildStores} from '../engine/src/export-site-contract.mjs';
import * as harnessModule from '../apps/mobile/src/astra-test-harness.ts';
import * as siteModule from '../src/lib/site-engine-contract.ts';
import * as classificationModule from '../src/lib/drop-classification.ts';
import * as evidenceModule from '../src/lib/public-drop-evidence.ts';
import * as coverageModule from '../src/lib/coverage-model.ts';
function interop<T>(value:T):T{return (value as {default?:T}).default||value;}
const {loadWithMocks}=interop(harnessModule),{normalizeDropForSite}=interop(siteModule);
const {getDropClassificationIndex,classifyPublicDrop}=interop(classificationModule);
const {isPublicDropFeedEligible,publicDropDegradedStateReasons,derivePublicDropEvidence}=interop(evidenceModule);
const coverage=interop(coverageModule);
const read=(file:string)=>JSON.parse(readFileSync(file,'utf8'));
const capture=process.argv.find(arg=>arg.startsWith('--capture-dir='))?.slice('--capture-dir='.length);
const fixture=read('engine/test/fixtures/california-grocery-expansion/identity.json');
const biblePayload=capture?read(path.join(capture,'bourbon-bible.json')):fixture;
const bible=new BourbonBible(biblePayload.records),now=new Date().toISOString();
const raw=capture?read(path.join(capture,'states/CA.json')).signals:CALIFORNIA_GROCERY_SOURCES.filter(source=>['Los Angeles','San Francisco','Sacramento'].includes(source.city)).flatMap(source=>{
  const products=structuredClone(fixture.products);for(const product of products)product.storeId=source.merchantId;
  return parseGroceryExpansionInventory({response:{docs:products}},source,bible,{observedAt:now});
});
const operational=raw.map((row:any)=>canonicalizeSignal(row,bible));
const projected=buildDrops(operational,bibleLookup(bible.records),operational);
const catalog=read('src/data/drop-feed-classification.generated.json'),index=getDropClassificationIndex(catalog.records);
const drops=projected.map((row:any)=>classifyPublicDrop(normalizeDropForSite(row),index));
const grocery=drops.filter((row:any)=>row.sourceProductBinding?.source==='grocery-xapi');
assert.ok(grocery.length>0,'actual normalization and current library classification retain reviewed grocery rows');
assert.ok(grocery.every((row:any)=>!row.sourcePollId&&!row.sourceLaneId));
const degraded=[{state:'CA',status:'degraded',staleReason:'inventory_confirmation_overdue'}];
const options={degradedStateCodes:new Set(['CA']),degradedStateReasons:publicDropDegradedStateReasons(degraded)};
assert.equal(grocery.filter((row:any)=>isPublicDropFeedEligible(row,options)).length,grocery.length);
assert.equal(grocery.filter((row:any)=>isPublicDropFeedEligible(row,{degradedStateCodes:new Set(['CA'])})).length,0,'reasonless degraded states stay blocked');
const evidence=derivePublicDropEvidence(grocery,now,options).get('CA')!;
assert.equal(evidence.independentFreshPublicSignalCount,grocery.length);

const lifecycle=read('src/config/state-lifecycle.json');
const stores=buildStores(operational);
const stateRows=[{state:'CA',publicStatus:'active',coverageTier:'live_store_inventory',signalCount:grocery.length}];
const stats={generatedAt:now,engineGeneratedAt:now,refreshHealth:{degradedStates:degraded},stateCoverage:{states:stateRows}};
let revision=0,routeDrops=drops;
const next={'next/server':{NextResponse:Response},'next/cache':{unstable_cache:(fn:Function)=>fn},'server-only':{}};
const site={normalizeDropForSite,readSiteExportIdentity:async()=> `ca-degraded-fixture-${revision}`,siteExportHeaders:()=>({}),
  readSiteExportResults:async(names:string[])=>names.map(name=>({source:'remote-snapshot',snapshotId:`ca-degraded-fixture-${revision}`,payload:name==='drops'?{drops:routeDrops,generatedAt:now}:name==='stats'?stats:name==='stores'?{stores}:{locations:[]}}))};
const sourceOverlay={readRuntimeSourceDropOverlay:async(rows:unknown[])=>({drops:rows,version:'unchanged-fixture'})};
const feed=loadWithMocks('src/app/api/drops/route.ts',{
  ...next,'@/lib/site-engine-contract':site,'@/lib/source-lane-runtime':sourceOverlay,
  '@clerk/nextjs/server':{auth:async()=>({userId:'fixture-member'}),clerkClient:async()=>({users:{getUser:async()=>({publicMetadata:{}})}})},
  '@/lib/server-entitlements':{getServerEntitlements:async()=>({tier:'barrel',feedPreviewLimit:null,canUseStateFilter:true,canUseAdvancedFilters:true,canUseBottleSearch:true,canUseDropFeedFilters:true})},
  '@/lib/retailer-public-submissions':{readCachedPublicRetailerSubmissions:async()=>[]},
});
const feedResponse=await feed.GET(new Request('https://example.test/api/drops?state=CA&limit=500'));
assert.equal(feedResponse.status,200);const feedBody=await feedResponse.json();
assert.equal(feedBody.drops.filter((row:any)=>row.sourceProductBinding?.source==='grocery-xapi').length,grocery.length);
const server=loadWithMocks('src/lib/coverage-server.ts',{
  ...next,'@/config/stateLifecycle':{STATE_LIFECYCLE_CONFIG:lifecycle},'@/lib/site-engine-contract':site,'@/lib/source-lane-runtime':sourceOverlay,
  '@/lib/coverage-model':coverage,'@/lib/retailer-public-submissions':{readCachedPublicRetailerSubmissions:async()=>[]},
});
const route=loadWithMocks('src/app/api/coverage/route.ts',{...next,'@/lib/coverage-server':server});
const response=await route.GET(new Request('https://example.test/api/coverage'));
assert.equal(response.status,200);const state=(await response.json()).states.find((row:any)=>row.code==='CA');
assert.equal(state.freshness.currentInventoryStores,evidence.currentInventoryStores.length);
assert.equal(state.capabilities.currentBottleAvailability,true);
assert.equal(coverage.buildCoverageContract({lifecycle,stateRows,stores,drops:grocery,degradedStates:degraded,asOf:now,healthLimited:true}).states.find(state=>state.code==='CA')!.freshness.currentInventoryStores,0,'snapshot health/completeness veto remains authoritative');
const source=CALIFORNIA_GROCERY_SOURCES.find(source=>source.storeId===grocery[0].storeId)!;
const search=await route.POST(new Request('https://example.test/api/coverage',{method:'POST',body:JSON.stringify({state:'CA',query:source.city})}));
assert.equal(search.status,200);assert.ok((await search.json()).results.some((row:any)=>row.status==='covered'||row.status==='partially-covered'));

const mutations:[string,(row:any)=>void][]=[
  ['stale',row=>{row.stale=true;}],['source-stale',row=>{row.sourceStale=true;}],['quarantined',row=>{row.quarantined=true;}],
  ['runtime-quarantine',row=>{row.raw.sourceRuntimeNonAlertable=true;}],['stale-fallback',row=>{row.raw.staleFallback=true;}],
  ['shadow',row=>{row.raw.shadowOnly=true;}],['preview',row=>{row.previewOnly=true;}],
  ['onsite-disabled',row=>{row.eligibleForOnSite=false;}],['feed-disabled',row=>{row.eligibleForDropFeed=false;}],
  ['forged-premise',row=>{row.storeAddress='1 Forged Road';row.store_address=row.storeAddress;}],
  ['forged-product',row=>{row.sourceProductBinding.productId='forged';}],
  ['forged-source-host',row=>{row.sourceUrl='https://unreviewed.example/shop/product-details.'+row.productId+'.html';}],
  ['unverified-premise',row=>{row.sourceProductBinding.premisesVerified=false;}],
  ['unverified-channel',row=>{row.sourceProductBinding.inStoreChannelVerified=false;}],
  ['old-original-clock',row=>{row.observedAt=new Date(Date.now()-3*3600000).toISOString();row.observed_at=row.observedAt;row.lastConfirmedAt=row.observedAt;row.last_confirmed_at=row.observedAt;row.sourceProductBinding.observedAt=row.observedAt;}],
  ['new-confirmation-cannot-reset-original-clock',row=>{row.observedAt=new Date(Date.now()-3*3600000).toISOString();row.observed_at=row.observedAt;row.sourceProductBinding.observedAt=row.observedAt;row.lastConfirmedAt=now;row.last_confirmed_at=now;}],
];
async function rejectThroughRoutes(rows:any[],health:Record<string,unknown>[],label:string){
  routeDrops=rows;stats.refreshHealth.degradedStates=health as typeof degraded;revision++;
  const rejectedFeed=await feed.GET(new Request('https://example.test/api/drops?state=CA&limit=500'));
  assert.equal(rejectedFeed.status,200,label);assert.equal((await rejectedFeed.json()).drops.length,0,label+' Feed');
  const rejectedCoverage=await route.GET(new Request('https://example.test/api/coverage'));
  assert.equal(rejectedCoverage.status,200,label);assert.equal((await rejectedCoverage.json()).states.find((entry:any)=>entry.code==='CA').freshness.currentInventoryStores,0,label+' Coverage');
}
for(const [name,mutate] of mutations){const row=structuredClone(grocery[0]);row.raw||={};mutate(row);assert.equal(isPublicDropFeedEligible(row,options),false,name);await rejectThroughRoutes([row],degraded,name);}
for(const health of [
  [{state:'CA',status:'blocked',staleReason:'inventory_confirmation_overdue'}],
  [{state:'CA',status:'source_access_denied',staleReason:'inventory_confirmation_overdue'}],
  [{state:'CA',status:'degraded',staleReason:'source_access_denied'}],
  [{state:'CA',status:'degraded',staleReason:'inventory_confirmation_overdue, significant_drop_count_collapse'}],
  [{state:'CA',status:'degraded',staleReason:'inventory_confirmation_overdue',reasons:['missing_required_customer_fields']}],
  [{state:'CA',status:'degraded'}],
  [...degraded,{state:'CA',status:'blocked',staleReason:'inventory_confirmation_overdue'}],
]){assert.equal(isPublicDropFeedEligible(grocery[0],{...options,degradedStateReasons:publicDropDegradedStateReasons(health)}),false,JSON.stringify(health));await rejectThroughRoutes([grocery[0]],health,JSON.stringify(health));}
assert.equal(isPublicDropFeedEligible({...grocery[0],state:'WA',stateCode:'WA'},options),false,'exception cannot transfer states');
console.log(JSON.stringify({scope:capture?'immutable_capture_actual_customer_path_replay_no_source_HTTP':'synthetic_actual_customer_path_no_source_HTTP',groceryRows:grocery.length,currentStores:evidence.currentInventoryStores.length,feedStatus:200,coverageStatus:200,coverageSearchStatus:200,mutationNegatives:mutations.length+8,sourcePollIdsAdded:0}));
