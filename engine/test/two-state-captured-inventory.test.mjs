import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BourbonBible} from '../src/core/bible.mjs';
import {parseArizonaXapiInventory} from '../src/collectors/arizona-xapi.mjs';
import {parseGroceryExpansionInventory} from '../src/collectors/grocery-xapi-expansion.mjs';
import {CALIFORNIA_GROCERY_SOURCES} from '../src/collectors/california-grocery-premises.mjs';
import {canonicalizeSignal} from '../src/operational-report.mjs';
import {bibleLookup,buildDrops} from '../src/export-site-contract.mjs';
import {isPublicDropFeedEligible} from '../../src/lib/public-drop-evidence.ts';
const fixture=JSON.parse(await readFile(new URL('./fixtures/two-state-expansion-20261030/inventory.json',import.meta.url),'utf8'));
const bible=new BourbonBible(fixture.records);
const parse=(capture,products=capture.products)=>capture.state==='AZ'
  ?parseArizonaXapiInventory({response:{docs:products}},capture.store,bible,{observedAt:capture.observedAt,queryTerm:new URL(capture.url).searchParams.get('q')})
  :parseGroceryExpansionInventory({response:{docs:products}},CALIFORNIA_GROCERY_SOURCES.find(s=>s.id===capture.sourceId),bible,{observedAt:capture.observedAt});

test('original observations at four new Arizona stores and all four California banners survive the actual public exporter',t=>{
  t.mock.timers.enable({apis:['Date'],now:Math.max(...fixture.captures.map(c=>Date.parse(c.observedAt)))+1000});
  assert.equal(fixture.captures.filter(c=>c.state==='AZ').length,4);
  assert.equal(fixture.captures.filter(c=>c.state==='CA').length,4);
  const raw=fixture.captures.flatMap(c=>parse(c));
  const serialized=JSON.parse(JSON.stringify(raw.map(row=>canonicalizeSignal(row,bible))));
  const drops=buildDrops(serialized,bibleLookup(bible.records),serialized).filter(isPublicDropFeedEligible);
  for(const capture of fixture.captures){
    const sourceRows=parse(capture);assert.ok(sourceRows.length>0);
    const publicRows=drops.filter(row=>row.state===capture.state&&row.storeId===sourceRows[0].storeId);
    assert.ok(publicRows.length>0,sourceRows[0].storeId);
    assert.ok(publicRows.every(row=>row.observedAt===capture.observedAt&&row.price>0&&row.lat>31&&row.lng< -109));
  }
});

test('captured inventory never transfers between stores, accepts nonalcohol products or turns zero stock into availability',()=>{
  for(const capture of fixture.captures){
    assert.ok(parse(capture).length>0);
    for(const patch of [{storeId:'999999'},{containsAlcohol:false},{channelInventory:{instore:'0',instoreItemQty:10}},{channelInventory:{instore:'1',instoreItemQty:0}}])assert.deepEqual(parse(capture,capture.products.map(p=>({...p,...patch}))),[],`${capture.state} ${capture.sourceId||capture.store.locationId}: ${JSON.stringify(patch)}`);
  }
});
