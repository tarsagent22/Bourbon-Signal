import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BourbonBible} from '../engine/src/core/bible.mjs';
import {NEW_YORK_VARIANT_PICKUP_SOURCES,collectNewYorkVariantPickup} from '../engine/src/collectors/new-york-variant-pickup.mjs';
import {canonicalizeSignal} from '../engine/src/operational-report.mjs';
import {bibleLookup,buildDrops} from '../engine/src/export-site-contract.mjs';
import * as harness from '../apps/mobile/src/astra-test-harness.ts';
import * as areaModule from '../src/lib/new-york-area.ts';
import * as menuModule from '../src/lib/feed-area-options.ts';
import * as scopeModule from '../src/lib/monitoring-scopes.ts';
import * as matcherModule from '../src/lib/monitoring-scope-matcher.ts';
import * as deliveryModule from '../src/lib/alert-delivery.ts';
import * as contractModule from '../src/lib/site-engine-contract.ts';
import * as feedModule from '../src/lib/signals/signal-route.ts';
import * as mobileFilterModule from '../apps/mobile/src/signals/feed-filters.ts';
function interop<T>(value:T):T{return(value as {default?:T}).default||value;}
const {loadWithMocks}=interop(harness);
const {SUPPORTED_NEW_YORK_AREAS,newYorkAreaMatchesFields,normalizeNewYorkAreas,parseNewYorkAreaQuery,reviewedNewYorkStoreCounty}=interop(areaModule);
const {buildSignalFeedAreaDirectory,buildDropFeedAreaRequest}=interop(menuModule);
const {monitoringScopesFromPreferences}=interop(scopeModule);
const {candidateMatchesMonitoringScopes}=interop(matcherModule);
const {normalizeAreaPrefs,candidateMatchesArea,candidateToMemberAlert}=interop(deliveryModule);
const {normalizeDropForSite}=interop(contractModule);
const {createSignalFeedHandler}=interop(feedModule);
const {normalizedFilters,areaOptionsForState,DEFAULT_SIGNAL_FILTERS}=interop(mobileFilterModule);

// Captured source bodies replayed at a synthetic current observation time test
// projection/route behavior; these are not new live customer-coverage evidence.
const directory='engine/test/fixtures/new-york-variant-pickup-20261028/';
const bible=new BourbonBible(JSON.parse(readFileSync(directory+'bible.json','utf8')).records);
const observedAt=new Date().toISOString(),raw:any[]=[];
for(const id of ['winecity-east-northport','grand-wine-cellar']){
  const source=NEW_YORK_VARIANT_PICKUP_SOURCES.find(source=>source.id===id)!;
  const seed=source.pickupDefinition.products[0];
  const bodies=new Map([
    [seed.evidence.product.url,readFileSync(directory+id+'-product.json','utf8')],
    [seed.evidence.pickup.url,readFileSync(directory+id+'-pickup.html','utf8')],
  ]);
  const result=await collectNewYorkVariantPickup({id:'NY'},bible,source,observedAt,{
    fetchText:async(url:string)=>({ok:true,status:200,url,text:bodies.get(url)}),
  });
  raw.push(...result.signals);
}
const operational=raw.map(row=>canonicalizeSignal(row,bible));
const drops=buildDrops(operational,bibleLookup(bible.records),operational).map(normalizeDropForSite);
assert.equal(drops.length,2);
const candidate=raw.find(row=>row.storeId==='winecity-east-northport:11731')!;
assert.ok(candidate);
assert.deepEqual(parseNewYorkAreaQuery('Suffolk County'),{requested:true,valid:true,areas:['Suffolk County']});
assert.deepEqual(normalizeNewYorkAreas(['Suffolk','East Northport']),['Suffolk County']);
assert.equal(newYorkAreaMatchesFields([candidate.city],SUPPORTED_NEW_YORK_AREAS),true,'client default menu must retain East Northport');
assert.equal(newYorkAreaMatchesFields([candidate.storeAddress],['Suffolk County']),true);
for(const fields of [['Huntington, NY'],['Long Island, NY'],['Northport, NY'],['East Northport, VA 11731'],['4001 Unreviewed Road, Albany NY 12207']]){
  assert.equal(newYorkAreaMatchesFields(fields,['Suffolk County']),false,fields.join());
}
assert.equal(newYorkAreaMatchesFields([candidate.city,candidate.storeAddress],['Nassau County']),false);
assert.equal(newYorkAreaMatchesFields([candidate.city,candidate.storeAddress],['New York City']),false);
const scopes=monitoringScopesFromPreferences({states:['NY'],nyAreas:['Suffolk County']});
assert.deepEqual(scopes,[{type:'county',id:'county:36103',state:'NY',label:'Suffolk County'}]);
assert.equal(reviewedNewYorkStoreCounty(candidate),'Suffolk County');
assert.equal(candidateMatchesMonitoringScopes(candidate,scopes),true);
const grand=raw.find(row=>row.storeId==='grand-wine-cellar:11791')!;
assert.equal(candidateMatchesMonitoringScopes(grand,monitoringScopesFromPreferences({states:['NY'],nyAreas:['Nassau County']})),true);
assert.equal(candidateMatchesMonitoringScopes(grand,scopes),false);
for(const patch of [{storeId:'another-east-northport-store'},{storeAddress:'4001 Jericho Tpke, East Northport NY 11731'},{state:'VA'}]){
  const changed={...candidate,...patch};
  assert.equal(reviewedNewYorkStoreCounty(changed),null);
  assert.equal(candidateMatchesMonitoringScopes(changed,scopes),false);
}
const prefs=normalizeAreaPrefs({states:['NY'],nyAreas:['Suffolk County']});
assert.equal(candidateMatchesArea(candidate,prefs),true);
assert.equal(candidateToMemberAlert('fixture',candidate,observedAt,prefs).matchedArea,'Suffolk County');
const areaDirectory=buildSignalFeedAreaDirectory();
assert.ok(areaOptionsForState(areaDirectory,'NY').some(option=>option.value==='Suffolk County'));
assert.equal(normalizedFilters({...DEFAULT_SIGNAL_FILTERS,state:'NY',area:'Suffolk County'},areaDirectory).area,'Suffolk County');
assert.deepEqual(buildDropFeedAreaRequest('NY','NY::Suffolk County'),{key:'area',value:'Suffolk County'});

