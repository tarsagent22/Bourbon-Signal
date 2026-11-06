import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BourbonBible} from '../src/core/bible.mjs';
import {CALIFORNIA_GROCERY_SOURCES} from '../src/collectors/california-grocery-premises.mjs';
import {WESTERN_GROCERY_EXPANSION_SOURCES} from '../src/collectors/western-grocery-premises.mjs';
import {collectGroceryExpansion} from '../src/collectors/grocery-xapi-expansion.mjs';
const fixture=JSON.parse(await readFile(new URL('./fixtures/california-grocery-expansion/identity.json',import.meta.url))),bible=new BourbonBible(fixture.records);
const empty96101=JSON.parse(await readFile(new URL('./fixtures/california-resolver-empty/96101-20261106.json',import.meta.url)));
const premises=CALIFORNIA_GROCERY_SOURCES.map(s=>({locationId:s.merchantId,polarisBannerName:s.banner,domainName:s.resolverDomainName||s.banner,address:{line1:s.address.slice(0,-`, ${s.city}, CA ${s.zip}`.length),city:s.city,state:'CA',country:'US',zipcode:s.zip}}));
const success=url=>({ok:true,status:200,text:JSON.stringify(url.includes('storeresolver')?{instore:{stores:premises}}:{response:{docs:[]}})});
const logical=url=>{const p=new URL(url);return p.pathname+'|'+(p.searchParams.get('zipcode')||p.searchParams.get('storeid')+'|'+p.searchParams.get('q'));};
async function collect(fetchText,options={}){const cursorDir=await mkdtemp(path.join(tmpdir(),'ca-semantic-'));try{return await collectGroceryExpansion({id:'CA'},bible,{cursorDir,observedAt:fixture.capturedAt,nowMs:Date.parse(fixture.capturedAt),sleep:async()=>{},fetchText,...options});}finally{await rm(cursorDir,{recursive:true,force:true});}}

