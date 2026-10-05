import assert from 'node:assert/strict';
import { collectionValueForMember } from '../src/lib/collection-value';
import { COLLECTION_PRICE_REFERENCES } from '../src/data/collection-price-references';
import { preferencesResponse } from '../apps/mobile/src/api/response-validation';
import { preferencesFixture } from '../apps/mobile/src/api/astra-fixtures';
import { getEntitlements } from '../src/lib/entitlements';
import { readFileSync } from 'node:fs';
const now = new Date('2026-10-05T12:00:00Z');
const item = { bottleId:'pappy-van-winkle-15', bottleName:'Pappy Van Winkle 15 Year', sealedQuantity:2, openedQuantity:1 };
for (const tier of ['free','standard','barrel','bottled-in-bond'] as const) {
  const value=collectionValueForMember(getEntitlements(tier).canUseRecommendations,[item],now);
  assert.equal(value!==null, ['barrel','bottled-in-bond'].includes(tier),tier);
}
const value=collectionValueForMember(true,[item,{...item,bottleId:'unknown',bottleName:'Unpriced bottle',sealedQuantity:1,openedQuantity:2},{...item,bottleId:'tasted',sealedQuantity:0,openedQuantity:0}],now)!;
assert.deepEqual(value.msrp,{total:719.97,pricedCount:3});
assert.deepEqual(value.secondary,{low:2620,high:2900,pricedCount:2});
assert.equal(value.ownedCount,6);assert.equal(value.sealedCount,3);assert.equal(value.openedCount,3);assert.equal(value.entries.length,2);
assert.equal(collectionValueForMember(true,[{...item,bottleName:'Pappy Van Winkle 15 Year 2008'}],now)!.msrp.total,null,'vintage name mismatch');
assert.equal(collectionValueForMember(true,[{...item,bottleName:'Pappy Van Winkle 15 Year 1.75L'}],now)!.secondary.low,null,'size mismatch');
assert.equal(collectionValueForMember(true,[{...item,pendingCanonicalMatch:true}],now)!.msrp.total,null,'pending identity');
assert.equal(collectionValueForMember(true,[item],new Date('2027-02-01'))!.secondary.low,null,'expired secondary snapshot');
assert.equal(collectionValueForMember(true,[item],new Date('2029-01-01'))!.msrp.total,null,'expired MSRP');
for(const date of ['2026-12-01','2026-02-30','not-a-date']) {
  const refs=[{...COLLECTION_PRICE_REFERENCES[0],secondary:{...COLLECTION_PRICE_REFERENCES[0].secondary!,date}}];
  assert.equal(collectionValueForMember(true,[item],now,refs)!.secondary.low,null,date);
}
for(const low of [NaN,-1,0,Infinity,99999]) {
  const refs=[{...COLLECTION_PRICE_REFERENCES[0],secondary:{...COLLECTION_PRICE_REFERENCES[0].secondary!,low}}];
  assert.equal(collectionValueForMember(true,[item],now,refs)!.secondary.low,null,String(low));
}
const empty=collectionValueForMember(true,[],now)!;assert.equal(empty.msrp.total,0);assert.equal(empty.secondary.low,0);
const opened=collectionValueForMember(true,[{...item,sealedQuantity:0}],now)!;assert.equal(opened.secondary.low,0);assert.equal(opened.secondary.pricedCount,0);
const missing=collectionValueForMember(true,[{...item,bottleId:'unknown'}],now)!;assert.equal(missing.msrp.total,null);assert.equal(missing.secondary.low,null);
assert.ok(preferencesResponse({...preferencesFixture(),collectionValue:value}));
assert.ok(!preferencesResponse({...preferencesFixture(),collectionValue:{...value,msrp:{total:-1,pricedCount:1}}}));
const seed=JSON.parse(readFileSync('apps/mobile/src/cellar/bottle-catalog-seed.json','utf8'));
for(const r of COLLECTION_PRICE_REFERENCES) assert.ok(seed.some((b:any)=>b.id===r.bottleId&&r.names.includes(b.name)),r.bottleId);
const route=readFileSync('src/app/api/user/preferences/route.ts','utf8');
assert.equal((route.match(/collectionValueForMember\(entitlements.canUseRecommendations, collectionPreferences.bottles\)/g)||[]).length,3,'GET, POST and gated QA return recomputed values');
assert.ok(!route.includes('payload.collectionValue'), 'client prices never supply authoritative totals');
console.log('Collection value: tier gates, exact identity, quantities, partial coverage, stale/future/invalid prices, wire validation and persisted response paths passed.');
