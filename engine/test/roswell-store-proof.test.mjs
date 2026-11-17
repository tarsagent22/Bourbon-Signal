import assert from 'node:assert/strict';
import test from 'node:test';
import fixture from './fixtures/roswell-store-proof.json' with {type:'json'};
import {BourbonBible} from '../src/core/bible.mjs';
import {ROSWELL_GROCERY_SOURCES} from '../src/collectors/new-mexico-grocery-premises.mjs';
import {groceryExpansionPremiseMatches,parseGroceryExpansionInventory} from '../src/collectors/grocery-xapi-expansion.mjs';
import {westernGroceryCohortKey} from '../src/western-grocery-production-config.mjs';
import manifest from '../data/state-integration/NM.json' with {type:'json'};
const bible = new BourbonBible(fixture.bible);
test('the active New Mexico manifest keeps its cohort digest',()=>{
  assert.equal(westernGroceryCohortKey('NM'),manifest.collector.cohortSha256);
});
for (const store of ROSWELL_GROCERY_SOURCES) test(store.name + ' requires its own address and in-store offer',()=>{
  const row=fixture[store.merchantId], other=ROSWELL_GROCERY_SOURCES.find(s=>s!==store);
  assert.ok(groceryExpansionPremiseMatches(store,row.store));
  assert.equal(groceryExpansionPremiseMatches(other,row.store),false);
  const parse = product => parseGroceryExpansionInventory({response:{docs:[product]}},store,bible,{observedAt:'2026-11-17T18:55:00Z',roswellShadow:true});
  const [signal]=parse(row.product);
  assert.equal(signal.storeAddress,store.address);
  assert.equal(signal.canonicalName,'Hard Truth Sweet Mash Bourbon');
  assert.equal(signal.price,49.99);
  assert.equal(signal.canAlertAsInventory,false);
  assert.equal(signal.quantityIsExact,false);
  assert.deepEqual(parse({...row.product,storeId:other.merchantId}),[]);
  assert.deepEqual(parse({...row.product,channelEligibility:{inStore:false}}),[]);
});
