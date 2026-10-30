// Synthetic test admission only. No fields here are source/promotion evidence.
import {createHash}from'node:crypto';import{readFile}from'node:fs/promises';
import{STATE_LIFECYCLE_CONFIG}from'../../src/state-lifecycle.mjs';import{nativeShopifyCohortHash}from'../../src/collectors/native-shopify-onsite.mjs';
import{nativeShopifySource}from'../../src/native-shopify-onsite-policy.mjs';
import{nativeShopifySemanticManifest}from'../../src/native-shopify-contract.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
export function syntheticNativeAdmission(id){
 const source=nativeShopifySource(id),state=source.definition.state;
 const manifest=nativeShopifySemanticManifest(id);
 const immutable={schemaVersion:1,state,generatedAt:source.clock,sourceConfigHash:sha(JSON.stringify(Object.fromEntries(['lifecycle','collector','storeIdentity','sourceSemantics','customerPaths'].map(key=>[key,manifest[key]])))),previewUrl:'https://synthetic-native-fixture.vercel.app',shadowRuns:[1,2,3].map(i=>({runId:'synthetic-shadow-'+i,status:'success',artifactHash:sha('synthetic-shadow-'+i)})),canaryRuns:[1,2].map(i=>({runId:'synthetic-canary-'+i,status:'success',artifactHash:sha('synthetic-canary-'+i)})),provenance:{status:'success',repository:'tarsagent22/Bourbon-Signal',workflowRunId:'99990001',artifactId:'99990002',commitSha:'1'.repeat(40),artifactDigest:sha('synthetic-artifact'),bundleDigest:sha('synthetic-bundle'),workflowRunUrl:'https://github.com/tarsagent22/Bourbon-Signal/actions/runs/99990001',artifactName:'synthetic-provenance-'+state+'-fixture'}};
 const evidence={shadowRuns:3,canaryRuns:2,verifiedAt:source.clock,canaryPreviewUrl:immutable.previewUrl,immutableEvidence:immutable};manifest.evidence={immutablePromotionEvidence:immutable};
 const config=structuredClone(STATE_LIFECYCLE_CONFIG);config.activeStates=[...new Set([...config.activeStates,state])];config.states[state]={...config.states[state],publicStatus:'active',promotionStage:'active',inventoryAlertable:false,watchAlertable:false,promotionEvidence:evidence};
 return{config,authority:{sourceId:id,enabled:true,manifest,promotionEvidence:evidence},nowMs:Date.parse(source.clock),source};
}
export async function nativeFixtureFetch(source){
 const bodies=new Map(await Promise.all(source.receipts.map(async receipt=>[receipt.url,await readFile(new URL('../fixtures/'+source.base+receipt.artifactPath,import.meta.url),'utf8')])));
 return async(url,options)=>{if(!bodies.has(url))throw Error('Fixture attempted an unknown host or URL');const response={ok:true,status:200,url,text:bodies.get(url)};await options?.onResponse?.(response);return response;};
}
