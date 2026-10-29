// Schema-only unit fixtures, never source/promotion evidence or production
// authority. All run/artifact identifiers and hashes below are fabricated tests.
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import maManifest from '../../data/state-integration/MA.json' with {type:'json'};
import ctManifest from '../../data/state-integration/CT.json' with {type:'json'};
import riManifest from '../../data/state-integration/RI.json' with {type:'json'};
import {STATE_LIFECYCLE_CONFIG} from '../../src/state-lifecycle.mjs';
import {newEnglandSourceConfigHash} from '../../src/collectors/new-england-production.mjs';
import {NEW_ENGLAND_RESEARCH_SOURCES} from '../../src/collectors/new-england-premises.mjs';
import {newEnglandProductionCohortKey} from '../../src/new-england-production-config.mjs';
export const bibleFile=new URL('../../out/bourbon-bible.json',import.meta.url);
const template=JSON.parse(await readFile(new URL('../fixtures/additional-cityhive-expansion/MI.json',import.meta.url),'utf8'));
export function syntheticNewEnglandPromotion(state='MA'){
  const lifecycle=structuredClone(STATE_LIFECYCLE_CONFIG),manifest=structuredClone(({MA:maManifest,CT:ctManifest,RI:riManifest})[state]),hash='1'.repeat(64),url='https://synthetic-unit-only.invalid';
  const runs=count=>Array.from({length:count},(_,i)=>({runId:`synthetic-unit-${i}`,status:'success',artifactHash:hash}));
  const immutable={schemaVersion:1,state,generatedAt:new Date().toISOString(),sourceConfigHash:newEnglandSourceConfigHash(state,manifest),previewUrl:url,
    shadowRuns:runs(3),canaryRuns:runs(2),sourceProof:{protocol:'bourbon-signal/new-england-first-party-cohort@1',
      cohortSha256:newEnglandProductionCohortKey(state),allSourceRunsComplete:true,storeIds:NEW_ENGLAND_RESEARCH_SOURCES.filter(source=>source.state===state).map(source=>source.storeId)},
    provenance:{status:'success',repository:'tarsagent22/Bourbon-Signal',workflowRunId:'1',artifactId:'1',commitSha:'a'.repeat(40),
      artifactDigest:hash,bundleDigest:hash,workflowRunUrl:'https://github.com/tarsagent22/Bourbon-Signal/actions/runs/1',artifactName:`synthetic-unit-provenance-${state}-1`}};
  lifecycle.activeStates=[...new Set([...lifecycle.activeStates,state])];
  lifecycle.states[state]={customerLabel:({MA:'Massachusetts',CT:'Connecticut',RI:'Rhode Island'})[state],coverageTier:'sparse_live_store_inventory',refinementLevel:'store',
    publicStatus:'active',promotionStage:'active',inventoryAlertable:false,watchAlertable:false,
    promotionEvidence:{shadowRuns:3,canaryRuns:2,verifiedAt:new Date().toISOString(),canaryPreviewUrl:url,
      verticalSliceManifest:`engine/data/state-integration/${state}.json`,fixtureContract:`engine/data/state-fixtures/${state}.json`,immutableEvidence:immutable}};
  manifest.evidence.immutablePromotionEvidence=structuredClone(immutable);
  return{lifecycleConfig:lifecycle,promotionManifest:manifest};
}
// Frozen first-party bodies with synthetic promotion and test observation clocks.
// These calls are implementation fixtures, never current or hosted evidence.
const receiptRoot=new URL('../../data/source-evidence/new-england-research-20261029/',import.meta.url);
const receipts=JSON.parse(await readFile(new URL('receipts.json',receiptRoot),'utf8')).receipts;
export function mockedNewEnglandFetch(onRequest=()=>{},mutate){return async url=>{
  onRequest(url);const parsed=new URL(url),source=NEW_ENGLAND_RESEARCH_SOURCES.find(row=>row.hostname===parsed.hostname&&row.merchantId===parsed.searchParams.get('merchant-id'));
  if(!source)throw Error('Unreviewed synthetic request');const receipt=receipts.find(row=>row.url===source.discoveryUrl);
  const body=gunzipSync(await readFile(new URL(receipt.artifactPath,receiptRoot)),{maxOutputLength:2*1024*1024}).toString('utf8');
  if(!mutate)return{ok:true,status:200,url,text:body};
  const roots=[];for(const match of body.matchAll(/decodeURIComponent\(\s*(["'`])([\s\S]*?)\1\s*\)/g))try{roots.push(JSON.parse(decodeURIComponent(match[2])));}catch{}
  let count=0;const flat={products:[],merchant_configs:[]};
  const walk=value=>{if(++count>80000||!value||typeof value!=='object')return;if(Array.isArray(value.products))flat.products.push(...value.products);if(Array.isArray(value.merchant_configs))flat.merchant_configs.push(...value.merchant_configs);for(const child of Object.values(value))if(child&&typeof child==='object')walk(child);};roots.forEach(walk);
  mutate(flat,url);return{ok:true,status:200,url,text:'<script type="application/json">'+JSON.stringify(flat)+'</script>'};
};}
