import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BourbonBible} from '../engine/src/core/bible.mjs';
import {ILLINOIS_GROCERY_SOURCES} from '../engine/src/collectors/illinois-grocery-premises.mjs';
import {parseGroceryExpansionInventory} from '../engine/src/collectors/grocery-xapi-expansion.mjs';
import {canonicalizeSignal} from '../engine/src/operational-report.mjs';
import {bibleLookup,buildDrops} from '../engine/src/export-site-contract.mjs';
import * as harness from '../apps/mobile/src/astra-test-harness.ts';
import * as mobileFilterModule from '../apps/mobile/src/signals/feed-filters.ts';
const {normalizedFilters,areaOptionsForState,DEFAULT_SIGNAL_FILTERS} = ('default' in mobileFilterModule ? mobileFilterModule.default : mobileFilterModule) as typeof import('../apps/mobile/src/signals/feed-filters.ts');
import * as areaModule from '../src/lib/feed-area-options.ts';
import * as feedModule from '../src/lib/signals/signal-route.ts';
import * as scopeModule from '../src/lib/monitoring-scopes.ts';
import * as matcherModule from '../src/lib/monitoring-scope-matcher.ts';
import * as deliveryModule from '../src/lib/alert-delivery.ts';
import * as emailModule from '../src/lib/email-alerts.ts';
import * as welcomeModule from '../src/lib/welcome-local-preview.ts';
import * as onboardingModule from '../src/lib/mobile-onboarding.ts';
import * as mapModule from '../src/lib/store-map.ts';
import * as nearbyModule from '../src/lib/sighting-store-search.ts';
import * as directoryCore from '../src/lib/sighting-store-directory-core.ts';
import * as contractModule from '../src/lib/site-engine-contract.ts';
function interop<T>(value:T):T { return (value as {default?:T}).default || value; }
const {loadWithMocks}=interop(harness);
const {buildSignalFeedAreaDirectory}=interop(areaModule);
const {createSignalFeedHandler}=interop(feedModule);
const {monitoringScopesFromPreferences}=interop(scopeModule);
const {candidateMatchesMonitoringScopes}=interop(matcherModule);
const {normalizeAreaPrefs,candidateMatchesArea,candidateToMemberAlert}=interop(deliveryModule);
const {matchDropToPreferences}=interop(emailModule);
const {buildWelcomeLocalPreviewSnapshot}=interop(welcomeModule);
const {prepareMobileOnboarding}=interop(onboardingModule);
const {normalizeMapStore}=interop(mapModule);
const {searchSightingStores}=interop(nearbyModule);
const {sightingStoreAddressKey}=interop(directoryCore);
const {normalizeDropForSite,normalizeStoreForSite}=interop(contractModule);

// Synthetic stock observations exercise reviewed prior and expanded premises through
// the public projection and authored routes. They do not establish live coverage.
const fixture=JSON.parse(readFileSync('engine/test/fixtures/illinois-grocery/identity.json','utf8'));
const bible=new BourbonBible(fixture.records),observedAt=new Date().toISOString();
const sources=['Chicago','Naperville','Bloomington','Normal','Dekalb','Addison'].map(city=>ILLINOIS_GROCERY_SOURCES.find(source=>source.city===city)!);
const raw=sources.flatMap(source=>{
  const products=structuredClone(fixture.products);
  for(const product of products)product.storeId=source.merchantId;
  return parseGroceryExpansionInventory({response:{docs:products}},source,bible,{observedAt});
});
const operational=raw.map(row=>canonicalizeSignal(row,bible));
const drops=buildDrops(operational,bibleLookup(bible.records),operational).map(normalizeDropForSite);
assert.equal(drops.length,sources.length*6);
const storeRows=ILLINOIS_GROCERY_SOURCES.map(source=>({id:source.storeId,state:'IL',name:source.name,address:source.address,
  city:source.city,zip:source.zip,lat:source.lat,lng:source.lng,locationType:'store',precision:'store',searchable:true}));

const dropsRoute=loadWithMocks('src/app/api/drops/route.ts',{
  'next/server':{NextResponse:Response},
  'next/cache':{unstable_cache:(fn:Function)=>fn},
  '@clerk/nextjs/server':{auth:async()=>({userId:'fixture-member'}),clerkClient:async()=>({users:{getUser:async()=>({publicMetadata:{}})}})},
  '@/lib/server-entitlements':{getServerEntitlements:async()=>({tier:'barrel',feedPreviewLimit:null,canUseStateFilter:true,canUseAdvancedFilters:true,canUseBottleSearch:true,canUseDropFeedFilters:true})},
  '@/lib/source-lane-runtime':{readRuntimeSourceDropOverlay:async(rows:unknown[])=>({drops:rows,version:'il-fixture'})},
  '@/lib/site-engine-contract':{normalizeDropForSite,readSiteExportIdentity:async()=> 'il-fixture',
    readSiteExportResults:async()=>[{payload:{drops,generatedAt:observedAt},snapshotId:'il-fixture',source:'remote-snapshot'},{payload:{generatedAt:observedAt}}],siteExportHeaders:()=>({})},
  '@/lib/drop-classification':{DROP_FEED_CLASSIFICATION_TIERS:['limited','allocated','unicorn'],getDropClassificationIndex:()=>({version:'fixture'}),classifyPublicDrop:(drop:any)=>({...drop,rarity_tier:drop.rarity_tier||drop.tier,classification_source:'fixture'})},
  '@/lib/retailer-public-submissions':{readCachedPublicRetailerSubmissions:async()=>[]},
});
const feed=createSignalFeedHandler({getDrops:(request)=>dropsRoute.GET(request),getSightings:async()=>Response.json({sightings:[],totalSightings:0})});

