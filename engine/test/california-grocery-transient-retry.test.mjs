import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BourbonBible} from '../src/core/bible.mjs';
import {CALIFORNIA_GROCERY_SOURCES} from '../src/collectors/california-grocery-premises.mjs';
import {collectGroceryExpansion} from '../src/collectors/grocery-xapi-expansion.mjs';
const fixture=JSON.parse(await readFile(new URL('./fixtures/california-grocery-expansion/identity.json',import.meta.url)));
const bible=new BourbonBible(fixture.records);
const premises=CALIFORNIA_GROCERY_SOURCES.map(source=>{
  const suffix=`, ${source.city}, ${source.stateCode} ${source.zip}`;
  assert.ok(source.address.endsWith(suffix));
  return{locationId:source.merchantId,polarisBannerName:source.banner,domainName:source.resolverDomainName||source.banner,
    address:{line1:source.address.slice(0,-suffix.length),city:source.city,state:'CA',country:'US',zipcode:source.zip}};
});
const success=url=>({ok:true,status:200,text:JSON.stringify(url.includes('storeresolver')?{instore:{stores:premises}}:{response:{docs:[]}})});
async function collect(fetchText,options={}){
  const cursorDir=await mkdtemp(path.join(tmpdir(),'ca-transient-'));
  try{return await collectGroceryExpansion({id:'CA'},bible,{cursorDir,observedAt:fixture.capturedAt,nowMs:Date.parse(fixture.capturedAt),sleep:async()=>{},fetchText,...options});}
  finally{await rm(cursorDir,{recursive:true,force:true});}
}

test('one captured Vons2111 transport failure can complete all433 premises without losing the original clock',async()=>{
  let attempts=0;
  const result=await collect(async url=>{
    const parsed=new URL(url);
    if(parsed.searchParams.get('storeid')==='2111'&&parsed.searchParams.get('q')==='bourbon'&&++attempts===1)return{ok:false,status:0,error:'fetch failed',text:''};
    if(parsed.searchParams.get('storeid')==='2784')return{ok:true,status:200,text:JSON.stringify({response:{docs:fixture.products}})};
    return success(url);
  });
  assert.equal(attempts,2);assert.equal(result.metadata.complete,true);
  assert.equal(result.metadata.verifiedPremises.length,433);assert.equal(result.metadata.transientRetries,1);
  assert.ok(result.metadata.requests.length<=938);
  const failed=result.metadata.requests.filter(request=>!request.ok);
  assert.equal(failed.length,1);assert.equal(failed[0].merchantId,'2111');
  for(const source of CALIFORNIA_GROCERY_SOURCES)for(const term of ['bourbon','whiskey'])assert.equal(result.metadata.requests.filter(request=>request.sourceId===source.id&&request.term===term&&request.ok).length,1);
  assert.ok(Object.values(result.metadata.sourceAttempts).every(attempt=>attempt.lastAttemptAt===fixture.capturedAt));
  assert.equal(result.signals.length,5);assert.ok(result.signals.every(row=>row.observedAt===fixture.capturedAt&&row.sourceProductBinding.observedAt===fixture.capturedAt));
});

test('persistent transient errors stop after one retry per request and eight retries across the entire run',async()=>{
  const result=await collect(async()=>({ok:false,status:503,text:''}));
  assert.equal(result.metadata.transientRetries,8);assert.equal(result.metadata.requests.length,48);
  assert.equal(result.metadata.complete,false);assert.deepEqual(result.signals,[]);
  const byUrl=new Map();for(const request of result.metadata.requests)byUrl.set(request.url,(byUrl.get(request.url)||0)+1);
  assert.ok([...byUrl.values()].every(count=>count<=2));
});

test('access denial on the retry persists immediately and is never retried again',async()=>{
  for(const status of [401,403,429,435]){
    let initialCalls=0;const denied=await collect(async()=>{initialCalls++;return{ok:false,status,text:''};});assert.equal(initialCalls,1);assert.equal(denied.metadata.transientRetries,0);
    let calls=0,persisted;
    const result=await collect(async()=>({ok:false,status:++calls===1?0:status,text:''}),{persistAttempts:async attempts=>{persisted=structuredClone(attempts);}});
    assert.equal(calls,2);assert.equal(result.metadata.complete,false);
    assert.equal(persisted['host:www.safeway.com'].httpStatus,status);
    let further=0;await collect(async()=>{further++;throw new Error('denial bypass');},{attempts:persisted});assert.equal(further,0);
  }
});

test('aborts, long Retry-After and successful malformed payloads do not enter a retry loop',async()=>{
  const controller=new AbortController();let calls=0;
  await assert.rejects(()=>collect(async()=>{calls++;controller.abort();return{ok:false,status:0,text:''};},{signal:controller.signal}),error=>error.name==='AbortError');assert.equal(calls,1);
  const deferred=await collect(async()=>({ok:false,status:503,text:'',retryAfterSeconds:30}));assert.equal(deferred.metadata.transientRetries,0);assert.equal(deferred.metadata.requests.length,40);
  const malformed=await collect(async()=>({ok:true,status:200,text:'not-json'}));assert.equal(malformed.metadata.transientRetries,0);assert.equal(malformed.metadata.requests.length,40);assert.equal(malformed.metadata.complete,false);
});
