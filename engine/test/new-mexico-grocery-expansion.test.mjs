import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BourbonBible} from '../src/core/bible.mjs';
import {NEW_MEXICO_GROCERY_SOURCES} from '../src/collectors/new-mexico-grocery-premises.mjs';
import {groceryExpansionPremiseMatches,parseGroceryExpansionInventory,collectGroceryExpansion} from '../src/collectors/grocery-xapi-expansion.mjs';
const fixture=JSON.parse(await readFile(new URL('./fixtures/new-mexico-grocery-expansion/identity.json',import.meta.url)));
const bible=new BourbonBible(fixture.records),source=NEW_MEXICO_GROCERY_SOURCES.find(s=>s.merchantId==='1915');
const parse=products=>parseGroceryExpansionInventory({response:{docs:products}},source,bible,{observedAt:fixture.capturedAt});

test('New Mexico16premises use the literal first-party AlbertsonsMarket tuple with unknown exact quantity',()=>{
  assert.equal(NEW_MEXICO_GROCERY_SOURCES.length,16);
  assert.equal(new Set(NEW_MEXICO_GROCERY_SOURCES.map(s=>s.city)).size,5);
  assert.ok(NEW_MEXICO_GROCERY_SOURCES.every(s=>s.banner==='shopalbertsonsmarket'&&s.resolverDomainName==='Albertsons Market'&&s.host==='www.shopalbertsonsmarket.com'));
  assert.ok(NEW_MEXICO_GROCERY_SOURCES.every(s=>s.lat>30&&s.lat<38&&s.lng> -110&&s.lng< -102));
  assert.ok(NEW_MEXICO_GROCERY_SOURCES.every(s=>s.releaseStage==='research_only_requires_state_promotion'));
  assert.deepEqual(parse(fixture.products).map(r=>r.canonicalName),['1792 Full Proof','Elijah Craig Barrel Proof']);
  for(const row of parse(fixture.products)){
    assert.equal(row.quantity,0);assert.equal(row.quantityIsExact,false);
    assert.equal(row.sourceProductBinding.inventorySemantics,'binary_retailer_orderable_no_exact_count');
  }
});

test('New Mexico cannot substitute a same-name retailer, LasCrucesbanner or adjacent-state premise',()=>{
  assert.ok(groceryExpansionPremiseMatches(source,fixture.store));
  for(const mutation of [{polarisBannerName:'albertsons'},{domainName:'Albertsons'},
    {address:{...fixture.store.address,state:'TX'}},{locationId:'1919'}])assert.equal(groceryExpansionPremiseMatches(source,{...fixture.store,...mutation}),false);
  const product=fixture.products[0];
  for(const mutation of [{storeId:'1919'},{upc:'bad'},{containsAlcohol:false},{dispItemPackageQty:2},
    {channelInventory:{instore:'0',shipping:'1'}},{price:0}])assert.deepEqual(parse([{...product,...mutation}]),[]);
});

test('New Mexico research preflight remains bounded43requests and does not claim a complete cohort from one premise',async()=>{
  const cursorDir=await mkdtemp(path.join(tmpdir(),'nm-grocery-'));
  try{
    const result=await collectGroceryExpansion({id:'NM'},bible,{cursorDir,observedAt:fixture.capturedAt,sleep:async()=>{},fetchText:async url=>({ok:true,status:200,
      text:JSON.stringify(url.includes('storeresolver')?{instore:{stores:[fixture.store]}}:{response:{docs:fixture.products}})})});
    assert.equal(result.metadata.maxRequestCount,43);assert.equal(result.metadata.requests.length,6);
    assert.equal(result.metadata.complete,false);assert.equal(result.signals.length,2);
    assert.ok(result.metadata.requests.filter(r=>r.kind==='inventory').every(r=>new URL(r.url).hostname==='www.shopalbertsonsmarket.com'));
  }finally{await rm(cursorDir,{recursive:true,force:true});}
});
