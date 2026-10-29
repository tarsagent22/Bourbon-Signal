import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BourbonBible} from '../src/core/bible.mjs';
import {CALIFORNIA_GROCERY_SOURCES} from '../src/collectors/california-grocery-premises.mjs';
import {groceryExpansionPremiseMatches,parseGroceryExpansionInventory,collectGroceryExpansion} from '../src/collectors/grocery-xapi-expansion.mjs';
const fixture=JSON.parse(await readFile(new URL('./fixtures/california-grocery-expansion/identity.json',import.meta.url)));
const bible=new BourbonBible(fixture.records),source=CALIFORNIA_GROCERY_SOURCES.find(s=>s.merchantId==='2784');
const parse=products=>parseGroceryExpansionInventory({response:{docs:products}},source,bible,{observedAt:fixture.capturedAt});

test('California grocery cohort binds78 first-party premises and captured allocated bottle identities',()=>{
  assert.equal(CALIFORNIA_GROCERY_SOURCES.length,78);
  assert.equal(new Set(CALIFORNIA_GROCERY_SOURCES.map(s=>s.storeId)).size,78);
  assert.equal(new Set(CALIFORNIA_GROCERY_SOURCES.map(s=>s.city)).size,29);
  assert.ok(CALIFORNIA_GROCERY_SOURCES.every(s=>s.lat>32&&s.lat<43&&s.lng< -114&&s.lng> -125));
  assert.ok(groceryExpansionPremiseMatches(source,fixture.store));
  assert.deepEqual(parse(fixture.products).map(row=>row.canonicalName).sort(),['E.H. Taylor Jr. Barrel Proof Bourbon','Weller Full Proof','Eagle Rare 10 Year','Old Fitzgerald 7Y Bottled in Bond','Larceny Barrel Proof'].sort());
});

test('California cannot inherit another-state premises or conflicting product/stock metadata',()=>{
  const product=fixture.products.find(p=>/Weller Full Proof/.test(p.name));
  assert.equal(parse([product]).length,1);
  for(const mutation of [{storeId:'1600'},{upc:'bad'},{pid:'wrong'},{containsAlcohol:false},
    {alcoholVolumePct:40},{dispItemPackageQty:4},{channelEligibility:{inStore:false}},
    {channelInventory:{instore:'0',shipping:'1'}},{channelInventory:{instore:'1',instoreItemQty:0}},
    {name:product.name.replace('Full Proof','12 Year')}])assert.deepEqual(parse([{...product,...mutation}]),[]);
  assert.equal(groceryExpansionPremiseMatches(source,{...fixture.store,address:{...fixture.store.address,state:'WA'}}),false);
});

test('California uses four resolvers and separately bounded168request plan while WA remains127',async()=>{
  const cursorDir=await mkdtemp(path.join(tmpdir(),'ca-grocery-'));
  try{
    const result=await collectGroceryExpansion({id:'CA'},bible,{cursorDir,observedAt:fixture.capturedAt,sleep:async()=>{},fetchText:async url=>({ok:true,status:200,
      text:JSON.stringify(url.includes('storeresolver')?{instore:{stores:[fixture.store]}}:{response:{docs:fixture.products}})})});
    assert.equal(result.metadata.maxRequestCount,168);assert.equal(result.metadata.requests.length,7);
    assert.equal(result.metadata.requests.filter(r=>r.kind==='resolver').length,4);
    assert.deepEqual(result.metadata.verifiedPremises,['pavilions:2784']);assert.equal(result.signals.length,5);
    assert.equal(result.metadata.complete,false);
  }finally{await rm(cursorDir,{recursive:true,force:true});}
  await assert.rejects(()=>collectGroceryExpansion({id:'XX'},bible,{fetchText:async()=>{throw new Error('unexpectednetwork')}}),/reviewed state/);
});