const unknown={id:'unreviewed-il',state:'IL',name:'Unknown',city:'Los Angeles',address:'999999 Unreviewed Road'};
const closed={id:'closed-il',state:'IL',name:'Closed',city:'Los Angeles',address:'999998 Closed Road',status:'closed'};
const directoryModule=loadWithMocks('src/lib/sighting-store-directory.ts',{
  'next/cache':{unstable_cache:(fn:Function)=>fn},
  './site-engine-contract':{readSiteExportResults:async()=>[{payload:{stores:[...storeRows,unknown,closed]}}],readBundledSiteExport:()=>null},
  './approved-catalog-service':{listApprovedLocations:async()=>[]},
});
const directory=await directoryModule.readSightingStoreDirectory();
assert.ok(!directory.some((row:any)=>row.id===closed.id));
for(const source of storeRows)assert.ok(directory.some((row:any)=>sightingStoreAddressKey(row)===sightingStoreAddressKey(source)),source.address);

const storesRoute=loadWithMocks('src/app/api/stores/route.ts',{
  '@/lib/sighting-store-directory':{readSightingStoreDirectory:async()=>directory,SIGHTING_STORE_DIRECTORY_VERSION:'fixture'},
  '@/lib/site-engine-contract':{readSiteExport:async()=>({generatedAt:observedAt}),siteExportHeaders:()=>({}),listStates:()=>['IL'],normalizeStoreForSite},
});
const locationsRoute=loadWithMocks('src/app/api/locations/route.ts',{
  '@/lib/site-engine-contract':{readSiteExport:async(name:string)=>name==='drops'?{drops}:{stores:storeRows,generatedAt:observedAt},readBundledSiteExport:()=>null,
    siteExportHeaders:()=>({}),listStates:()=>['IL'],normalizeStoreForSite,normalizeDropForSite},
});
const areaDirectory=buildSignalFeedAreaDirectory();
assert.equal(areaOptionsForState(areaDirectory,'IL').length,126);
assert.equal(prepareMobileOnboarding({displayName:'Illinois Hunter',age21Affirmed:true,homeState:'IL'}).publicMetadata.memberProfile.homeState,'IL');

for(const source of sources){
  const filters=normalizedFilters({...DEFAULT_SIGNAL_FILTERS,state:'IL',area:source.city},areaDirectory);
  assert.equal(filters.area,source.city);
  assert.ok(areaOptionsForState(areaDirectory,'IL').some(option=>option.value===source.city));
  const query='state=IL&area='+encodeURIComponent(filters.area);
  const response=await feed(new Request('https://example.test/api/v1/signals?view=market&'+query));
  assert.equal(response.status,200);
  const page=await response.json();
  assert.equal(page.signals.length,6,`${source.city} must survive actual drop and Signal route filters`);
  assert.ok(page.signals.every((row:any)=>row.location.store.city===source.city));
  const scopes=monitoringScopesFromPreferences({monitoringScopes:[{type:'city',id:'city:legacy:IL:'+source.city.toLowerCase().replace(/[^a-z0-9]+/g,'-'),state:'IL',label:source.city}]});
  const prefs=normalizeAreaPrefs({states:['IL']},scopes);
  const candidate=raw.find(row=>row.storeId===source.storeId)!;
  assert.equal(candidateMatchesMonitoringScopes(candidate,scopes),true);
  assert.equal(candidateMatchesArea(candidate as never,prefs),true);
  assert.equal(candidateMatchesMonitoringScopes({...candidate,city:'Unrelated City',storeAddress:'1 Test Street, Unrelated City, IL 60001'},scopes),false);
  assert.equal(candidateToMemberAlert('fixture',candidate as never,observedAt,prefs).matchedArea,source.city);
  const preview=buildWelcomeLocalPreviewSnapshot({target:{kind:'city',stateCode:'IL',label:source.city,status:'covered',city:source.city,address:null,areaLabel:source.city},drops});
  assert.equal(preview.recent.length,5);
  assert.ok(preview.recent.every(row=>row.store_city===source.city));
  for(const route of[storesRoute,locationsRoute]){
    const result=await route.GET(new Request('https://example.test/api/stores?state=IL'));
    assert.equal(result.status,200);
    const payload=await result.json();
    assert.ok(payload.stores.length>0);
    if(route===locationsRoute){
      const nearby=searchSightingStores(payload.stores.map(normalizeMapStore),'',{origin:{lat:source.lat,lng:source.lng},limit:1});
      assert.equal(nearby[0].id,source.storeId);
      assert.equal(nearby[0].lat,source.lat);
      assert.equal(nearby[0].lng,source.lng);
    }
  }
}
console.log('Six Illinois cities pass the real Feed/drop routes, mobile filters, city monitoring scopes, alert labels, welcome preview, store directory and nearby map; all 180 reviewed premises remain selectable. Synthetic route replay is not live coverage proof.');
