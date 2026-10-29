import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BourbonBible } from '../src/core/bible.mjs';
import { WESTERN_GROCERY_EXPANSION_SOURCES } from '../src/collectors/western-grocery-premises.mjs';
import { groceryExpansionPremiseMatches,parseGroceryExpansionInventory,collectGroceryExpansion } from '../src/collectors/grocery-xapi-expansion.mjs';
const fixture=JSON.parse(await readFile(new URL('./fixtures/washington-xapi-expansion/identity.json',import.meta.url)));
const bible=new BourbonBible(fixture.records);
const source=WESTERN_GROCERY_EXPANSION_SOURCES.find(s=>s.merchantId==='1600');
const parse=products=>parseGroceryExpansionInventory({response:{docs:products}},source,bible,{observedAt:fixture.capturedAt});

test('Washington captured current allocated expressions retain exact premises, metadata and first-party coordinates',()=>{
  assert.equal(WESTERN_GROCERY_EXPANSION_SOURCES.filter(s=>s.stateCode==='WA').length,58);
  assert.ok(WESTERN_GROCERY_EXPANSION_SOURCES.filter(s=>s.stateCode==='WA').every(s=>s.lat>45&&s.lat<50&&s.lng< -116&&s.lng> -125));
  const rows=parse(fixture.products);
  assert.deepEqual(rows.map(r=>r.canonicalName).sort(),['E.H. Taylor Jr. Barrel Proof Bourbon','E.H. Taylor Small Batch','Eagle Rare 10 Year','Elijah Craig Barrel Proof','Heaven Hill Bottled-in-Bond 7 Year'].sort());
  for(const row of rows){
    assert.equal(row.state,'WA');assert.equal(row.storeId,'safeway:1600');assert.equal(row.merchantId,'1600');
    assert.ok(row.price>0);assert.equal(row.lat,source.lat);assert.equal(row.raw.product.storeId,row.merchantId);
    assert.equal(row.sourceProductBinding.rawName,row.rawName);
  }
  assert.ok(groceryExpansionPremiseMatches(source,fixture.store));
  assert.equal(groceryExpansionPremiseMatches(source,{...fixture.store,address:{...fixture.store.address,state:'ID'}}),false);
  assert.equal(groceryExpansionPremiseMatches(source,{...fixture.store,address:{...fixture.store.address,line1:'999 Other St'}}),false);
  assert.equal(groceryExpansionPremiseMatches(source,{...fixture.store,locationId:'1551'}),false);
});

test('Washington parser rejects title/strength/store/format/availability changes and disabled catalog identities',()=>{
  const product=fixture.products.find(p=>p.name.startsWith('E.H. Taylor Small Batch'));
  for(const mutation of [{storeId:'1551'},{alcoholVolumePct:40},{upc:'bad'},{dispItemPackageQty:2},
    {channelInventory:{instore:'0',shipping:'1'}},{price:0},{name:product.name.replace('Small Batch','Single Barrel')}]){
    assert.deepEqual(parse([{...product,...mutation}]),[],JSON.stringify(mutation));
  }
  const records=structuredClone(fixture.records);for(const record of records)for(const bottle of record.libraryIdentities || [])bottle.isAlertEligible=false;
  assert.deepEqual(parseGroceryExpansionInventory({response:{docs:fixture.products}},source,new BourbonBible(records),{observedAt:fixture.capturedAt}),[]);
  assert.deepEqual(parseGroceryExpansionInventory({response:{docs:fixture.products}},{...source},bible,{observedAt:fixture.capturedAt}),[]);
});

test('runtime re-resolves exact store before stock, bounds discovery and deduplicates products',async()=>{
  const cursorDir=await mkdtemp(path.join(tmpdir(),'western-grocery-'));
  try{
    const result=await collectGroceryExpansion({id:'WA'},bible,{cursorDir,observedAt:fixture.capturedAt,sleep:async()=>{},fetchText:async url=>
      ({ok:true,status:200,text:JSON.stringify(url.includes('storeresolver')?{instore:{stores:[fixture.store]}}:{response:{docs:fixture.products}})})});
    assert.equal(result.signals.length,5);assert.equal(result.metadata.verifiedPremises.length,1);
    assert.equal(result.metadata.complete,false);assert.equal(result.metadata.requests.length,6);
    assert.equal(result.metadata.maxRequestCount,127);
    assert.ok(result.metadata.requests.filter(r=>r.kind==='inventory').every(r=>new URL(r.url).searchParams.get('storeid')==='1600'));
  }finally{await rm(cursorDir,{recursive:true,force:true});}
});

test('persisted host denial stops both resolver and inventory requests without retries',async()=>{
  let calls=0;const options={sleep:async()=>{},observedAt:fixture.capturedAt,nowMs:Date.parse(fixture.capturedAt),fetchText:async()=>{calls++;return{ok:false,status:403,text:''}}};
  const first=await collectGroceryExpansion({id:'WA'},bible,options);
  assert.equal(calls,1);assert.equal(first.signals.length,0);
  const second=await collectGroceryExpansion({id:'WA'},bible,{...options,attempts:first.metadata.sourceAttempts});
  assert.equal(calls,1);assert.equal(second.metadata.requests.length,0);
});


test('denial persistence completes before later work and survives downstream source failure',async()=>{
  let calls=0,persisted;
  await assert.rejects(()=>collectGroceryExpansion({id:'WA'},bible,{sleep:async()=>{},observedAt:fixture.capturedAt,
    fetchText:async()=>{calls++;return{ok:false,status:403,text:''}},
    persistAttempts:async attempts=>{persisted=attempts;throw new Error('downstreamfailure');}}),/downstreamfailure/);
  assert.equal(calls,1);assert.equal(persisted['host:www.safeway.com'].httpStatus,403);
});
