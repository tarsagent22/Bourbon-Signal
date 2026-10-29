import {syntheticNewEnglandPromotion} from '../engine/test/helpers/synthetic-new-england-production.mjs';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as entitlementModule from '../src/lib/entitlements.ts';
const {getEntitlements}=entitlementModule.default||entitlementModule;
const require=createRequire(import.meta.url),base=JSON.parse(await readFile('src/config/state-lifecycle.json','utf8'));
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
try{for(const [state,label]of [['MA','Massachusetts'],['CT','Connecticut'],['RI','Rhode Island']]){
 const f:any={userId:'synthetic-member',entitlements:getEntitlements('standard'),metadata:{unrelated:'preserve'},writes:0};
 f.users={getUser:async()=>({id:f.userId,publicMetadata:structuredClone(f.metadata),privateMetadata:{}}),updateUserMetadata:async(id:string,patch:any)=>{f.writes++;f.metadata={...f.metadata,...structuredClone(patch.publicMetadata)};}};
 const api=await load('src/app/api/user/preferences/route.ts',f,providerStubs);
 const post=(body:any)=>api.POST(new Request('https://fixture.invalid/api/user/preferences',{method:'POST',body:JSON.stringify(body),headers:{'content-type':'application/json'}}));
 const saved=await post({areaPreferences:{states:[state.toLowerCase(),state,'ZZ']}});assert.equal(saved.status,200);
 const prefs=await(await api.GET(new Request('https://fixture.invalid/api/user/preferences'))).json();assert.deepEqual(prefs.areaPreferences.states,[state]);assert.equal(f.metadata.unrelated,'preserve');
 f.entitlements=getEntitlements('free');const before=f.writes;assert.equal((await post({areaPreferences:{states:[state]}})).status,403);assert.equal(f.writes,before);
 f.userId=null;assert.equal((await api.GET(new Request('https://fixture.invalid'))).status,401);assert.equal((await post({areaPreferences:{states:[state]}})).status,401);assert.equal(f.writes,before);
 f.userId='synthetic-member';f.entitlements=getEntitlements('standard');f.prefs=prefs;f.lifecycle=syntheticNewEnglandPromotion(state).lifecycleConfig;
 const empty='export default ()=>null;';
 const components:Record<string,string>={};for(const name of ['Navigation','Footer','ScrollReveal','SignalPointsPanel'])components['@/components/'+name]=name==='ScrollReveal'?'export default ({children})=>children;':empty;
 Object.assign(components,{
  'next/link':'export default ({children,...props})=>require("react").createElement("a",props,children);',
  'framer-motion':'export const motion=new Proxy({},{get:(_,tag)=>({children,initial,animate,transition,whileHover,whileTap,...props})=>require("react").createElement(tag,props,children)});',
  '@/components/LiquidToggle':'export const LiquidToggle=()=>null;',
  '@/components/dashboard/NotificationChannelCard':'export const NotificationChannelCard=()=>null;',
  '@/components/dashboard/CoverageRequestsCard':'export const CoverageRequestsCard=()=>null;',
  '@/components/onboarding/ActivationChecklist':'export const ActivationChecklist=()=>null;',
  '@/hooks/useBottles':'export const useBottles=()=>({bottles:[],loading:false});',
  '@/hooks/useStores':'export const useStores=()=>({stores:[]});',
  '@/hooks/useDrops':'export const useDrops=()=>({drops:[],loading:false,error:null});',
  '@/hooks/useSightings':'export const useSightings=()=>({rewards:null,loading:false,error:null,refresh:async()=>{}});',
  '@/lib/useEngineData':'export const useStats=()=>({stats:{}});',
  '@/lib/watchlist':'export const useWatchlistStore=()=>({watchedBottles:[],addBottle:()=>{},removeBottle:()=>{}});',
  '@/lib/auth':'export const useAuth=()=>({isLoaded:true,isSignedIn:true,entitlements:f.entitlements,user:{id:f.userId},signIn:()=>{}});',
  '@/hooks/useAreaPreferences':'export const useAreaPreferences=()=>({prefs:f.prefs,confirmedPrefs:f.prefs,loading:false,preferenceError:null,savePreferences:async()=>{}});',
  '@/lib/statePreferences':'export const ENGINE_COVERED_STATE_CODES=f.lifecycle.activeStates;',
  '@/lib/activeStates':'export const getActiveEngineStateAreaLabel=s=>null;export const getActiveEngineStateAreaOptions=s=>[];export const getActiveEngineStateName=s=>f.lifecycle.states[s]?.customerLabel||s;',
 });
 const page=await load('src/app/dashboard/page.tsx',f,components);
 const priorWindow=(globalThis as any).window;(globalThis as any).window={location:{search:'?section=alerts'}};
 let html;try{html=renderToStaticMarkup(React.createElement(page.default));}finally{if(priorWindow===undefined)delete (globalThis as any).window;else (globalThis as any).window=priorWindow;}
 assert.ok(html.includes(label),state+' dashboard must render its lifecycle state choice');assert.ok(html.includes('dashboard-section-alerts'));
 const area=await load('src/lib/feed-area-options.ts',f,{'../config/stateLifecycle.ts':'export const STATE_LIFECYCLE_CONFIG=f.lifecycle;'});
 const choice=area.buildSignalFeedAreaDirectory().states.find((row:any)=>row.code===state);assert.equal(choice.engineCoverage,'active');assert.equal(choice.label,label);
 assert.deepEqual(area.buildDropFeedAreaRequest(state,({MA:'Table & Vine',CT:'Branford Wine & Spirits',RI:'Golds Wine'})[state]),{key:'store',value:({MA:'Table & Vine',CT:'Branford Wine & Spirits',RI:'Golds Wine'})[state]});
 output.push({state,actualPreferencesGetPost:true,normalizedAndDeduplicatedState:true,freeWrite403:true,signedOut401:true,actualDashboardComponentRender:true,actualStateAndStoreChoices:true,authenticatedSession:false,physicalDevice:false});
}}finally{globalThis.fetch=originalFetch;}
console.log(JSON.stringify(output));
