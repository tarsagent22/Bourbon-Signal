import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {brotliCompressSync,constants} from "node:zlib";
import type {SightingStoreDirectoryEntry} from "../src/lib/sighting-store-directory-core.ts";
import * as core from "../src/lib/sighting-store-directory-core.ts";
const {mergeSightingStoreRows,normalizeSightingStore,searchSightingStoreDirectory,sightingStoreAddressKey} = ("default" in core ? {...core,...core.default as object} : core) as typeof import("../src/lib/sighting-store-directory-core.ts");
import * as harness from "../apps/mobile/src/astra-test-harness.ts";
const {loadWithMocks} = ("default" in harness ? {...harness,...harness.default as object} : harness) as typeof import("../apps/mobile/src/astra-test-harness.ts");
const data=JSON.parse(readFileSync(new URL("../src/data/sighting-store-directory.generated.json",import.meta.url),"utf8"));
const stores=data.stores as SightingStoreDirectoryEntry[];
const keys=stores.map(sightingStoreAddressKey);
assert.equal(new Set(keys).size,stores.length,"physical locations must be deduplicated");
assert.equal(new Set(stores.map(s=>`${s.state}:${s.id}`)).size,stores.length,"selection identities must not collide within a state");
for(const store of stores)assert.ok(normalizeSightingStore(store as unknown as Record<string,unknown>),`invalid selectable store ${store.id}`);
assert.equal(stores.filter(s=>s.state==="NC").length,466);
const ncSource=data.sources.find((s:any)=>s.state==="NC"&&s.boards);
assert.equal(ncSource.boards.length,173,"every official NC ABC board must have been fetched");
assert.equal(ncSource.boards.reduce((n:number,b:any)=>n+b.count,0),466,"every official NC ABC store must be retained");
for(const state of data.focusedStates)assert.ok(stores.some(s=>s.state===state),`missing focused state ${state}`);
assert.ok(searchSightingStoreDirectory(stores,"Lewisville","NC").some(s=>/6850 Shallowford/i.test(s.address)));
const raleighMatches=searchSightingStoreDirectory(stores,"ABC Raleigh","NC");
const raleighStores=stores.filter(s=>s.state==="NC"&&s.city.toLowerCase()==="raleigh");
assert.ok(raleighStores.length>0);
assert.ok(raleighMatches.slice(0,raleighStores.length).every(store=>store.city==="Raleigh"),"city matches must rank ahead of unrelated stores on Raleigh-named streets");
for(const store of raleighStores)assert.ok(raleighMatches.some(match=>match.id===store.id),"word order must not hide a Raleigh ABC store");
assert.ok(searchSightingStoreDirectory(stores,"854 uni","NC").some(s=>/854 Union/i.test(s.address)),"partial street input must find Concord ABC");
assert.ok(searchSightingStoreDirectory(stores,"2760","NC").some(s=>s.zip?.startsWith("2760")),"ZIP prefixes are searchable");
assert.ok(searchSightingStoreDirectory(stores,"ABC Raleigh","VA").length===0,"selected state must never broaden");
const row={id:"original",state:"NC",name:"ABC Store",address:"123 Main Street, Raleigh, NC 27601",city:"Raleigh"};
assert.equal(mergeSightingStoreRows([row,{...row,id:"second",address:"123 Main St"}]).length,1,"full and abbreviated address spellings dedupe");
assert.equal(mergeSightingStoreRows([{...row,address:"Raleigh, NC"}]).length,0,"city-only approvals are not physical stores");
assert.equal(mergeSightingStoreRows([{...row,locationType:"county_board"}]).length,0,"board headquarters are not sighting stores");
assert.equal(mergeSightingStoreRows([{...row,status:"closed"}]).length,0);
const raw=Buffer.from(JSON.stringify(stores));
const packed=brotliCompressSync(raw,{params:{[constants.BROTLI_PARAM_QUALITY]:4}}).toString("base64");
assert.ok(packed.length<1_900_000,"complete library must fit the shared cache");
assert.ok(raw.length<16*1024*1024,"decoded library remains bounded");
let signedIn=true;
const geography=loadWithMocks("src/app/api/v1/geography/route.ts",{
 "@clerk/nextjs/server":{auth:async()=>({userId:signedIn?"fixture":null})},
 "next/cache":{unstable_cache:(fn:Function)=>fn},
 "@/lib/sighting-store-directory":{readSightingStoreDirectory:async()=>stores},
 "@/lib/community-sightings-repository":{createCommunitySightingsRepository:()=>({listRecentGeographyActivity:async()=>[]})},
});
const found=new Set<string>();
for(let offset=0;offset<500;offset+=50){
 const response=await geography.GET(new Request(`https://example.test/api/v1/geography?levels=store&state=NC&limit=50&offset=${offset}`));
 assert.equal(response.status,200);const page=await response.json();assert.equal(page.total,466);
 for(const result of page.results){assert.equal(result.level,"store");assert.equal(result.state,"NC");assert.ok(result.storeId&&result.name&&result.address&&result.city);assert.ok(!found.has(result.storeId),"paging may not repeat a store");found.add(result.storeId);}
 if(!page.hasMore)break;
}
assert.equal(found.size,466,"all official NC stores must be selectable through the actual API");
const deep=await(await geography.GET(new Request("https://example.test/api/v1/geography?levels=store&state=CA&limit=50&offset=12000"))).json();
assert.equal(deep.offset,12000,"large statewide libraries must page beyond the previous 10,000-row cap");
assert.ok(deep.results.length>0);
signedIn=false;
assert.equal((await geography.GET(new Request("https://example.test/api/v1/geography?levels=store"))).status,401);
const directory=loadWithMocks("src/lib/sighting-store-directory.ts",{
 "next/cache":{unstable_cache:(fn:Function)=>fn},
 "./site-engine-contract":{readSiteExportResults:async()=>{throw Error("offline");},readBundledSiteExport:()=>null},
 "./approved-catalog-service":{listApprovedLocations:async()=>[{id:"bad",state:"NC",name:"Marshville",address:"Marshville, NC",city:"Marshville"},{id:"owner-approved",state:"CA",name:"Owner-approved retailer",address:"123456 Example Street",city:"Example City"}]},
});
const fallback=await directory.readSightingStoreDirectory();
assert.equal(fallback.filter((s:any)=>s.state==="NC").length,466,"an unavailable engine may not erase the independent official directory");
assert.ok(!fallback.some((s:any)=>s.id==="bad"));
assert.ok(fallback.some((s:any)=>s.id==="owner-approved"),"owner-approved physical stores must remain selectable alongside official sources");
let directoryUnavailable=false;
const storeRoute=loadWithMocks("src/app/api/stores/route.ts",{
 "@/lib/sighting-store-directory":{readSightingStoreDirectory:async()=>{if(directoryUnavailable)throw Error("fixture unavailable");return stores;},SIGHTING_STORE_DIRECTORY_VERSION:data.generatedAt},
 "@/lib/site-engine-contract":{readSiteExport:async()=>({count:45}),siteExportHeaders:()=>({}),listStates:()=>[],normalizeStoreForSite:(row:any)=>row},
});
const storePage=await(await storeRoute.GET(new Request("https://example.test/api/stores?state=NC&limit=8"))).json();
assert.equal(storePage.total,466);assert.equal(storePage.count,466);assert.equal(storePage.stores.length,8);assert.equal(storePage.nextOffset,8);
assert.ok(storePage.cities.includes("Lewisville"),"area choices must cover the entire directory before pagination");
directoryUnavailable=true;
const unavailable=await storeRoute.GET(new Request("https://example.test/api/stores"));
assert.equal(unavailable.status,503);assert.equal(unavailable.headers.get("cache-control"),"no-store","an outage must not be cached as an empty directory");
console.log(JSON.stringify({passed:true,selectable:stores.length,nc:found.size,boards:ncSource.boards.length,focusedStates:data.focusedStates.length,rawBytes:raw.length,packedBytes:packed.length}));
