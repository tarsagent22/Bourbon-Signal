import assert from 'node:assert/strict';
import * as harness from '../apps/mobile/src/astra-test-harness.ts';
const {loadWithMocks} = ('default' in harness ? {...harness, ...(harness.default as object)} : harness) as typeof import('../apps/mobile/src/astra-test-harness.ts');
import * as routes from '../src/lib/signals/signal-route.ts';
const {createSignalFeedHandler} = ('default' in routes ? {...routes, ...(routes.default as object)} : routes) as typeof import('../src/lib/signals/signal-route.ts');
import * as caches from '../src/lib/prepared-drop-cache.ts';
const {createPreparedDropCache,createAsyncPreparedDropCache} = ('default' in caches ? {...caches, ...(caches.default as object)} : caches) as typeof import('../src/lib/prepared-drop-cache.ts');
let signedIn=true; let tier='barrel';let normalizeCount=0;let snapshot='one';
const now=Date.now();
const make=(id:string,rarity:string,age:number,state='OH')=>({id,canonical_name:'Example '+id,canonicalName:'Example '+id,bottleName:'Example '+id,state,type:'store_inventory_result',event_type:'store_inventory_result',tier:rarity,rarity_tier:rarity,quantity:4,quantity_in_stock:4,locationPrecision:'store_level',canAlertAsInventory:true,observed_at:new Date(now-age).toISOString(),last_confirmed_at:new Date(now-age).toISOString(),timestamp:new Date(now-age).toISOString()});
const rows=[...Array.from({length:151},(_,i)=>make('limited-'+i,'limited',i*1000)),make('match-1','allocated',200000),make('match-2','unicorn',300000),make('historical','unicorn',20*86400000)];
const route=loadWithMocks('src/app/api/drops/route.ts',{
 'next/server':{NextResponse:Response},
 '@clerk/nextjs/server':{auth:async()=>({userId:signedIn?'test':null}),clerkClient:async()=>({users:{getUser:async()=>({publicMetadata:{}})}})},
 '@/lib/server-entitlements':{getServerEntitlements:async()=>({tier,feedPreviewLimit:tier==='free'?7:null,canUseAdvancedFilters:tier==='barrel',canUseBottleSearch:tier==='barrel',canUseDropFeedFilters:tier==='barrel'})},
 '@/lib/source-lane-runtime':{readRuntimeSourceDropOverlay:async(drops:unknown[])=>({drops,version:'one'})},
 '@/lib/site-engine-contract':{normalizeDropForSite:(row:object)=>{normalizeCount++;return {...row};},readSiteExportIdentity:async()=>snapshot,readSiteExportResults:async()=>[{payload:{drops:rows,generatedAt:new Date(now).toISOString()},snapshotId:snapshot,source:'remote-snapshot'},{payload:{generatedAt:new Date(now).toISOString()}}],siteExportHeaders:()=>({})},
 '@/lib/drop-classification':{DROP_FEED_CLASSIFICATION_TIERS:['limited','allocated','unicorn'],getDropClassificationIndex:()=>({version:'one'}),resolveDropClassification:(drop:any)=>({tier:drop.tier,source:'test'})},
 '@/lib/retailer-public-submissions':{readCachedPublicRetailerSubmissions:async()=>[]},
});
const handler=createSignalFeedHandler({getDrops:(request)=>route.GET(request),getSightings:async()=>Response.json({sightings:[],totalSightings:0,previewLimit:null})});
const base='https://example.test/api/v1/signals?view=market&limit=1&tiers=allocated,unicorn';
const firstResponse=await handler(new Request(base));
assert.match(firstResponse.headers.get("Server-Timing") || "", /prepare;dur=.*build/);
let page=await firstResponse.json();
assert.equal(page.signals[0].id,'trusted_source:match-1','a match after 151 unselected rows must be returned in the first page');
assert.equal(page.hasMore,true);
const firstNormalize=normalizeCount;
const ids=[page.signals[0].id];
while(page.nextCursor){page=await(await handler(new Request(base+'&cursor='+encodeURIComponent(page.nextCursor)))).json();ids.push(...page.signals.map((s:any)=>s.id));}
assert.deepEqual(ids,['trusted_source:match-1','trusted_source:match-2','trusted_source:historical']);
assert.equal(page.signals[0].historical,true);assert.equal(page.signals[0].availability.status,'reported');assert.equal(page.signals[0].alertEligibility.inventory,false);
assert.match((await handler(new Request(base))).headers.get("Server-Timing") || "", /desc="cache"/);
assert.equal(normalizeCount,firstNormalize,'paging and filter changes reuse prepared snapshot data');
const recent=await(await handler(new Request(base+'&freshness=7d'))).json();assert.equal(recent.signals[0].historical,undefined);
const noState=await(await handler(new Request(base+'&state=NC'))).json();assert.deepEqual(noState.signals,[],'filters must never broaden silently');
snapshot='two';await handler(new Request(base));assert.equal(normalizeCount,firstNormalize*2,'snapshot replacement invalidates prepared data');
tier='free';const free=await(await handler(new Request(base))).json();assert.equal(free.signals.length,0);assert.equal(free.access.marketDetailsLocked,true,'cached public preparation cannot leak paid locations');
signedIn=false;const anon=await(await handler(new Request(base))).json();assert.equal(anon.signals.length,0);
let builds=0;const cache=createPreparedDropCache<number>(2,10);cache.get('a',()=>++builds,0);cache.get('a',()=>++builds,1);assert.equal(builds,1);cache.get('a',()=>++builds,11);assert.equal(builds,2);
console.log('Filtered first page, multi-page history, honest availability, snapshot cache, freshness, geographic isolation and private access passed.');

let time=0;let preparations=0;let finish:(value:number)=>void=()=>{};
const asyncCache=createAsyncPreparedDropCache<number>(10,()=>time);
const prepare=()=>{preparations++;return new Promise<number>(resolve=>{finish=resolve;});};
const waitingA=asyncCache.get('snapshot-a',prepare);const waitingB=asyncCache.get('snapshot-a',prepare);
await Promise.resolve();assert.equal(preparations,1);time=100;finish(1);
await Promise.all([waitingA,waitingB]);assert.equal((await asyncCache.get('snapshot-a',async()=>2)).value,1,'slow preparation does not consume its cache lifetime');
time=111;assert.equal((await asyncCache.get('snapshot-a',async()=>2)).value,2);
assert.equal((await asyncCache.get('snapshot-b',async()=>3)).value,3,'pointer replacement never reuses prior snapshot');
await assert.rejects(asyncCache.get('broken',async()=>{throw Error('failed');}));
assert.equal((await asyncCache.get('broken',async()=>4)).value,4,'failed attempts can be retried immediately');
console.log('Complete public preparation coalescing, TTL, pointer replacement and error recovery passed.');
