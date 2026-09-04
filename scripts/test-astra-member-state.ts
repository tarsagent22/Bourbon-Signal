import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { getEntitlements } from '../src/lib/entitlements.ts';
import { createMobileApi, MobileApiError } from '../apps/mobile/src/api/client.ts';
import { bottleWatchMutation, setBottleWatched } from '../apps/mobile/src/radar/radar-preferences.ts';

// Execute the real Next route with ONLY external adapters substituted. No network/env loading.
async function route(f: any) {
  const stubs: Record<string, string> = {
    '@clerk/nextjs/server': 'export const auth = async()=>({userId:f.userId}); export const clerkClient=async()=>({users:f.users});',
    '@/lib/server-entitlements': 'export const getServerEntitlements=async()=>f.entitlements;',
    '@/lib/member-collection-repository': 'export const getMemberCollectionRepository=()=>({getForUser:async()=>({bottles:[],version:0})}); export class MemberCollectionConflictError extends Error{}; export class MemberCollectionLimitError extends Error{};',
    '@/lib/preview-qa': 'export const isQaPreviewRequest=()=>false; export const getQaPreviewTierFromRequest=()=>"free"; export const QA_PREVIEW_PREFERENCES={};',
    '@/lib/alert-queue/member-lease': 'export const withMemberAlertLease=(id,op,options)=>f.lease(id,op,options);',
    'next/server': 'export const NextResponse=Response; export const NextRequest=Request;',
  };
  const result = await build({ entryPoints: ['src/app/api/user/preferences/route.ts'], bundle:true, platform:'node', format:'cjs', write:false, packages:'external', plugins:[{name:'offline-adapters',setup(b){
    b.onResolve({filter:/.*/}, args=>stubs[args.path] ? {path:args.path,namespace:'fake'}:undefined);
    b.onLoad({filter:/.*/,namespace:'fake'}, args=>({contents:stubs[args.path],loader:'js'}));
  }}] });
  const mod = {exports:{} as any};
  new Function('require','module','exports','f','Response','Request',result.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports,f,Response,Request);
  return mod.exports;
}
function fixture() {
  const f:any = {userId:'fixture-member',entitlements:getEntitlements('standard'),metadata:{bottleAlertPreferences:{bottleNames:['Legacy Bottle'],bottleKeys:['legacy bottle']},unrelated:'preserve'},writes:0,locked:false,durable:true};
  f.users={getUser:async()=>{ await Promise.resolve(); return {id:f.userId,publicMetadata:structuredClone(f.metadata),privateMetadata:{}}; },updateUserMetadata:async(_id:string, patch:any)=>{if(patch.publicMetadata){f.writes++;f.metadata={...f.metadata,...structuredClone(patch.publicMetadata)};} }};
  f.lease=async(_id:string, op:any, options:any)=>{if(!f.durable && options?.requireDurable) throw new Error('durable_member_lease_unavailable'); if(f.locked)return {acquired:false}; f.locked=true;try{return {acquired:true,result:await op(async()=>{if(f.lost)throw new Error('member_lease_lost');})};}finally{f.locked=false;}};
  return f;
}
const post=(r:any,body:any)=>r.POST(new Request('https://fixture.invalid/api/user/preferences',{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}}));
const delta=(name:string,watched=true)=>({watchlistMutation:{bottleName:name,watched}});