function route(member=true){return loadWithMocks('src/app/api/drops/route.ts',{
  'next/server':{NextResponse:Response},'next/cache':{unstable_cache:(fn:Function)=>fn},
  '@clerk/nextjs/server':{auth:async()=>({userId:member?'fixture-member':null}),clerkClient:async()=>({users:{getUser:async()=>({publicMetadata:{}})}})},
  '@/lib/server-entitlements':{getServerEntitlements:async()=>({tier:'barrel',feedPreviewLimit:null,canUseStateFilter:true,canUseAdvancedFilters:true,canUseBottleSearch:true,canUseDropFeedFilters:true})},
  '@/lib/source-lane-runtime':{readRuntimeSourceDropOverlay:async(rows:unknown[])=>({drops:rows,version:'suffolk-fixture'})},
  '@/lib/site-engine-contract':{normalizeDropForSite,readSiteExportIdentity:async()=> 'suffolk-fixture',
    readSiteExportResults:async()=>[{payload:{drops,generatedAt:observedAt},snapshotId:'suffolk-fixture',source:'remote-snapshot'},{payload:{generatedAt:observedAt}}],siteExportHeaders:()=>({})},
  '@/lib/drop-classification':{DROP_FEED_CLASSIFICATION_TIERS:['limited','allocated','unicorn'],getDropClassificationIndex:()=>({version:'fixture'}),classifyPublicDrop:(drop:any)=>({...drop,rarity_tier:drop.rarity_tier||drop.tier,classification_source:'fixture'})},
  '@/lib/retailer-public-submissions':{readCachedPublicRetailerSubmissions:async()=>[]},
});}
const paid=route();
for(const query of ['state=NY','state=NY&area=Suffolk%20County','state=NY&store=winecity-east-northport%3A11731','state=NY&area=Suffolk%20County&store=winecity-east-northport%3A11731']){
  const response=await paid.GET(new Request('https://example.test/api/drops?'+query));
  assert.equal(response.status,200,query);
  const page=await response.json();
  assert.equal(page.drops.length,query==='state=NY'?2:1,query);
  assert.ok(page.drops.some((drop:any)=>drop.store_id===candidate.storeId),query);
  if(query!=='state=NY')assert.ok(page.drops.every((drop:any)=>drop.store_id===candidate.storeId),query);
}
assert.equal((await paid.GET(new Request('https://example.test/api/drops?state=NY&area=Syracuse'))).status,400);
assert.equal((await route(false).GET(new Request('https://example.test/api/drops?state=NY&area=Suffolk%20County'))).status,403);
const feed=createSignalFeedHandler({getDrops:(request)=>paid.GET(request),getSightings:async()=>Response.json({sightings:[],totalSightings:0})});
const response=await feed(new Request('https://example.test/api/v1/signals?view=market&state=NY&area=Suffolk%20County'));
assert.equal(response.status,200);
const page=await response.json();assert.equal(page.signals.length,1);assert.equal(page.signals[0].location.store.city,'East Northport');
console.log('Suffolk reviewed pickup survives actual paid state, store, area and mobile Feed routes; county36103 preferences match only the reviewed premise, unsupported areas and anonymous filters remain blocked.');
