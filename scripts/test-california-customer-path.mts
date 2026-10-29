import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BourbonBible} from '../engine/src/core/bible.mjs';
import {CALIFORNIA_GROCERY_SOURCES} from '../engine/src/collectors/california-grocery-premises.mjs';
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

// Synthetic stock observations exercise real reviewed LA/SF/Sac premises through
// the public projection and authored routes. They do not establish live coverage.
const fixture=JSON.parse(readFileSync('engine/test/fixtures/california-grocery-expansion/identity.json','utf8'));
const bible=new BourbonBible(fixture.records),observedAt=new Date().toISOString();
const sources=['Los Angeles','San Francisco','Sacramento'].map(city=>CALIFORNIA_GROCERY_SOURCES.find(source=>source.city===city)!);
const raw=sources.flatMap(source=>{
  const products=structuredClone(fixture.products);
  for(const product of products)product.storeId=source.merchantId;
  return parseGroceryExpansionInventory({response:{docs:products}},source,bible,{observedAt});
});
const operational=raw.map(row=>canonicalizeSignal(row,bible));
const drops=buildDrops(operational,bibleLookup(bible.records),operational).map(normalizeDropForSite);
assert.equal(drops.length,15);
const storeRows=CALIFORNIA_GROCERY_SOURCES.map(source=>({id:source.storeId,state:'CA',name:source.name,address:source.address,
  city:source.city,zip:source.zip,lat:source.lat,lng:source.lng,locationType:'store',precision:'store',searchable:true}));

const dropsRoute=loadWithMocks('src/app/api/drops/route.ts',{
  'next/server':{NextResponse:Response},
  'next/cache':{unstable_cache:(fn:Function)=>fn},
  '@clerk/nextjs/server':{auth:async()=>({userId:'fixture-member'}),clerkClient:async()=>({users:{getUser:async()=>({publicMetadata:{}})}})},
  '@/lib/server-entitlements':{getServerEntitlements:async()=>({tier:'barrel',feedPreviewLimit:null,canUseStateFilter:true,canUseAdvancedFilters:true,canUseBottleSearch:true,canUseDropFeedFilters:true})},
  '@/lib/source-lane-runtime':{readRuntimeSourceDropOverlay:async(rows:unknown[])=>({drops:rows,version:'ca-fixture'})},
  '@/lib/site-engine-contract':{normalizeDropForSite,readSiteExportIdentity:async()=> 'ca-fixture',
    readSiteExportResults:async()=>[{payload:{drops,generatedAt:observedAt},snapshotId:'ca-fixture',source:'remote-snapshot'},{payload:{generatedAt:observedAt}}],siteExportHeaders:()=>({})},
  '@/lib/drop-classification':{DROP_FEED_CLASSIFICATION_TIERS:['limited','allocated','unicorn'],getDropClassificationIndex:()=>({version:'fixture'}),classifyPublicDrop:(drop:any)=>({...drop,rarity_tier:drop.rarity_tier||drop.tier,classification_source:'fixture'})},
  '@/lib/retailer-public-submissions':{readCachedPublicRetailerSubmissions:async()=>[]},
});
const feed=createSignalFeedHandler({getDrops:(request)=>dropsRoute.GET(request),getSightings:async()=>Response.json({sightings:[],totalSightings:0})});

const unknown={id:'unreviewed-ca',state:'CA',name:'Unknown',city:'Los Angeles',address:'999999 Unreviewed Road'};
const closed={id:'closed-ca',state:'CA',name:'Closed',city:'Los Angeles',address:'999998 Closed Road',status:'closed'};
const directoryModule=loadWithMocks('src/lib/sighting-store-directory.ts',{
  'next/cache':{unstable_cache:(fn:Function)=>fn},
  './site-engine-contract':{readSiteExportResults:async()=>[{payload:{stores:[...storeRows,unknown,closed]}}],readBundledSiteExport:()=>null},
  './approved-catalog-service':{listApprovedLocations:async()=>[]},
});
const directory=await directoryModule.readSightingStoreDirectory();
assert.ok(!directory.some((row:any)=>row.id===unknown.id||row.id===closed.id));
for(const source of storeRows)assert.ok(directory.some((row:any)=>sightingStoreAddressKey(row)===sightingStoreAddressKey(source)),source.address);

