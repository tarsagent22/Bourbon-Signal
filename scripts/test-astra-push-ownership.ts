import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { normalizePushDevices } from '../src/lib/push-devices.ts';

async function route(f:any) {
 const stubs:Record<string,string>={
 '@clerk/nextjs/server':'export const auth=async()=>({userId:f.userId}); export const clerkClient=async()=>({users:f.users});',
 '@/lib/server-entitlements':'export const isServerPaidTier=async()=>f.paid;',
 '@/lib/alert-queue/member-lease':'export const withMemberAlertLease=(id,op,opts)=>f.lease(id,op,opts);',
 '@/lib/push-ownership':'export const getPushOwnershipRepository=()=>f.ownership; export const withPushOwnershipLease=(devices,op)=>op(async()=>{}); export const ownedPushDevices=(id,devices)=>f.owned(id,devices);',
 'next/server':'export const NextRequest=Request;',
 };
 const out=await build({entryPoints:['src/app/api/v1/me/push-devices/route.ts'],bundle:true,platform:'node',format:'cjs',write:false,packages:'external',plugins:[{name:'offline',setup(b){b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:'fake'}:undefined);b.onLoad({filter:/.*/,namespace:'fake'},a=>({contents:stubs[a.path],loader:'js'}));}}]});
 const m={exports:{} as any};new Function('require','module','exports','f','Response','Request',out.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports,f,Response,Request);return m.exports;
}
function fixture(){
 const f:any={userId:'A',paid:true,accounts:new Map(),bindings:new Map(),locked:false,durable:true,writeFail:false};
 const account=(id:string)=>{if(!f.accounts.has(id))f.accounts.set(id,{id,publicMetadata:{},privateMetadata:{}});return f.accounts.get(id);};
 f.users={getUser:async(id:string)=>structuredClone(account(id)),updateUserMetadata:async(id:string,patch:any)=>{if(f.writeFail)throw new Error('fixture write failure');const a=account(id);for(const k of ['privateMetadata','publicMetadata'])if(patch[k])a[k]={...a[k],...structuredClone(patch[k])};}};
 f.lease=async(_id:string,op:any,opts:any)=>{if(opts?.requireDurable&&!f.durable)throw new Error('unavailable');if(f.locked)return {acquired:false};f.locked=true;try{return {acquired:true,result:await op(async()=>{})};}finally{f.locked=false;}};
 f.ownership={bind:async(id:string,d:any,bindingId:string)=>{f.bindings.set('device:'+d.deviceId,{id,bindingId});f.bindings.set('token:'+d.expoPushToken,{id,bindingId});},disable:async(id:string,deviceId:string)=>{if(f.bindings.get('device:'+deviceId)?.id===id)f.bindings.delete('device:'+deviceId);}};
 f.owned=async(id:string,devices:any)=>normalizePushDevices(devices).filter(d=>d.enabled && f.bindings.get('device:'+d.deviceId)?.id===id && f.bindings.get('device:'+d.deviceId)?.bindingId===d.bindingId && f.bindings.get('token:'+d.expoPushToken)?.bindingId===d.bindingId);
 return f;
}
const body={action:'register',deviceId:'fixture-installation',expoPushToken:'ExpoPushToken[fixture-token-12345]',platform:'ios'};
const post=(r:any,b:any)=>r.POST(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify(b),headers:{'Content-Type':'application/json'}}));
const get=(r:any)=>r.GET(Object.assign(new Request('https://fixture.invalid'),{nextUrl:new URL('https://fixture.invalid?deviceId=fixture-installation')}));
test('real push route registers durable binding and status rejects the previous owner after reassignment',async()=>{
 const f=fixture(),r=await route(f);assert.equal((await post(r,body)).status,200);assert.equal((await (await get(r)).json()).currentDeviceRegistered,true);
 f.userId='B';assert.equal((await post(r,body)).status,200);f.userId='A';assert.equal((await (await get(r)).json()).currentDeviceRegistered,false);
});
test('online disable revokes binding even when stale metadata remains; old account cannot disable new owner',async()=>{
 const f=fixture(),r=await route(f);await post(r,body);const stale=structuredClone(f.accounts.get('A').privateMetadata.pushDevices);
 assert.equal((await post(r,{action:'disable',deviceId:body.deviceId})).status,200);f.accounts.get('A').privateMetadata.pushDevices=stale;
 assert.equal((await (await get(r)).json()).currentDeviceRegistered,false);
 f.userId='B';await post(r,body);f.userId='A';await post(r,{action:'disable',deviceId:body.deviceId});f.userId='B';assert.equal((await (await get(r)).json()).currentDeviceRegistered,true);
});
test('revoke persists even if metadata write fails; unrelated installations survive',async()=>{
 const f=fixture(),r=await route(f);await post(r,body);await post(r,{...body,deviceId:'another-installation',expoPushToken:'ExpoPushToken[another-fixture-token]'});
 f.writeFail=true;assert.equal((await post(r,{action:'disable',deviceId:body.deviceId})).status,503);f.writeFail=false;
 assert.equal((await (await get(r)).json()).currentDeviceRegistered,false);
 const owned=await f.owned('A',f.accounts.get('A').privateMetadata.pushDevices);assert.equal(owned.length,1);assert.equal(owned[0].deviceId,'another-installation');
});

test('missing database refuses mutation; free can revoke but cannot register; tokens never returned',async()=>{
 const f=fixture(),r=await route(f);f.durable=false;assert.equal((await post(r,body)).status,503);
 f.durable=true;f.paid=false;assert.equal((await post(r,body)).status,403);assert.equal((await post(r,{action:'disable',deviceId:body.deviceId})).status,200);
 f.paid=true;const response=await post(r,body);assert.ok(!(await response.text()).includes(body.expoPushToken));
});
