import {NATIVE_PICKUP_PREPARATION_SOURCES} from '../engine/src/native-shopify-preparation-policy.mjs';
import * as matcherModule from '../src/lib/monitoring-scope-matcher.ts';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import * as entitlementModule from '../src/lib/entitlements.ts';
const {getEntitlements}=entitlementModule.default||entitlementModule;
const require=createRequire(import.meta.url);
async function load(entry:string,f:any,stubs:Record<string,string>){
 const out=await build({entryPoints:[entry],bundle:true,jsx:'automatic',platform:'node',format:'cjs',write:false,packages:'external',plugins:[{name:'offline-provider-boundaries',setup(b){
 b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:'fixture'}:undefined);
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],loader:'js',resolveDir:process.cwd()}));}}]});
 const m={exports:{} as any};new Function('require','module','exports','f',out.outputFiles[0].text)(require,m,m.exports,f);return m.exports;
}
const providerStubs={
 '@clerk/nextjs/server':'export const auth=async()=>({userId:f.userId});export const clerkClient=async()=>({users:f.users});',
 '@/lib/server-entitlements':'export const getServerEntitlements=async()=>f.entitlements;',
 '@/lib/bottle-mutes-repository':'export const readBottleMutes=async()=>({bottles:[],version:0});export const saveBottleMutes=async()=>{throw Error("No mute writes");};',
 '@/lib/member-collection-repository':'export const getMemberCollectionRepository=()=>({getForUser:async()=>({bottles:[],version:0})});export class MemberCollectionConflictError extends Error{};export class MemberCollectionLimitError extends Error{};',
 '@/lib/preview-qa':'export const isQaPreviewRequest=()=>false;export const getQaPreviewTierFromRequest=()=>"free";export const QA_PREVIEW_PREFERENCES={};',
 '@/lib/alert-queue/member-lease':'export const withMemberAlertLease=async(id,op)=>({acquired:true,result:await op(async()=>{})});',
 'next/server':'export const NextRequest=Request;export const NextResponse=Response;',
};
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Offline fixture forbids provider/network I/O');};
const output=[];
try{for(const source of NATIVE_PICKUP_PREPARATION_SOURCES){
 const state=source.definition.state,store=source.definition.stores[0];
 const f:any={userId:'synthetic-native-member',entitlements:getEntitlements('standard'),metadata:{unrelated:'preserve'},writes:0};
 f.users={getUser:async()=>({id:f.userId,publicMetadata:structuredClone(f.metadata),privateMetadata:{}}),updateUserMetadata:async(id:string,patch:any)=>{assert.equal(id,f.userId);f.writes++;f.metadata={...f.metadata,...structuredClone(patch.publicMetadata)};}};
 const api=await load('src/app/api/user/preferences/route.ts',f,providerStubs);
 const post=(body:any)=>api.POST(new Request('https://fixture.invalid/api/user/preferences',{method:'POST',body:JSON.stringify(body),headers:{'content-type':'application/json'}}));
 assert.equal((await post({areaPreferences:{states:[state.toLowerCase(),state,'ZZ']}})).status,200);
 let prefs=await(await api.GET(new Request('https://fixture.invalid/api/user/preferences'))).json();assert.deepEqual(prefs.areaPreferences.states,[state]);assert.equal(f.metadata.unrelated,'preserve');
 const scope={type:'store',id:`store:${state}:${store.id}`,state,label:store.name};
 assert.equal((await post({monitoringScopes:[scope,scope]})).status,200);
 prefs=await(await api.GET(new Request('https://fixture.invalid/api/user/preferences'))).json();assert.deepEqual(prefs.monitoringScopes,[scope]);assert.deepEqual(prefs.areaPreferences.states,[state],'legacy state context preserves the explicit store scope above');
 const {candidateMatchesMonitoringScopes}=matcherModule.default||matcherModule;
 assert.equal(candidateMatchesMonitoringScopes({state,storeId:store.id,storeName:store.name,storeAddress:store.address},prefs.monitoringScopes),true);
 assert.equal(candidateMatchesMonitoringScopes({state,storeId:'neighbor',storeName:'Other premise',storeAddress:'Other address'},prefs.monitoringScopes),false);
 f.entitlements=getEntitlements('free');const before=f.writes;assert.equal((await post({monitoringScopes:[scope]})).status,403);assert.equal(f.writes,before);
 f.userId=null;assert.equal((await api.GET(new Request('https://fixture.invalid'))).status,401);assert.equal((await post({monitoringScopes:[scope]})).status,401);assert.equal(f.writes,before);
 output.push({sourceId:source.definition.runtimeId,actualPreferencesGetPost:true,exactStoreScope:true,stateDeduplication:true,freeWrite403:true,signedOut401:true,providerWrites:0,authenticatedSession:false,customerStoresAdded:0});
}}finally{globalThis.fetch=originalFetch;}
console.log(JSON.stringify(output));