const storesRoute=loadWithMocks('src/app/api/stores/route.ts',{
  '@/lib/sighting-store-directory':{readSightingStoreDirectory:async()=>directory,SIGHTING_STORE_DIRECTORY_VERSION:'fixture'},
  '@/lib/site-engine-contract':{readSiteExport:async()=>({generatedAt:observedAt}),siteExportHeaders:()=>({}),listStates:()=>['CA'],normalizeStoreForSite},
});
const locationsRoute=loadWithMocks('src/app/api/locations/route.ts',{
  '@/lib/site-engine-contract':{readSiteExport:async(name:string)=>name==='drops'?{drops}:{stores:storeRows,generatedAt:observedAt},readBundledSiteExport:()=>null,
    siteExportHeaders:()=>({}),listStates:()=>['CA'],normalizeStoreForSite,normalizeDropForSite},
});
const areaDirectory=buildSignalFeedAreaDirectory();
assert.equal(areaOptionsForState(areaDirectory,'CA').length,29);
assert.equal(prepareMobileOnboarding({displayName:'California Hunter',age21Affirmed:true,homeState:'CA'}).publicMetadata.memberProfile.homeState,'CA');

for(const source of sources){
  const filters=normalizedFilters({...DEFAULT_SIGNAL_FILTERS,state:'CA',area:source.city},areaDirectory);
  assert.equal(filters.area,source.city);
  assert.ok(areaOptionsForState(areaDirectory,'CA').some(option=>option.value===source.city));
  const query='state=CA&area='+encodeURIComponent(filters.area);
  const response=await feed(new Request('https://example.test/api/v1/signals?view=market&'+query));
  assert.equal(response.status,200);
  const page=await response.json();
  assert.equal(page.signals.length,5,`${source.city} must survive actual drop and Signal route filters`);
  assert.ok(page.signals.every((row:any)=>row.location.store.city===source.city));
  const scopes=monitoringScopesFromPreferences({states:['CA'],caAreas:[source.city]});
  const prefs=normalizeAreaPrefs({states:['CA'],caAreas:[source.city]});
  assert.deepEqual(prefs.caAreas,[source.city]);
  const candidate=raw.find(row=>row.storeId===source.storeId)!;
  assert.equal(candidateMatchesMonitoringScopes(candidate,scopes),true);
  assert.equal(candidateMatchesArea(candidate as never,prefs),true);
  assert.equal(candidateMatchesMonitoringScopes({...candidate,city:'San Diego',storeAddress:'1 Test Street, San Diego, CA 92101'},scopes),false);
  assert.equal(candidateToMemberAlert('fixture',candidate as never,observedAt,prefs).matchedArea,source.city);
  assert.equal(matchDropToPreferences(drops.find((row:any)=>row.store_city===source.city) as never,prefs as never).matchedArea,source.city);
  const preview=buildWelcomeLocalPreviewSnapshot({target:{kind:'city',stateCode:'CA',label:source.city,status:'covered',city:source.city,address:null,areaLabel:source.city},drops});
  assert.equal(preview.recent.length,5);
  assert.ok(preview.recent.every(row=>row.store_city===source.city));
  for(const route of[storesRoute,locationsRoute]){
    const result=await route.GET(new Request('https://example.test/api/stores?'+query));
    assert.equal(result.status,200);
    const payload=await result.json();
    assert.ok(payload.stores.length>0);
    assert.ok(payload.stores.every((row:any)=>row.city.toLowerCase()===source.city.toLowerCase()),JSON.stringify(payload.stores.filter((row:any)=>row.city.toLowerCase()!==source.city.toLowerCase()).slice(0,3)));
    if(route===locationsRoute){
      const nearby=searchSightingStores(payload.stores.map(normalizeMapStore),'',{origin:{lat:source.lat,lng:source.lng},limit:1});
      assert.equal(nearby[0].id,source.storeId);
      assert.equal(nearby[0].lat,source.lat);
      assert.equal(nearby[0].lng,source.lng);
    }
  }
}
assert.equal((await storesRoute.GET(new Request('https://example.test/api/stores?state=CA&area=Fresno'))).status,400);
console.log('LA, SF and Sacramento source projection, onboarding, mobile Feed, real API routes, Radar scopes, alert labels, welcome preview and nearby ranking passed; all 78 reviewed premises selectable, unknown/closed rows rejected.');
