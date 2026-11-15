import test from 'node:test';
import assert from 'node:assert/strict';
import * as currentPolicy from '../src/south-dakota-pickup-policy.mjs';
import {southDakotaResearchSourceContractMatches} from '../src/south-dakota-source-lineage.mjs';

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
