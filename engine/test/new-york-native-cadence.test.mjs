import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NEW_YORK_VARIANT_PICKUP_SOURCES as NATIVE,NEW_YORK_NATIVE_PICKUP_REFRESH_CADENCE_MS as CADENCE} from '../src/collectors/new-york-variant-pickup.mjs';
import {NEW_YORK_RETAILER_SOURCES} from '../src/collectors/metro-retailer-surfaces.mjs';
import {metroSourceAttempts,updateMetroSourceAttempts,mergeMetroSourceAttempts,METRO_REFRESH_CADENCE_MS as LEGACY} from '../src/collectors/metro-refresh-state.mjs';
import {selectMetroSourcesForRefresh} from '../src/collectors/buffalo-cityhive-discovery.mjs';
const bytes=await readFile(new URL('./fixtures/new-york-native-cadence-40949342705/NY.json',import.meta.url));
assert.equal(createHash('sha256').update(bytes).digest('hex'),'89553255f4da62910fe534a3e676a19ae7bdf835f3c9fa472d616096fca66eee');
const archived=JSON.parse(bytes),maxClock=Math.max(...NATIVE.map(source=>Date.parse(archived.sourceAttempts[source.id].lastAttemptAt)));

test('actual409493 ledger upgrades only five registered healthy native successes; original clocks and denial siblings remain intact',t=>{
 t.mock.timers.enable({apis:['Date'],now:maxClock+3600000});
 const before=structuredClone(archived),attempts=metroSourceAttempts(archived,NEW_YORK_RETAILER_SOURCES),nativeIds=new Set(NATIVE.map(source=>source.id));
 assert.equal(NATIVE.length,5);assert.equal(CADENCE,1800000);
 for(const source of NATIVE){
  const old=archived.sourceAttempts[source.id],next=attempts[source.id];assert.equal(old.status,'success');assert.equal(old.httpStatus,null);
  assert.equal(Date.parse(old.nextAllowedAt)-Date.parse(old.lastAttemptAt),LEGACY);
  assert.deepEqual(next,{...old,nextAllowedAt:new Date(Date.parse(old.lastAttemptAt)+CADENCE).toISOString()});
 }
 let denials=0;for(const[sourceId,next]of Object.entries(attempts))if(!nativeIds.has(sourceId)){
  assert.deepEqual(next,archived.sourceAttempts[sourceId]);if(next.httpStatus===403)denials++;
 }
 assert.ok(denials>0);assert.deepEqual(archived,before,'Input ledger was mutated');
 assert.deepEqual(metroSourceAttempts({sourceAttempts:attempts},NEW_YORK_RETAILER_SOURCES),attempts,'Migration must be idempotent');
});

test('actual selector is due at30/60min without re-aging cached inventory;29min still waits, forced healthy behavior is unchanged',t=>{
 t.mock.timers.enable({apis:['Date'],now:maxClock+3600000});
 for(const source of NATIVE){
  const old=archived.sourceAttempts[source.id],start=Date.parse(old.lastAttemptAt),attempts=metroSourceAttempts(archived,[source]);
  // Scheduling sentinels only, not fabricated stock: original clock is immutable.
  const rows=[{id:'clock-sentinel',sourceChain:source.id,observedAt:old.lastAttemptAt}],snapshot=structuredClone(rows);
  assert.deepEqual(selectMetroSourcesForRefresh([source],rows,{nowMs:start+29*60000,sourceAttempts:attempts}),[]);
  for(const minutes of [30,60])assert.deepEqual(selectMetroSourcesForRefresh([source],rows,{nowMs:start+minutes*60000,sourceAttempts:attempts}),[source]);
  assert.deepEqual(selectMetroSourcesForRefresh([source],rows,{nowMs:start+1000,sourceAttempts:attempts,forceLive:true}),[source]);
  assert.deepEqual(rows,snapshot);
 }
});

test('failure, unknown HTTP, longer cooldowns and explicit retry/hold metadata never migrate, including roundtrips',t=>{
 t.mock.timers.enable({apis:['Date'],now:maxClock+3600000});
 for(const source of NATIVE){
  const old=archived.sourceAttempts[source.id];
  for(const change of [{status:'failed'},{status:'timeout'},{status:'malformed'},{status:'collapsed'},{status:'quarantined'},
   {status:'permanent_error',httpStatus:500},{status:'transient_error',httpStatus:503},{httpStatus:200},
   {nextAllowedAt:new Date(Date.parse(old.lastAttemptAt)+6*3600000).toISOString()},
   {retryAfterSeconds:14400},{reviewRequired:true},{unresolvedAttempt:true}]){
   const input={...old,...change},first=metroSourceAttempts({sourceAttempts:{[source.id]:input}},[source]);
   assert.equal(first[source.id].nextAllowedAt,input.nextAllowedAt,JSON.stringify(change));assert.equal(first[source.id].lastAttemptAt,input.lastAttemptAt);
   assert.deepEqual(metroSourceAttempts({sourceAttempts:first},[source]),first,'Read/write must not strip hold metadata then migrate it');
  }
 }
});

