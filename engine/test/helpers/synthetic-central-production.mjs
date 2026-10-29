// Schema-only unit fixtures, never source/promotion evidence or production
// authority. All run/artifact identifiers and hashes below are fabricated tests.
import {readFile} from 'node:fs/promises';
import wiManifest from '../../data/state-integration/WI.json' with {type:'json'};
import okManifest from '../../data/state-integration/OK.json' with {type:'json'};
import {STATE_LIFECYCLE_CONFIG} from '../../src/state-lifecycle.mjs';
import {centralCityHiveSourceConfigHash} from '../../src/collectors/central-cityhive-production.mjs';
import {CENTRAL_CITYHIVE_EXPANSION_SOURCES} from '../../src/collectors/central-cityhive-premises.mjs';
export const bibleFile=new URL('../../out/bourbon-bible.json',import.meta.url);
const fixtures=new Map(await Promise.all(CENTRAL_CITYHIVE_EXPANSION_SOURCES.map(async source=>[source.hostname,await readFile(new URL(`../fixtures/central-cityhive/${source.id}.json`,import.meta.url),'utf8')])));
export function syntheticCentralPromotion(state='WI'){
  const lifecycle=structuredClone(STATE_LIFECYCLE_CONFIG),manifest=structuredClone(state==='WI'?wiManifest:okManifest),hash='1'.repeat(64),url='https://synthetic-unit-only.invalid';
  const runs=count=>Array.from({length:count},(_,i)=>({runId:`synthetic-unit-${i}`,status:'success',artifactHash:hash}));
  const immutable={schemaVersion:1,state,generatedAt:new Date().toISOString(),sourceConfigHash:centralCityHiveSourceConfigHash(state,manifest),previewUrl:url,
    shadowRuns:runs(3),canaryRuns:runs(2),provenance:{status:'success',repository:'tarsagent22/Bourbon-Signal',workflowRunId:'1',artifactId:'1',commitSha:'a'.repeat(40),
      artifactDigest:hash,bundleDigest:hash,workflowRunUrl:'https://github.com/tarsagent22/Bourbon-Signal/actions/runs/1',artifactName:`synthetic-unit-provenance-${state}-1`}};
  lifecycle.activeStates=[...new Set([...lifecycle.activeStates,state])];
  lifecycle.states[state]={customerLabel:state==='WI'?'Wisconsin':'Oklahoma',coverageTier:'sparse_live_store_inventory',refinementLevel:'store',
    publicStatus:'active',promotionStage:'active',inventoryAlertable:false,watchAlertable:false,
    promotionEvidence:{shadowRuns:3,canaryRuns:2,verifiedAt:new Date().toISOString(),canaryPreviewUrl:url,
      verticalSliceManifest:`engine/data/state-integration/${state}.json`,fixtureContract:`engine/data/state-fixtures/${state}.json`,immutableEvidence:immutable}};
  manifest.evidence.immutablePromotionEvidence=structuredClone(immutable);
  return{lifecycleConfig:lifecycle,promotionManifest:manifest};
}
export function mockedCentralFetch(onRequest=()=>{},mutate){return async url=>{
  onRequest(url);const json=JSON.parse(fixtures.get(new URL(url).hostname));if(mutate)mutate(json,url);
  return{ok:true,status:200,url,text:`<script type="application/json">${JSON.stringify(json)}</script>`};
};}
