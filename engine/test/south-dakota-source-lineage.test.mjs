import test from 'node:test';
import assert from 'node:assert/strict';
import * as currentPolicy from '../src/south-dakota-pickup-policy.mjs';
import {hasReviewedSouthDakotaResearchRegistration,hasSouthDakotaProductionRegistration,southDakotaResearchSourceContractMatches} from '../src/south-dakota-source-lineage.mjs';

test('South Dakota retained shadow replay tolerates production-only policy additions',()=>{
  const previous={origin:currentPolicy.origin,batchPath:currentPolicy.batchPath,sources:currentPolicy.sources,
    southDakotaRetailerRequest:currentPolicy.southDakotaRetailerRequest};
  assert.equal(southDakotaResearchSourceContractMatches(previous,currentPolicy),true);
  assert.equal(southDakotaResearchSourceContractMatches(previous,{...currentPolicy,origin:'https://other.example'}),false);
  assert.equal(southDakotaResearchSourceContractMatches(previous,{...currentPolicy,batchPath:'/other'}),false);
  assert.equal(southDakotaResearchSourceContractMatches(previous,{...currentPolicy,
    sources:currentPolicy.sources.map((source,index)=>index?source:{...source,address:'999 Other St'})}),false);
  assert.equal(southDakotaResearchSourceContractMatches(previous,{...currentPolicy,
    southDakotaRetailerRequest:term=>currentPolicy.southDakotaRetailerRequest(term)+'&changed=1'}),false);
});

test('South Dakota retired shadow registration binds only to the exact production source route',()=>{
  const historical="import { southDakotaResearchSource, southDakotaResearchLifecycle, collectSouthDakotaResearch } from './research-south-dakota-retailer.mjs'; export const x=researchSourceForState(state) || southDakotaResearchSource(state); if(config&&config===southDakotaResearchSource(config.id))return collectSouthDakotaResearch(config,bible,options);";
  const genericState="import {collectSouthDakotaProductionState} from './south-dakota-production.mjs'; export async function collectState(config,bible,options={}) { if(config.id==='SD')return collectSouthDakotaProductionState(config,bible,options); }";
  const stateSources="import { origin as SD_MR_LIQUOR_ORIGIN, batchPath as SD_MR_LIQUOR_PATH } from './south-dakota-pickup-policy.mjs'; { id: 'SD', label: 'South Dakota first-party pickup inventory', sources: [{ kind: 'api', url: SD_MR_LIQUOR_ORIGIN + SD_MR_LIQUOR_PATH }] }";
  assert.equal(hasReviewedSouthDakotaResearchRegistration(historical),true);
  assert.equal(hasReviewedSouthDakotaResearchRegistration(historical.replace('collectSouthDakotaResearch(config,bible,options)','other(config,bible,options)')),false);
  assert.equal(hasSouthDakotaProductionRegistration({genericState,stateSources}),true);
  assert.equal(hasSouthDakotaProductionRegistration({genericState:genericState.replace('collectSouthDakotaProductionState(config,bible,options)','other(config,bible,options)'),stateSources}),false);
  assert.equal(hasSouthDakotaProductionRegistration({genericState,stateSources:stateSources.replace("id: 'SD'", "id: 'ND'")}),false);
});
