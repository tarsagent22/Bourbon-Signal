import assert from 'node:assert/strict';
import baseline from '../data/california-grocery-baseline-20261030.json' with {type:'json'};
import {CALIFORNIA_GROCERY_SOURCES} from './collectors/california-grocery-premises.mjs';
import {GROCERY_EXPANSION_REQUEST_LIMITS} from './collectors/grocery-xapi-expansion.mjs';
import {isCaliforniaRetailerInventory} from './california-retailer-policy.mjs';
import {isPublicDropFeedEligible} from '../../src/lib/public-drop-evidence.ts';

export function verifyCaliforniaExpansion({state,drops,now=Date.now()}){
  assert.equal(state.state,'CA');
  assert.equal(state.stale,false,'California expansion must be fresh');
  assert.equal(state.status,'useful','California expansion requires a live successful run');
  const metadata=state.precisionMetadata?.grocery;
  assert.equal(metadata?.complete,true,'Every reviewed California premise must complete current resolver and inventory verification');
  const expected=new Set(CALIFORNIA_GROCERY_SOURCES.map(source=>source.storeId));
  assert.equal(metadata.selectedStores.length,expected.size);
  assert.deepEqual(new Set(metadata.selectedStores),expected);
  assert.deepEqual(new Set(metadata.verifiedPremises),expected);
  assert.ok(baseline.storeIds.every(id=>expected.has(id)),'Protect all released California grocery premises');
  assert.ok(metadata.requests.length<=GROCERY_EXPANSION_REQUEST_LIMITS.CA);
  const inventoryRequests=metadata.requests.filter(r=>r.kind==='inventory');
  for(const source of CALIFORNIA_GROCERY_SOURCES)for(const term of ['bourbon','whiskey']){
    assert.equal(inventoryRequests.filter(r=>r.sourceId===source.id&&r.merchantId===source.merchantId&&r.term===term&&r.status===200&&r.ok===true).length,1,`Missing successful ${term} search at ${source.storeId}`);
  }
  const rows=(Array.isArray(drops)?drops:drops.drops||[]).filter(row=>row.state==='CA'&&row.sourceProductBinding?.source==='grocery-xapi'&&isPublicDropFeedEligible(row));
  assert.ok(rows.every(row=>isCaliforniaRetailerInventory(row)&&expected.has(row.storeId)&&!row.stale&&!row.sourceStale&&now-Date.parse(row.observedAt)>=0&&now-Date.parse(row.observedAt)<=2*60*60_000),'California public inventory requires current original store/product proof');
  const stores=new Set(rows.map(row=>row.storeId)),prior=new Set(baseline.storeIds);
  const added=[...stores].filter(id=>!prior.has(id));
  assert.ok(stores.size>=330,`California expansion requires 330 public stores; received ${stores.size}`);
  assert.ok(added.length>=250,`California expansion requires 250 new public inventory premises; received ${added.length}`);
  assert.ok(rows.length>=1000,`California expansion requires 1000 public listings; received ${rows.length}`);
  return{state:'CA',selectedStores:expected.size,publicStores:stores.size,newInventoryStores:added.length,publicRows:rows.length,requests:metadata.requests.length};
}
