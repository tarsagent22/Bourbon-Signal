import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BourbonBible } from '../src/core/bible.mjs';
import { CALIFORNIA_GROCERY_SOURCES } from '../src/collectors/california-grocery-premises.mjs';
import { parseGroceryExpansionInventory } from '../src/collectors/grocery-xapi-expansion.mjs';
import { isGroceryExpansionInventory } from '../src/grocery-xapi-policy.mjs';
import { isCaliforniaRetailerInventory } from '../src/california-retailer-policy.mjs';
import { canonicalizeSignal } from '../src/operational-report.mjs';
import { bibleLookup, buildDrops } from '../src/export-site-contract.mjs';
const fixture=JSON.parse(await readFile(new URL('./fixtures/california-grocery-expansion/identity.json',import.meta.url)));
const bible=new BourbonBible(fixture.records),source=CALIFORNIA_GROCERY_SOURCES.find(s=>s.merchantId==='2784');
const replay=()=>parseGroceryExpansionInventory({response:{docs:fixture.products}},source,bible,{observedAt:fixture.capturedAt});

test('California exact grocery proof survives the normal operational and public drop projections', t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.parse(fixture.capturedAt)+60000});
  const rows=replay();assert.equal(rows.length,5);assert.ok(rows.every(isGroceryExpansionInventory));
  assert.ok(rows.every(isCaliforniaRetailerInventory));
  const operational=rows.map(row=>canonicalizeSignal(row,bible));
  assert.ok(operational.every(row=>row.canAlertAsInventory));
  assert.ok(operational.every(isGroceryExpansionInventory));
  const drops=buildDrops(operational,bibleLookup(bible.records),operational);
  assert.equal(drops.length,5);assert.ok(drops.every(isCaliforniaRetailerInventory));
});

test('grocery admission rejects changed premise, location, product, channel, price and quantity proof',()=>{
  const row=replay()[0];
  for(const change of [{state:'WA'}, {stateCode:'WA'}, {merchantId:'wrong'}, {storeId:'wrong'}, {storeAddress:'Other'},
    {lat:row.lat+1}, {price:row.price+1}, {variantId:'wrong'}, {sourceUrl:'https://example.com/product'},
    {quantity:row.quantity+1}, {quantityIsExact:!row.quantityIsExact}, {stale:true},
    {sourceProductBinding:{...row.sourceProductBinding,premisesVerified:false}},
    {raw:{...row.raw,product:{...row.raw.product,storeId:'wrong'}}},
    {raw:{...row.raw,product:{...row.raw.product,alcoholVolumePct:12}}},
    {raw:{...row.raw,product:{...row.raw.product,dispItemPackageQty:4}}},
    {raw:{...row.raw,product:{...row.raw.product,channelEligibility:{inStore:false}}}},
  ])assert.equal(isGroceryExpansionInventory({...row,...change}),false,JSON.stringify(change));
});
