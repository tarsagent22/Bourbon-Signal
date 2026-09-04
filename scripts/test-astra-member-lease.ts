import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { buildExpoPushMessages, type PushDeviceRecord } from '../src/lib/push-devices.ts';

async function modules(f:any,entry='src/lib/alert-queue/member-lease.ts') {
 const out=await build({entryPoints:[entry],bundle:true,platform:'node',format:'cjs',write:false,packages:'external',plugins:[{name:'fake-database-only',setup(b){
  b.onResolve({filter:/(^|\/)runtime$/},a=>({path:a.path,namespace:'fake'}));
  b.onLoad({filter:/.*/,namespace:'fake'},()=>({loader:'js',contents:'export const alertQueueDatabaseConfigured=()=>f.configured; export const createProductionAlertQueueRepository=()=>f.repository; export const createProductionAlertQueueSqlExecutor=()=>{throw new Error("Unexpected SQL: inject ownership repository");};'}));
 }}]});
 const m={exports:{} as any};new Function('require','module','exports','f',out.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports,f);return m.exports;
}
function database() {
 const f:any={configured:true,rows:new Map(),events:[]};
 f.repository={acquireLease:async(key:string,owner:string,_now:string,expires:string)=>{f.events.push(['acquire',key]);const row=f.rows.get(key);if(row&&row.owner!==owner)return false;f.rows.set(key,{owner,expires});return true;},releaseLease:async(key:string,owner:string)=>{f.events.push(['release',key]);if(f.rows.get(key)?.owner===owner)f.rows.delete(key);}};
 f.repository.renewLease=async(key:string,owner:string)=>f.rows.get(key)?.owner===owner;
 return f;
}
const device:PushDeviceRecord={deviceId:'fixture-device',expoPushToken:'ExpoPushToken[fixture-token-12345]',platform:'ios',bindingId:'fixture-generation',enabled:true,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'};

test('real lease never runs unlocked when the database is absent, including legacy callers',async()=>{
 const f=database();f.configured=false;const m=await modules(f);let ran=false;
 assert.deepEqual(await m.withMemberAlertLease('A',async()=>{ran=true;}),{acquired:false});
 await assert.rejects(m.withMemberAlertLease('A',async()=>{ran=true;},{requireDurable:true}),/durable_member_lease_unavailable/);assert.equal(ran,false);
});
test('independent real lease modules share contention, renew before writes, and cannot release a stolen lease',async()=>{
 const f=database(),a=await modules(f),b=await modules(f);let run=false;
 await a.withMemberAlertLease('A',async(guard:any)=>{
  assert.deepEqual(await b.withMemberAlertLease('A',async()=>{run=true;}),{acquired:false});await guard();
  f.rows.set('member:A',{owner:'new-worker'});await assert.rejects(guard(),/member_lease_lost/);
 },{requireDurable:true});
 assert.equal(run,false);assert.equal(f.rows.get('member:A').owner,'new-worker');
});
test('expired/lost lease cannot be reacquired by a stale operation after a newer worker released it',async()=>{
 const f=database(),m=await modules(f);
 await m.withMemberAlertLease('A',async(guard:any)=>{
  f.rows.delete('member:A'); // newer worker acquired, wrote, released while this operation stalled
  await assert.rejects(guard(),/member_lease_lost/);
 },{requireDurable:true});
});

test('final sender gates stale metadata by current owner/generation and deduplicates each alert/token',async()=>{
 const f=database(),m=await modules(f,'src/lib/push-ownership.ts');let calls=0;const seen:any[]=[];
 let owner='A',generation=device.bindingId;
 const repository={owned:async(id:string,devices:PushDeviceRecord[])=>devices.filter(d=>id===owner&&d.bindingId===generation)};
 const send=async(messages:any[])=>{calls++;seen.push(...messages);return {accepted:messages.length,rejected:0,tickets:[],invalidTokens:[]};};
 const messages=buildExpoPushMessages([device.expoPushToken],{id:'alert',bottleName:'Fixture Bottle',storeLabel:'Fixture Store',matchedArea:'Fixture'});
 assert.equal((await m.sendOwnedExpoPushMessages('A',[device],[...messages,...messages],{repository,send})).accepted,1);
 owner='B';generation='new-generation';
 assert.equal((await m.sendOwnedExpoPushMessages('A',[device],messages,{repository,send})).accepted,0);
 assert.equal((await m.sendOwnedExpoPushMessages('B',[{...device,bindingId:generation}],messages,{repository,send})).accepted,1);
 generation=undefined;assert.equal((await m.sendOwnedExpoPushMessages('B',[{...device,bindingId:'new-generation'}],messages,{repository,send})).accepted,0);
 assert.equal(seen.length,2);assert.equal(calls,2);assert.equal(f.rows.size,0);
});
test('send checks ownership for every provider chunk and stops after lost lease',async()=>{
 const f=database(),m=await modules(f,'src/lib/push-ownership.ts');let calls=0;
 const messages=Array.from({length:101},(_,index)=>buildExpoPushMessages([device.expoPushToken],{id:`alert-${index}`,bottleName:'Fixture',storeLabel:'Fixture',matchedArea:'Fixture'})[0]);
 await assert.rejects(m.sendOwnedExpoPushMessages('A',[device],messages,{repository:{owned:async()=>[device]},send:async(chunk:any[])=>{calls++;assert.equal(chunk.length,100);f.rows.clear();return {accepted:100,rejected:0,tickets:[],invalidTokens:[]};}}),/member_lease_lost/);
 assert.equal(calls,1);
});

test('resource leases serialize final send with cross-account reassignment and fail closed on outages',async()=>{
 const f=database(),a=await modules(f,'src/lib/push-ownership.ts'),b=await modules(f,'src/lib/push-ownership.ts');
 const messages=buildExpoPushMessages([device.expoPushToken],{id:'alert',bottleName:'Fixture',storeLabel:'Fixture',matchedArea:'Fixture'});
 const repository={owned:async()=>[device]};let providerCalls=0;
 await a.sendOwnedExpoPushMessages('A',[device],messages,{repository,send:async()=>{
  providerCalls++;
  await assert.rejects(b.withPushOwnershipLease([device],async()=>{}),/push_ownership_busy/);
  return {accepted:1,rejected:0,tickets:[],invalidTokens:[]};
 }});
 await b.withPushOwnershipLease([device],async()=>{});
 f.configured=false;await assert.rejects(a.sendOwnedExpoPushMessages('A',[device],messages,{repository,send:async()=>{providerCalls++;}}),/durable_member_lease_unavailable/);
 f.configured=true;await assert.rejects(a.sendOwnedExpoPushMessages('A',[device],messages,{repository:{owned:async()=>{throw new Error('database-down');}},send:async()=>{providerCalls++;}}),/database-down/);
 assert.equal(providerCalls,1);assert.equal(f.rows.size,0);
 assert.ok(f.events.every((e:any)=>!JSON.stringify(e).includes('ExpoPushToken[')));
});
