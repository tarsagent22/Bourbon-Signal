import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,mkdtemp,rm,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BourbonBible} from '../src/core/bible.mjs';
import {MN_MO_NATIVE_SOURCES,MN_MO_CORE_STORE_IDS,MN_MO_COHORTS,mnMoSourcesForState,mnMoCohortInputs} from '../src/collectors/mn-mo-cityhive-premises.mjs';
import {parseMnMoCityHiveResearch} from '../src/collectors/mn-mo-cityhive-research.mjs';
import {isMnMoCityHiveInventory,isMnMoCityHiveResearchInventory} from '../src/mn-mo-cityhive-policy.mjs';
import {mnMoResearchSourceForState,collectMnMoCityHiveResearch} from '../src/mn-mo-cityhive-research-runtime.mjs';
import {prepareMnMoCityHiveCandidate,prepareMnMoCityHiveCanary} from '../src/prepare-mn-mo-cityhive-candidate.mjs';
import {persistCityHiveIncidentJournal} from '../src/collectors/central-cityhive-transport.mjs';
const fixtureRoot=new URL('./fixtures/mn-mo-cityhive/',import.meta.url),manifest=JSON.parse(await readFile(new URL('receipts.json',fixtureRoot),'utf8'));
const bible=new BourbonBible(JSON.parse(gunzipSync(await readFile(new URL('bible.json.gz',fixtureRoot))).toString()).records),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const receipts=new Map(manifest.receipts.map(r=>[r.storeId,r])),bodies=new Map();
for(const receipt of manifest.receipts){const zipped=await readFile(new URL(receipt.fixturePath,fixtureRoot));assert.equal(sha(zipped),receipt.gzipSha256);const body=gunzipSync(zipped);assert.equal(body.length,receipt.bytes);assert.equal(sha(body),receipt.sha256);bodies.set(receipt.url,body.toString());}
const env={BOURBON_SIGNAL_SHADOW_MODE:'1',MN_MO_NATIVE_RESEARCH_ENABLED:'1'};
const fixtureFetch=async(url,{onResponse})=>{const response={ok:true,status:200,url,text:bodies.get(url)};assert.ok(response.text);await onResponse?.(response);return response;};
async function temporary(fn){const directory=await mkdtemp(path.join(tmpdir(),'mn-mo-native-'));assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));try{return await fn(directory);}finally{await rm(directory,{recursive:true,force:true});}}
test('historical native bodies prove5core/16parked exact premises; original clocks remain expired and channels allfalse',()=>{
 assert.equal(MN_MO_NATIVE_SOURCES.length,16);assert.equal(MN_MO_CORE_STORE_IDS.length,5);assert.equal(manifest.customerStoresAdded,0);assert.match(manifest.scope,/EXPIRED_HISTORICAL/);
 for(const profile of ['core5','positive16'])for(const state of ['MN','MO']){
  assert.equal(sha(JSON.stringify(mnMoCohortInputs(state,profile))),MN_MO_COHORTS[profile][state]);let rows=[];
  for(const source of mnMoSourcesForState(state,profile)){const receipt=receipts.get(source.storeId),parsed=parseMnMoCityHiveResearch(bodies.get(receipt.url),source,bible,{observedAt:receipt.observedAt,profile});assert.ok(parsed.length,source.storeId);assert.ok(parsed.every(row=>isMnMoCityHiveResearchInventory(row,{nowMs:Date.parse(receipt.observedAt)})));assert.ok(parsed.every(row=>row.observedAt===receipt.observedAt&&row.quantity===0&&row.quantityIsExact===false&&row.canAlertAsInventory===false&&row.eligibleForOnSite===false&&row.eligibleForDelivery===false));assert.ok(parsed.every(row=>!isMnMoCityHiveInventory(row,{nowMs:Date.parse(receipt.observedAt)+3*3600000})));rows.push(...parsed);}
  assert.equal(new Set(rows.map(r=>r.storeId)).size,profile==='core5'?(state==='MN'?3:2):(state==='MN'?9:7));
 }
});
test('proof mutations cannot borrow another store/state/option or grant customer/notification authority',()=>{
 const source=mnMoSourcesForState('MN')[0],receipt=receipts.get(source.storeId),row=parseMnMoCityHiveResearch(bodies.get(receipt.url),source,bible,{observedAt:receipt.observedAt})[0],nowMs=Date.parse(receipt.observedAt);
 for(const patch of [{state:'MO'},{storeId:'foreign'},{storeAddress:'1 Foreign St'},{merchantId:'foreign'},{productId:'foreign'},{variantId:'foreign'},{price:0},{quantity:1},{quantityIsExact:true},{sourceStale:true},{quarantined:true}])assert.equal(isMnMoCityHiveResearchInventory({...row,...patch},{nowMs}),false,JSON.stringify(patch));
 for(const patch of [{eligibleForOnSite:true},{eligibleForDropFeed:true},{canAlertAsInventory:true},{canAlertAsWatch:true},{eligibleForWatch:true},{eligibleForDelivery:true},{eligibleForEmail:true},{eligibleForSms:true},{previewOnly:true}])assert.equal(isMnMoCityHiveResearchInventory({...row,...patch},{nowMs}),false,JSON.stringify(patch));
 assert.equal(isMnMoCityHiveResearchInventory({...row,sourceProductBinding:{...row.sourceProductBinding,cohortSha256:'0'.repeat(64)}},{nowMs}),false);
 assert.throws(()=>parseMnMoCityHiveResearch(bodies.get(receipt.url),{...source,address:'foreign'},bible,{observedAt:receipt.observedAt}),/Exact reviewed/);
});
test('native option premise, shipping-only and zero quantity cannot become positive candidate facts',()=>{
 const source=mnMoSourcesForState('MN')[0],receipt=receipts.get(source.storeId),html=bodies.get(receipt.url);
 const change=mutate=>html.replace(/JSON\.parse\(decodeURIComponent\("([^"]+)"\)\)/g,(_all,encoded)=>{const value=JSON.parse(decodeURIComponent(encoded));const walk=v=>{if(!v||typeof v!=='object')return;mutate(v);Object.values(v).forEach(walk);};walk(value);return`JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(value))}"))`;});
 for(const mutate of [v=>{if(v.merchant_id===source.merchantId&&v.option_id)v.full_address='1 Foreign St, Andover, MN 55304';},v=>{if(v.merchant_id===source.merchantId&&v.option_id)v.quantity=0;},v=>{if(v.offer_types)v.offer_types=['shipping'];if(v.offerTypes)v.offerTypes=['shipping'];if(v.fulfillment)v.fulfillment='shipping';}])assert.deepEqual(parseMnMoCityHiveResearch(change(mutate),source,bible,{observedAt:receipt.observedAt}),[]);
 assert.deepEqual(parseMnMoCityHiveResearch('<html>unrecognized challenge</html>',source,bible,{observedAt:receipt.observedAt}),[]);
});
test('defaultOFF and unregistered source objects make0HTTP, without touching production lifecycle/registry',async()=>{
 let requests=0;const fetchText=async()=>{requests++;throw Error('No HTTP allowed');};
 for(const config of [mnMoResearchSourceForState('MN'),{...mnMoResearchSourceForState('MN')}]){const result=await collectMnMoCityHiveResearch(config,bible,{env:{},fetchText});assert.equal(result.signals.length,0);assert.equal(result.metadata.requestCount,0);}
 const copy=await collectMnMoCityHiveResearch({...mnMoResearchSourceForState('MN')},bible,{env,fetchText});assert.equal(copy.status,'research_disabled');assert.equal(requests,0);
});
test('explicit synthetic native responses complete both closed profiles but remain allfalse source-only; local origin cannot qualify',async()=>temporary(async directory=>{
 for(const profile of ['core5','positive16'])for(const state of ['MN','MO']){const incidentDirectory=path.join(directory,profile,'incidents'),reportDirectory=path.join(directory,profile,state),report=await collectMnMoCityHiveResearch(mnMoResearchSourceForState(state,{profile}),bible,{env,fetchText:fixtureFetch,incidentDirectory,reportDirectory});assert.equal(report.metadata.complete,true);assert.equal(report.metadata.requestCount,mnMoSourcesForState(state,profile).length);assert.equal(report.metadata.origin.kind,'local_fixture_not_workflow_proof');assert.ok(report.signals.every(r=>isMnMoCityHiveResearchInventory(r)));assert.equal(report.metadata.productionActivationAllowed,false);await assert.rejects(()=>prepareMnMoCityHiveCandidate({state,profile,report,reportDirectory,bible}),/verified exact-head GitHub/);}
}));
test('later durable host hold, unresolved latch and corrupt existing journal each block beforeHTTP',async()=>temporary(async directory=>{
 const config=mnMoResearchSourceForState('MN'),file=path.join(directory,'MN.json');let requests=0;const fetchText=async()=>{requests++;throw Error('No HTTP');};
 for(const value of [{schemaVersion:1,state:'MN',hosts:{'toptenliquors.com':{httpStatus:403,lastAttemptAt:'2026-10-29T01:00:00Z',nextAllowedAt:'2026-10-30T01:00:00Z'}},inFlight:null},{schemaVersion:1,state:'MN',hosts:{},inFlight:{attemptId:'12345678-1234-4234-8234-123456789abc',startedAt:'2026-10-29T01:00:00Z'}}]){await writeFile(file,JSON.stringify(value));await assert.rejects(()=>collectMnMoCityHiveResearch(config,bible,{env,fetchText,incidentDirectory:directory}),/held|Unresolved/);}
 await writeFile(file,'{"broken":');await assert.rejects(()=>collectMnMoCityHiveResearch(config,bible,{env,fetchText,incidentDirectory:directory}));assert.equal(requests,0);assert.equal(await readFile(file,'utf8'),'{"broken":');
}));
test('preparer independently replays exact bodies; synthetic workflow schemas never grant canary/production authority',async()=>temporary(async directory=>{
 const state='MN',profile='core5',reportDirectory=path.join(directory,'report'),syntheticEnv={...env,GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'tarsagent22/Bourbon-Signal',GITHUB_RUN_ID:'123456789',GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ATTEMPT:'1'};
 const report=await collectMnMoCityHiveResearch(mnMoResearchSourceForState(state),bible,{env:syntheticEnv,fetchText:fixtureFetch,incidentDirectory:path.join(directory,'incidents'),reportDirectory});
 const provenance={status:'verified_github_shadow_artifact',state,repository:'tarsagent22/Bourbon-Signal',workflowRunId:'123456789',headSha:'a'.repeat(40),currentHead:'a'.repeat(40),artifactDigest:'b'.repeat(64),artifactId:'123456'};
 const prepare=(r=report,p=provenance,nowMs=Date.now())=>prepareMnMoCityHiveCandidate({state,profile,report:r,reportDirectory,bible,provenance:p,nowMs});
 const packet=await prepare();assert.equal(packet.customerStoresAdded,0);assert.equal(packet.productionActivationAllowed,false);assert.equal(packet.customerDeliveryAllowed,false);assert.match(packet.scope,/NOT_CANARY_OR_PRODUCTION/);assert.equal(new Set(packet.rows.map(r=>r.storeId)).size,3);assert.ok(packet.rows.every(r=>isMnMoCityHiveResearchInventory(r)));
 const canary=await prepareMnMoCityHiveCanary({state,profile,report,reportDirectory,bible,provenance});assert.equal(new Set(canary.drops.map(r=>r.storeId)).size,3);assert.ok(canary.drops.every(r=>r.previewOnly===true&&r.quantity===0&&r.canAlertAsInventory===false&&r.eligibleForDelivery===false));assert.equal(canary.customerStoresAdded,0);
 const fakeRows=structuredClone(report);fakeRows.signals=[{storeId:'invented'}];assert.deepEqual((await prepare(fakeRows)).rows,packet.rows,'Caller row/count claims are not source authority');
 await assert.rejects(()=>prepare(report,provenance,Date.now()+3*3600000),/stale/);
 const invalidClock=structuredClone(report);invalidClock.startedAt='unknown';await assert.rejects(()=>prepare(invalidClock),/Complete exact/);
 const scope=structuredClone(report);scope.metadata.profile='positive16';await assert.rejects(()=>prepare(scope),/Complete exact/);
 await assert.rejects(()=>prepare(report,{...provenance,currentHead:'c'.repeat(40)}),/exact-head/);
 const traversal=structuredClone(report);traversal.metadata.receipts[0].artifactPath='../outside.txt';await assert.rejects(()=>prepare(traversal),/malformed/);
 const foreign=structuredClone(report);foreign.metadata.receipts[0].url='https://foreign.invalid/shop/';await assert.rejects(()=>prepare(foreign),/Foreign/);
 const first=report.metadata.receipts[0],file=path.join(reportDirectory,first.artifactPath),body=await readFile(file);await writeFile(file,Buffer.concat([body,Buffer.from(' ')]));await assert.rejects(()=>prepare(),/hash\/length/);
}));
test('native denied headers persist3dayRetryAfter before parent abort; no capture/report stock write',async()=>temporary(async directory=>{
 const priorFetch=globalThis.fetch,controller=new AbortController(),reportDirectory=path.join(directory,'report');let requests=0;
 globalThis.fetch=async value=>{requests++;controller.abort();return{ok:false,status:403,url:String(value),headers:new Headers({'retry-after':'259200'}),body:{cancel:async()=>{}}};};
 try{await assert.rejects(()=>collectMnMoCityHiveResearch(mnMoResearchSourceForState('MN'),bible,{env,signal:controller.signal,incidentDirectory:directory,reportDirectory}));}finally{globalThis.fetch=priorFetch;}
 const journal=JSON.parse(await readFile(path.join(directory,'MN.json'),'utf8')),hold=journal.hosts['toptenliquors.com'];assert.equal(requests,1);assert.equal(hold.httpStatus,403);assert.ok(Date.parse(hold.nextAllowedAt)-Date.parse(hold.lastAttemptAt)>=3*86400000);await assert.rejects(()=>readFile(path.join(reportDirectory,'report.json')),{code:'ENOENT'});
}));
test('denial persistence failure leaves pre-request latch; subsequent run cannot sendHTTP',async()=>temporary(async directory=>{
 let requests=0,persistCalls=0;const config=mnMoResearchSourceForState('MN'),persistJournal=(file,value)=>{persistCalls++;if(persistCalls===2)throw Object.assign(Error('Synthetic rename failure'),{code:'EIO'});persistCityHiveIncidentJournal(file,value);};
 const report=await collectMnMoCityHiveResearch(config,bible,{env,incidentDirectory:directory,reportDirectory:path.join(directory,'report'),persistJournal,fetchText:async(url,{onResponse})=>{requests++;await onResponse({ok:false,status:403,url,retryAfterSeconds:0});throw Error('unreachable');}});
 assert.equal(report.status,'blocked');assert.equal(report.roadblocks[0].status,403);assert.equal(JSON.parse(await readFile(path.join(directory,'MN.json'),'utf8')).inFlight!==null,true);
 await assert.rejects(()=>collectMnMoCityHiveResearch(config,bible,{env,incidentDirectory:directory,fetchText:async()=>{requests++;throw Error('No retry');}}),/Unresolved/);assert.equal(requests,1);
}));
