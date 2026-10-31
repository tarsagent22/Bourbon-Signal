import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BourbonBible} from '../src/core/bible.mjs';
import {CALIFORNIA_GROCERY_SOURCES as sources} from '../src/collectors/california-grocery-premises.mjs';
import {collectGroceryExpansion,groceryExpansionPremiseMatches} from '../src/collectors/grocery-xapi-expansion.mjs';
const fixture=JSON.parse(await readFile(new URL('./fixtures/california-grocery-expansion/identity.json',import.meta.url)));
const regional=JSON.parse(await readFile(new URL('./fixtures/california-grocery-expansion/lancaster-resolver.json',import.meta.url)));
const bible=new BourbonBible(fixture.records),missing=new Set(regional.missingStoreIds);
const premises=sources.map(source=>{
 const suffix=`, ${source.city}, CA ${source.zip}`;assert.ok(source.address.endsWith(suffix));
 return{locationId:source.merchantId,polarisBannerName:source.banner,domainName:source.resolverDomainName||source.banner,address:{line1:source.address.slice(0,-suffix.length),city:source.city,state:'CA',country:'US',zipcode:source.zip}};
});
const response=stores=>({ok:true,status:200,text:JSON.stringify({instore:{stores}})});
const inventory={ok:true,status:200,text:JSON.stringify({response:{docs:[]}})};
async function collect(fetchText,options={}){
 const cursorDir=await mkdtemp(path.join(tmpdir(),'ca-region-'));
 try{return await collectGroceryExpansion({id:'CA'},bible,{cursorDir,observedAt:fixture.capturedAt,nowMs:Date.parse(fixture.capturedAt),sleep:async()=>{},fetchText,...options});}
 finally{await rm(cursorDir,{recursive:true,force:true});}
}

test('captured Lancaster response resolves the19 missing frozen premises without adding its unreviewed neighbor',()=>{
 assert.equal(missing.size,19);assert.equal(regional.stores.length,20);
 for(const source of sources.filter(source=>missing.has(source.storeId)))assert.ok(regional.stores.some(store=>groceryExpansionPremiseMatches(source,store)),source.storeId);
});

test('an empty regional result completes through bounded own-ZIP resolution with the original433-premise gate intact',async()=>{
 let resolverCalls=0;
 const broad=premises.filter((_,index)=>!missing.has(sources[index].storeId));
 const result=await collect(async url=>{
  if(!url.includes('storeresolver'))return inventory;
  const zip=new URL(url).searchParams.get('zipcode');resolverCalls++;
  if(resolverCalls<=40)return response(broad);
  return zip==='93534'?{ok:true,status:regional.status,text:JSON.stringify({instore:{stores:regional.stores}})}:response([]);
 });
 assert.equal(result.metadata.complete,true);assert.equal(result.metadata.selectedStores.length,433);assert.equal(result.metadata.verifiedPremises.length,433);
 assert.ok(result.metadata.supplementalResolverZips.includes('93534'));
 assert.ok(result.metadata.supplementalResolverZips.length<=16);assert.ok(result.metadata.requests.length<=938);
 assert.deepEqual(new Set(result.metadata.verifiedPremises),new Set(sources.map(source=>source.storeId)));
});

test('continued healthy empty responses stop at16 supplemental lookups and remain incomplete',async()=>{
 const result=await collect(async()=>response([]));
 assert.equal(result.metadata.requests.length,56);assert.equal(result.metadata.supplementalResolverZips.length,16);
 assert.equal(new Set(result.metadata.supplementalResolverZips).size,16);assert.equal(result.metadata.complete,false);assert.deepEqual(result.signals,[]);
});

test('later matching resolution cannot erase a current address conflict or query its inventory',async()=>{
 let resolverCalls=0;const target=sources[0],wrong=structuredClone(premises);wrong[0].address.line1='999 Conflicting Address';
 const result=await collect(async url=>url.includes('storeresolver')?response(++resolverCalls===1?wrong:premises):inventory);
 assert.equal(result.metadata.complete,false);assert.equal(result.metadata.verifiedPremises.length,432);
 assert.ok(result.metadata.conflictingStoreIds.includes(target.merchantId));
 assert.equal(result.metadata.requests.filter(request=>request.kind==='inventory'&&request.sourceId===target.id).length,0);
 assert.deepEqual(result.metadata.supplementalResolverZips,[]);
});

test('a denial during supplemental resolution persists before any subsequent same-host request',async()=>{
 let resolverCalls=0,persisted;const broad=premises.filter((_,index)=>!missing.has(sources[index].storeId));
 const result=await collect(async url=>{
  if(!url.includes('storeresolver'))return inventory;
  return ++resolverCalls<=40?response(broad):{ok:false,status:403,text:''};
 },{persistAttempts:async attempts=>{persisted=structuredClone(attempts);}});
 assert.equal(resolverCalls,41);assert.equal(result.metadata.complete,false);assert.equal(result.metadata.transientRetries,0);
 assert.equal(persisted['host:www.safeway.com'].httpStatus,403);
 const denial=result.metadata.requests.findIndex(request=>request.status===403);
 assert.ok(result.metadata.requests.slice(denial+1).every(request=>new URL(request.url).hostname!=='www.safeway.com'));
});
