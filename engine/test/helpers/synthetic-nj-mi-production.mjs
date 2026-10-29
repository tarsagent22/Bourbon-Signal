// Schema-only unit fixtures, never source/promotion evidence or production
// authority. All run/artifact identifiers and hashes below are fabricated tests.
import {readFile} from 'node:fs/promises';
import njManifest from '../../data/state-integration/NJ.json' with {type:'json'};
import miManifest from '../../data/state-integration/MI.json' with {type:'json'};
import {STATE_LIFECYCLE_CONFIG} from '../../src/state-lifecycle.mjs';
import {njMiSourceConfigHash} from '../../src/collectors/nj-mi-cityhive-production.mjs';
import {NJ_MI_CANDIDATE_PREMISES} from '../../src/collectors/nj-mi-research-premises.mjs';
export const bibleFile=new URL('../../out/bourbon-bible.json',import.meta.url);
const template=JSON.parse(await readFile(new URL('../fixtures/additional-cityhive-expansion/MI.json',import.meta.url),'utf8'));
export function syntheticNjMiPromotion(state='NJ'){
  const lifecycle=structuredClone(STATE_LIFECYCLE_CONFIG),manifest=structuredClone(state==='NJ'?njManifest:miManifest),hash='1'.repeat(64),url='https://synthetic-unit-only.invalid';
  const runs=count=>Array.from({length:count},(_,i)=>({runId:`synthetic-unit-${i}`,status:'success',artifactHash:hash}));
  const immutable={schemaVersion:1,state,generatedAt:new Date().toISOString(),sourceConfigHash:njMiSourceConfigHash(state,manifest),previewUrl:url,
    shadowRuns:runs(3),canaryRuns:runs(2),provenance:{status:'success',repository:'tarsagent22/Bourbon-Signal',workflowRunId:'1',artifactId:'1',commitSha:'a'.repeat(40),
      artifactDigest:hash,bundleDigest:hash,workflowRunUrl:'https://github.com/tarsagent22/Bourbon-Signal/actions/runs/1',artifactName:`synthetic-unit-provenance-${state}-1`}};
  lifecycle.activeStates=[...new Set([...lifecycle.activeStates,state])];
  lifecycle.states[state]={customerLabel:state==='NJ'?'New Jersey':'Michigan',coverageTier:'sparse_live_store_inventory',refinementLevel:'store',
    publicStatus:'active',promotionStage:'active',inventoryAlertable:false,watchAlertable:false,
    promotionEvidence:{shadowRuns:3,canaryRuns:2,verifiedAt:new Date().toISOString(),canaryPreviewUrl:url,
      verticalSliceManifest:`engine/data/state-integration/${state}.json`,fixtureContract:`engine/data/state-fixtures/${state}.json`,immutableEvidence:immutable}};
  manifest.evidence.immutablePromotionEvidence=structuredClone(immutable);
  return{lifecycleConfig:lifecycle,promotionManifest:manifest};
}
// Merchant rebinding below is deliberately synthetic test data, never live proof.
export function mockedNjMiFetch(onRequest=()=>{},mutate){return async url=>{
  onRequest(url);const parsed=new URL(url),source=NJ_MI_CANDIDATE_PREMISES.find(row=>row.hostname===parsed.hostname&&row.merchantId===parsed.searchParams.get('merchant-id'));
  if(!source)throw Error('Unreviewed synthetic request');
  const json=structuredClone(template);json.state=source.state;json.merchantId=source.merchantId;json.sourceUrl=url;
  json.merchant_configs=[{merchant:{id:source.merchantId,name:source.name,address:{full_address:source.address,location:{type:'Point',coordinates:[source.lng,source.lat]}}}}];
  for(const product of json.products)for(const merchant of product.merchants){merchant.merchant_id=source.merchantId;merchant.full_address=source.address;for(const option of merchant.product_options){option.merchant_id=source.merchantId;option.full_address=source.address;option.product_url=source.baseUrl+'/shop/product/elijah-craig-barrel-proof/'+product.id+'?option-id='+option.option_id;}}
  if(mutate)mutate(json,url);return{ok:true,status:200,url,text:'<script type="application/json">'+JSON.stringify(json)+'</script>'};
};}