test('old full replacements fail explicitly, preserving all legacy data',async()=>{
 const f=fixture(),r=await route(f); const response=await post(r,{bottleAlertPreferences:{bottleNames:['Stale'],bottleKeys:['stale']}});
 assert.equal(response.status,409); assert.equal(f.writes,0); assert.deepEqual(f.metadata.bottleAlertPreferences.bottleNames,['Legacy Bottle']);
});
test('two independent route instances preserve different-bottle deltas after busy retry',async()=>{
 const f=fixture(),a=await route(f),b=await route(f);
 const responses=await Promise.all([post(a,delta('Bottle A')),post(b,delta('Bottle B'))]);
 for(let i=0;i<responses.length;i++) {if(responses[i].status===409) assert.equal((await post(i?a:b,delta(i?'Bottle B':'Bottle A'))).status,200); else assert.equal(responses[i].status,200);}
 assert.deepEqual(new Set(f.metadata.bottleAlertPreferences.bottleNames),new Set(['Legacy Bottle','Bottle A','Bottle B'])); assert.equal(f.metadata.unrelated,'preserve');
});
test('concurrent same-bottle intents are serialized, with explicit busy conflict and idempotent retry',async()=>{
 const f=fixture(),a=await route(f),b=await route(f);
 const changes=[delta('Bottle A'),delta('Bottle A')];
 const responses=await Promise.all([post(a,changes[0]),post(b,changes[1])]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 const version=f.metadata.bottleAlertPreferences.version;
 const retry=responses[0].status===409?0:1;assert.equal((await post(retry?a:b,changes[retry])).status,200);
 assert.equal(f.metadata.bottleAlertPreferences.version,version);
 const opposing=[delta('Bottle A',false),delta('Bottle A',true)];
 const results=await Promise.all([post(a,opposing[0]),post(b,opposing[1])]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const loser=results[0].status===409?0:1;assert.equal((await post(loser?a:b,opposing[loser])).status,200);
 assert.equal(f.metadata.bottleAlertPreferences.bottleNames.includes('Bottle A'),opposing[loser].watchlistMutation.watched);
 assert.ok(f.metadata.bottleAlertPreferences.bottleNames.includes('Legacy Bottle'));
});

test('replacement CAS conflicts after a delta; current version replacement succeeds',async()=>{
 const f=fixture(),r=await route(f); const first=await (await r.GET(new Request('https://fixture.invalid'))).json();
 assert.equal((await post(r,delta('Bottle A'))).status,200);
 assert.equal((await post(r,{bottleAlertPreferences:{...first.bottleAlertPreferences,bottleNames:['Stale'],bottleKeys:['stale']}})).status,409);
 const current=await (await r.GET(new Request('https://fixture.invalid'))).json();
 assert.equal((await post(r,{bottleAlertPreferences:current.bottleAlertPreferences})).status,200);
});
test('same-bottle adds are idempotent; remove then add is explicit last serialized intent',async()=>{
 const f=fixture(),r=await route(f); await post(r,delta('Bottle A')); const version=f.metadata.bottleAlertPreferences.version;
 await post(r,delta('Bottle A')); assert.equal(f.metadata.bottleAlertPreferences.version,version);
 await post(r,delta('Bottle A',false)); assert.ok(!f.metadata.bottleAlertPreferences.bottleNames.includes('Bottle A'));
 await post(r,delta('Bottle A')); assert.equal(f.metadata.bottleAlertPreferences.bottleNames.filter((n:string)=>n==='Bottle A').length,1);
});
test('entitlements are enforced against the current state, without truncating old data',async()=>{
 const f=fixture(),r=await route(f); f.entitlements={...f.entitlements,trackedBottleLimit:1};
 assert.equal((await post(r,delta('Bottle A'))).status,403); assert.equal(f.writes,0);
 assert.equal((await post(r,delta('Legacy Bottle',false))).status,200);
 f.entitlements=getEntitlements('free'); assert.equal((await post(r,delta('Bottle A'))).status,403);
});
test('stale independent mobile clients execute real route deltas; old helper replacements fail safely',async()=>{
 const f=fixture(),r=await route(f);
 const client=()=>createMobileApi({baseUrl:'https://fixture.invalid',getToken:async()=>null,fetcher:async request=>{
  const req=new Request(request);return req.method==='POST'?r.POST(req):r.GET(req);
 }});
 const a=client(),b=client();const oldA=await a.getMemberPreferences(),oldB=await b.getMemberPreferences();
 await a.updateMemberPreferences({watchlistMutation:bottleWatchMutation('Bottle A',true)});
 assert.deepEqual((await b.getMemberPreferences()).bottleAlertPreferences,oldB.bottleAlertPreferences,'second mounted client really is stale');
 await b.updateMemberPreferences({watchlistMutation:bottleWatchMutation('Bottle B',true)});
 assert.deepEqual(new Set(f.metadata.bottleAlertPreferences.bottleNames),new Set(['Legacy Bottle','Bottle A','Bottle B']));
 await assert.rejects(a.updateMemberPreferences({bottleAlertPreferences:setBottleWatched(oldA,'Stale add',true)}),e=>e instanceof MobileApiError && e.status===409);
 await assert.rejects(b.updateMemberPreferences({bottleAlertPreferences:{...oldB.bottleAlertPreferences,bottleNames:[],bottleKeys:[]}}),e=>e instanceof MobileApiError && e.status===409);
});

test('malformed/ambiguous writes never become a successful empty replacement',async()=>{
 const f=fixture(),r=await route(f);
 for(const body of [null,[],{watchlistMutation:null},{watchlistMutation:{bottleName:'Bottle A',watched:'yes'}},{...delta('A'),bottleAlertPreferences:{bottleNames:[],bottleKeys:[],version:0}},{bottleAlertPreferences:{version:0,bottleNames:'bad',bottleKeys:[]}}])assert.equal((await post(r,body)).status,400);
 assert.equal(f.writes,0);
});

test('large legacy watchlist survives reads and unrelated writes; over-cap removal stays possible',async()=>{
 const f=fixture(),r=await route(f);const names=Array.from({length:120},(_,i)=>`Legacy ${i}`);
 f.metadata.bottleAlertPreferences={bottleNames:names,bottleKeys:names.map(n=>n.toLowerCase())};
 assert.equal((await (await r.GET(new Request('https://fixture.invalid'))).json()).bottleAlertPreferences.bottleNames.length,120);
 assert.equal((await post(r,{alertMode:'specific_bottles'})).status,200);
 assert.equal(f.metadata.bottleAlertPreferences.bottleNames.length,120);
 assert.equal((await post(r,delta('Legacy 0',false))).status,200);assert.equal(f.metadata.bottleAlertPreferences.bottleNames.length,119);
 assert.equal((await post(r,delta('New bottle'))).status,403);
});

test('missing durable lease or lost lease never writes watchlist metadata',async()=>{
 const f=fixture(),r=await route(f); f.durable=false;
 assert.equal((await post(r,delta('Bottle A'))).status,503); assert.equal(f.writes,0);
 f.durable=true;f.lost=true; assert.equal((await post(r,delta('Bottle A'))).status,503); assert.equal(f.writes,0);
});