for(const httpStatus of [401,403,429])test(`HTTP${httpStatus} holds and forced selection retain original behavior`,t=>{
 t.mock.timers.enable({apis:['Date'],now:maxClock+3600000});
 for(const source of NATIVE){
  const old=archived.sourceAttempts[source.id],start=Date.parse(old.lastAttemptAt),next=new Date(start+24*3600000).toISOString();
  const input={...old,status:httpStatus===429?'rate_limited':'access_denied',httpStatus,nextAllowedAt:next,retryAfterSeconds:86400};
  const attempts=metroSourceAttempts({sourceAttempts:{[source.id]:input}},[source]);
  assert.deepEqual(attempts[source.id],input);
  assert.deepEqual(selectMetroSourcesForRefresh([source],[],{nowMs:start+3600000,sourceAttempts:attempts,forceLive:true}),[]);
 }
});

test('new healthy attempts use30min; every failed/HTTP result retains the former unconfigured fallback',t=>{
 t.mock.timers.enable({apis:['Date'],now:maxClock+3600000});
 for(const source of NATIVE)for(const fallbackCadenceMs of [undefined,60000,2*3600000,24*3600000]){
  const clone={...source,depthDiscovery:undefined},clock=archived.sourceAttempts[source.id].lastAttemptAt;
  const result={sourceId:`metro:ny:${source.id}`,attemptCount:1,finishedAt:clock,startedAt:clock,status:'success',ok:true};
  const healthy=updateMetroSourceAttempts({},[source],[result],{fallbackCadenceMs});assert.equal(Date.parse(healthy[source.id].nextAllowedAt)-Date.parse(clock),CADENCE);
  for(const [status,httpStatus]of [['failed',null],['timeout',null],['malformed',null],['collapsed',null],['quarantined',null],['permanent_error',401],['permanent_error',403],['rate_limited',429],['permanent_error',435],['transient_error',503]]){
   const failed={...result,status,ok:false,error:{status:httpStatus}};
   assert.deepEqual(updateMetroSourceAttempts({},[source],[failed],{fallbackCadenceMs}),updateMetroSourceAttempts({},[clone],[failed],{fallbackCadenceMs}),JSON.stringify({status,httpStatus,fallbackCadenceMs}));
  }
 }
});

test('same-source roadblocks persist a migration veto; skipped attempts cannot clear it or create clocks',t=>{
 t.mock.timers.enable({apis:['Date'],now:maxClock+3600000});
 const source=NATIVE[0],old=archived.sourceAttempts[source.id];
 const attempts=metroSourceAttempts({sourceAttempts:{[source.id]:old},roadblocks:[{sourceRuntimeId:`metro:ny:${source.id}`,status:403}]},[source]);
 assert.equal(attempts[source.id].nextAllowedAt,old.nextAllowedAt);assert.equal(attempts[source.id].reviewedNativeLegacyCadenceHeld,true);
 assert.deepEqual(metroSourceAttempts({sourceAttempts:attempts},[source]),attempts);
 const skipped={sourceId:`metro:ny:${source.id}`,attemptCount:0,status:'circuit_open',finishedAt:new Date(maxClock).toISOString()};
 assert.deepEqual(updateMetroSourceAttempts({sourceAttempts:attempts},[source],[skipped]),attempts);
});

test('same-ID clones, foreign descriptors and other states retain exact existing timers and merge priority',t=>{
 t.mock.timers.enable({apis:['Date'],now:maxClock+3600000});
 const source=NATIVE[0],old=archived.sourceAttempts[source.id];
 for(const other of [{...source},{...source,stateCode:'CO'},{...source,baseUrl:'https://foreign.invalid'},{id:source.id,stateCode:'AZ',sourceLabel:'not registered',depthDiscovery:{refreshCadenceMs:CADENCE}}]){
  assert.deepEqual(metroSourceAttempts({sourceAttempts:{[other.id]:old}},[other]),{[other.id]:old});
 }
 const newer={...old,status:'access_denied',httpStatus:403,lastAttemptAt:new Date(maxClock+60000).toISOString(),nextAllowedAt:new Date(maxClock+60000+24*3600000).toISOString()};
 const merged=mergeMetroSourceAttempts([source],archived,{sourceAttempts:{[source.id]:newer}});assert.equal(merged[source.id].httpStatus,403);assert.equal(merged[source.id].nextAllowedAt,newer.nextAllowedAt);
});
