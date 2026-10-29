// Unit-test schemas only. These are deliberately synthetic identifiers and
// never production configuration, collected evidence, or promotion receipts.
import {readFile} from 'node:fs/promises';
import waManifest from '../../data/state-integration/WA.json' with {type:'json'};
import nmManifest from '../../data/state-integration/NM.json' with {type:'json'};
import {STATE_LIFECYCLE_CONFIG} from '../../src/state-lifecycle.mjs';
import {westernGrocerySourceConfigHash} from '../../src/collectors/western-grocery-production.mjs';
import {WESTERN_GROCERY_EXPANSION_SOURCES} from '../../src/collectors/western-grocery-premises.mjs';
export const fixture=JSON.parse(await readFile(new URL('../fixtures/new-mexico-grocery-expansion/identity.json',import.meta.url)));
export function syntheticPromotedGroceryConfig(state='NM'){
  const config=structuredClone(STATE_LIFECYCLE_CONFIG),url='https://synthetic-unit-preview.invalid';
  const hash='1'.repeat(64),runs=count=>Array.from({length:count},(_,i)=>({runId:`synthetic-unit-${i}`,status:'success',artifactHash:hash}));
  const immutable={schemaVersion:1,state,generatedAt:new Date().toISOString(),sourceConfigHash:westernGrocerySourceConfigHash(state),previewUrl:url,
    shadowRuns:runs(3),canaryRuns:runs(2),provenance:{status:'success',repository:'synthetic/unit-test',workflowRunId:'1',artifactId:'1',commitSha:'a'.repeat(40),
      artifactDigest:hash,bundleDigest:hash,workflowRunUrl:'https://github.com/synthetic/unit-test/actions/runs/1',artifactName:`state-promotion-provenance-${state}-1`}};
  config.activeStates=[...new Set([...config.activeStates,state])];
  config.states[state]={...config.states[state],publicStatus:'active',promotionStage:'active',inventoryAlertable:false,watchAlertable:false,
    promotionEvidence:{verticalSliceManifest:`engine/data/state-integration/${state}.json`,fixtureContract:`engine/data/state-fixtures/${state}.json`,shadowRuns:3,canaryRuns:2,verifiedAt:new Date().toISOString(),canaryPreviewUrl:url,immutableEvidence:immutable}};
  return config;
}
export function mockedCompleteGroceryFetch(state='NM',onRequest=()=>{}){
  const sources=WESTERN_GROCERY_EXPANSION_SOURCES.filter(source=>source.stateCode===state);
  const stores=sources.map(source=>({locationId:source.merchantId,polarisBannerName:source.banner,
    domainName:source.resolverDomainName||source.banner,address:{line1:source.address.split(',')[0],city:source.city,state,country:'US',zipcode:source.zip}}));
  return async url=>{onRequest(url);return{ok:true,status:200,url,text:JSON.stringify(url.includes('storeresolver')?{instore:{stores}}:
    {response:{docs:fixture.products.map(product=>({...product,storeId:new URL(url).searchParams.get('storeid')}))}})};};
}

export function syntheticPromotionManifest(state,config){const manifest=structuredClone(state==='WA'?waManifest:nmManifest);manifest.evidence.immutablePromotionEvidence=structuredClone(config.states[state].promotionEvidence.immutableEvidence);return manifest;}

export function syntheticInactiveGroceryConfig(state){const config=structuredClone(STATE_LIFECYCLE_CONFIG);config.activeStates=config.activeStates.filter(id=>id!==state);config.states[state]={...config.states[state],publicStatus:'research_only',inventoryAlertable:false,watchAlertable:false};return config;}