test('three recovered semantic failures finish every premise with exactly one valid inventory receipt per term',async()=>{
 const attempts=new Map(),bad='{"unexpected":"not trusted inventory"}',hash=createHash('sha256').update(bad).digest('hex');
 const result=await collect(async url=>{
  const p=new URL(url),key=logical(url),n=(attempts.get(key)||0)+1;attempts.set(key,n);
  const affected=p.searchParams.get('zipcode')==='92592'||p.searchParams.get('storeid')==='909'&&p.searchParams.get('q')==='bourbon'||p.searchParams.get('storeid')==='767'&&p.searchParams.get('q')==='whiskey';
  if(affected&&n===1)return{ok:true,status:p.searchParams.has('zipcode')?206:200,text:bad};
  if(p.searchParams.get('storeid')==='2784')return{ok:true,status:200,text:JSON.stringify({response:{docs:fixture.products}})};
  return success(url);
 });
 assert.equal(result.metadata.complete,true);assert.equal(result.metadata.verifiedPremises.length,568);assert.equal(result.metadata.transientRetries,3);assert.ok(result.metadata.requests.length<=1262);
 const failed=result.metadata.requests.filter(r=>!r.ok);assert.equal(failed.length,3);assert.ok(failed.every(r=>r.httpOk===true&&r.semanticValidation==='invalid'&&r.responseSha256===hash&&r.responseBytes===Buffer.byteLength(bad)));
 for(const source of CALIFORNIA_GROCERY_SOURCES)for(const term of ['bourbon','whiskey'])assert.equal(result.metadata.requests.filter(r=>r.sourceId===source.id&&r.term===term&&r.ok).length,1);
 assert.equal(result.signals.length,5);assert.ok(result.signals.every(r=>r.observedAt===fixture.capturedAt&&r.sourceProductBinding.observedAt===fixture.capturedAt));
});
test('a second unknown shape fails closed; transport and shape failures never stack into a third attempt',async()=>{
 for(const sequence of [
  [{ok:true,status:200,text:'not-json'},{ok:true,status:200,text:'{"response":null}'}],
  [{ok:false,status:0,text:''},{ok:true,status:200,text:'not-json'}],
  [{ok:true,status:200,text:'not-json'},{ok:false,status:503,text:''}],
 ]){
  let calls=0;const result=await collect(async url=>new URL(url).searchParams.get('storeid')==='909'?sequence[Math.min(calls++,1)]:success(url));
  assert.equal(calls,2);assert.equal(result.metadata.transientRetries,1);assert.equal(result.metadata.complete,false);assert.equal(result.metadata.sourceAttempts['safeway-ca-909'].status,'incomplete');
  assert.equal(result.signals.filter(row=>row.storeId==='safeway:909').length,0);
 }
});
test('two inventory workers share eight semantic retries and preserve each receipt when responses are reused',async()=>{
 const selected=CALIFORNIA_GROCERY_SOURCES.slice(0,10),ids=new Set(selected.map(source=>source.merchantId)),calls=new Map();
 const sharedMalformed={ok:true,status:200,text:'{"untrusted":{"docs":[{"storeId":"invented","inStock":true}]}}'},sharedValid={ok:true,status:200,text:'{"response":{"docs":[]}}'};
 let inFlight=0,peak=0;
 const result=await collect(async url=>{
  inFlight++;peak=Math.max(peak,inFlight);await new Promise(resolve=>setImmediate(resolve));inFlight--;
  const p=new URL(url);if(p.searchParams.has('zipcode'))return success(url);
  const key=logical(url),n=(calls.get(key)||0)+1;calls.set(key,n);
  return ids.has(p.searchParams.get('storeid'))&&p.searchParams.get('q')==='bourbon'&&n===1?sharedMalformed:sharedValid;
 });
 assert.equal(peak,2);assert.equal(result.metadata.transientRetries,8);assert.equal(result.metadata.complete,false);assert.ok(result.metadata.requests.length<=1262);
 assert.ok([...calls.values()].every(count=>count<=2));
 const selectedAttempts=selected.map(source=>result.metadata.sourceAttempts[source.id]);assert.equal(selectedAttempts.filter(a=>a.status==='success').length,8);assert.equal(selectedAttempts.filter(a=>a.status==='incomplete').length,2);
 const malformed=result.metadata.requests.filter(r=>r.semanticValidation==='invalid');assert.equal(malformed.length,10);assert.ok(malformed.every(r=>r.ok===false&&r.httpOk===true&&r.term==='bourbon'));
 for(const source of selected){
  const receipts=result.metadata.requests.filter(r=>r.sourceId===source.id&&r.term==='bourbon');assert.equal(receipts.filter(r=>r.ok).length,result.metadata.sourceAttempts[source.id].status==='success'?1:0);
 }
 assert.equal(result.signals.length,0);assert.equal(sharedMalformed.ok,true); // No mutation of a reused transport object.
});
test('semantic and transport failures share the same eight-retry ceiling and pacing',async()=>{
 const attempts=new Map(),chosen=[];const sleeps=[];
 const result=await collect(async url=>{
  if(!url.includes('storeresolver'))return success(url);
  const key=logical(url),n=(attempts.get(key)||0)+1;attempts.set(key,n);if(!chosen.includes(key))chosen.push(key);
  const position=chosen.indexOf(key);
  if(position<9&&n===1)return position<4?{ok:false,status:503,text:''}:{ok:true,status:200,text:'{"instore":null}'};
  return success(url);
 },{sleep:async ms=>{sleeps.push(ms);}});
 assert.equal(result.metadata.transientRetries,8);assert.equal(result.metadata.complete,false);assert.ok(result.metadata.requests.length<=1262);
 assert.ok([...attempts.values()].every(count=>count<=2));assert.equal(attempts.get(chosen[8]),1);assert.ok(sleeps.includes(500));assert.equal(sleeps.filter(ms=>ms===1000).length,8);
});
test('denials, aborts and long Retry-After prevent semantic retries',async()=>{
 for(const status of [401,403,429,435]){
  let calls=0,persisted;const result=await collect(async()=>({ok:false,status,text:'not-json'}),{persistAttempts:async value=>{persisted=value;}});
  assert.equal(result.metadata.transientRetries,0);assert.equal(result.metadata.requests.length,1);assert.equal(persisted['host:www.safeway.com'].httpStatus,status);
  const recovered=await collect(async url=>{if(new URL(url).searchParams.get('zipcode')==='94103')return{ok:++calls===1,status:calls===1?200:status,text:'not-json'};return success(url);});
  assert.equal(calls,2);assert.equal(recovered.metadata.transientRetries,1);assert.equal(recovered.metadata.complete,false);
 }
 let calls=0;const controller=new AbortController();await assert.rejects(collect(async()=>{calls++;controller.abort();return{ok:true,status:200,text:'not-json'};},{signal:controller.signal}),{name:'AbortError'});assert.equal(calls,1);
 const deferred=await collect(async()=>({ok:true,status:200,text:'not-json',retryAfterSeconds:30}));assert.equal(deferred.metadata.transientRetries,0);
});
test('known healthy empty, valid docs and identity/stock rejections do not trigger shape retries',async()=>{
 const result=await collect(async url=>{
  const p=new URL(url);if(p.searchParams.get('zipcode')==='96101')return{ok:true,status:200,text:JSON.stringify(empty96101)};
  if(p.searchParams.has('storeid'))return{ok:true,status:200,text:JSON.stringify({response:{docs:fixture.products.map(product=>({...product,storeId:'foreign',channelInventory:{instore:'0',instoreItemQty:0}}))}})};
  return success(url);
 });
 assert.equal(result.metadata.complete,true);assert.equal(result.metadata.transientRetries,0);assert.equal(result.signals.length,0);assert.ok(result.metadata.resolverEmptyZips.includes('96101'));
 const illinois=WESTERN_GROCERY_EXPANSION_SOURCES.filter(s=>s.stateCode==='IL');assert.ok(illinois.length>0);
 const cursorDir=await mkdtemp(path.join(tmpdir(),'il-shape-unchanged-'));try{
  const unchanged=await collectGroceryExpansion({id:'IL'},bible,{cursorDir,sleep:async()=>{},fetchText:async()=>({ok:true,status:200,text:'not-json'})});assert.equal(unchanged.metadata.transientRetries,0);assert.equal(unchanged.metadata.complete,false);assert.ok(unchanged.metadata.requests.every(r=>r.semanticValidation===undefined));
 }finally{await rm(cursorDir,{recursive:true,force:true});}
});
