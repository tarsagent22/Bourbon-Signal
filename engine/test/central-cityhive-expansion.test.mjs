import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BourbonBible } from '../src/core/bible.mjs';
import {CENTRAL_CITYHIVE_EXPANSION_SOURCES,parseCentralCityHiveInventory,collectCentralCityHiveExpansion} from '../src/collectors/central-cityhive-expansion.mjs';

const bible=await BourbonBible.load(new URL('../out/bourbon-bible.json',import.meta.url));
const fixtures=await Promise.all(CENTRAL_CITYHIVE_EXPANSION_SOURCES.map(s=>readFile(new URL(`./fixtures/central-cityhive/${s.id}.json`,import.meta.url),'utf8').then(JSON.parse)));
const at=fixtures[0].captures[0].capturedAt;
const html=payload=>`<script>JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(payload))}"))</script>`;
const parse=(index,payload=fixtures[index])=>parseCentralCityHiveInventory(html(payload),CENTRAL_CITYHIVE_EXPANSION_SOURCES[index],bible,{observedAt:at});

test('captured Wisconsin and Oklahoma offers bind current exact premises and scarce expressions',()=>{
  const wi=parse(0),yucatan=parse(1),byrons=parse(2);
  assert.deepEqual(wi.map(r=>r.canonicalName),["Michter's 10 Year Rye"]);
  assert.equal(wi[0].price,249.99);
  assert.ok(yucatan.some(r=>r.canonicalName==='Eagle Rare 10 Year'&&r.price===79.99));
  assert.ok(yucatan.some(r=>r.canonicalName==='1792 Full Proof'));
  assert.ok(byrons.some(r=>r.canonicalName==='Elijah Craig Barrel Proof'&&r.price===66.95));
  for(const row of [...wi,...yucatan,...byrons]){
    assert.equal(row.quantity,0);assert.equal(row.quantityIsExact,false);
    assert.equal(row.sourceProductBinding.storeAddress,row.storeAddress);
    assert.equal(row.sourceProductBinding.optionId,row.optionId);
  }
});

test('Wisconsin reviewed identity rejects changed age, expression, brand, size and source identity',()=>{
  for(const mutate of [
    f=>f.merchant_configs[0].merchant.address.full_address='100 Other St, Wauwatosa, WI 53226',
    f=>f.products[0].merchants[0].full_address='100 Other St, Wauwatosa, WI 53226',
    f=>f.products[0].merchants[0].product_options[0].merchant_id='6060f5bded7ffb6a9c4c64b8',
    f=>f.products[0].merchants[0].offer_types=['shipping'],
    f=>f.products[0].merchants[0].product_options[0].quantity=0,
    f=>f.products[0].merchants[0].product_options[0].price=NaN,
    f=>f.products[0].merchants[0].product_options[0].option_display_data.properties.age='20',
    f=>f.products[0].merchants[0].product_options[0].option_display_data.properties.brands=['Different'],
    f=>f.products[0].merchants[0].product_options[0].option_display_data.size.quantity='50',
    f=>f.products[0].merchants[0].product_options[0].product_url='https://example.com/shop/product/test/1?option-id=2',
    f=>f.products[0].merchants[0].product_options[0].product_id='not-the-reviewed-product',
  ]){const f=structuredClone(fixtures[0]);mutate(f);assert.deepEqual(parse(0,f),[]);}
  assert.deepEqual(parseCentralCityHiveInventory(html(fixtures[0]),{...CENTRAL_CITYHIVE_EXPANSION_SOURCES[0]},bible,{observedAt:at}),[]);
});

test('reviewed identity stays bound to the accepted option when variant IDs are reused',()=>{
  const f=structuredClone(fixtures[0]);
  const poison=f.products[0];
  const unrelated=structuredClone(poison);
  const id='6594472cd20b667b856eb420';
  unrelated.id=id;unrelated.name='Unidentified Whiskey 750ml';
  const option=unrelated.merchants[0].product_options[0];
  option.product_id=id;
  option.product_url=option.product_url.replace(poison.id,id);
  option.option_display_data.name=unrelated.name;
  poison.merchants[0].product_options[0].merchant_id='6060f5bded7ffb6a9c4c64b8';
  f.products=[poison,unrelated];
  assert.deepEqual(parse(0,f),[]);
  const mixed=structuredClone(fixtures[0]);
  const wrongAge=structuredClone(mixed.products[0]);
  mixed.products[0].merchants[0].product_options[0].quantity=0;
  wrongAge.merchants[0].product_options[0].option_display_data.properties.age='20';
  mixed.products.push(wrongAge);
  assert.deepEqual(parse(0,mixed),[]);
});

test('collector rotates library discovery with a five-request per-store ceiling and deduplicates replay',async()=>{
  const cursorDir=await mkdtemp(path.join(tmpdir(),'central-discovery-'));
  try{
    const requests=[];
    const result=await collectCentralCityHiveExpansion({id:'WI'},bible,{cursorDir,observedAt:at,nowMs:Date.parse(at),sleep:async()=>{},
      fetchText:async url=>{requests.push(url);return {ok:true,status:200,text:html(fixtures[0])};}});
    assert.equal(requests.length,5);assert.ok(requests.some(url=>url.includes('ch-query=michter')));
    assert.equal(result.signals.length,1);assert.equal(result.metadata.sourceAttempts['liquorguys-wauwatosa'].status,'success');
  }finally{await rm(cursorDir,{recursive:true,force:true});}
});

test('denial ends a source pass and retained cooldown prevents unchanged requests',async()=>{
  const cursorDir=await mkdtemp(path.join(tmpdir(),'central-denial-'));let calls=0;
  try{
    const options={cursorDir,observedAt:at,nowMs:Date.parse(at),sleep:async()=>{},fetchText:async()=>{calls++;return {ok:false,status:403,text:''}}};
    const result=await collectCentralCityHiveExpansion({id:'OK'},bible,options);
    assert.equal(calls,2);assert.equal(result.signals.length,0);
    const again=await collectCentralCityHiveExpansion({id:'OK'},bible,{...options,attempts:result.metadata.sourceAttempts});
    assert.equal(calls,2);assert.equal(again.metadata.requests.length,0);
  }finally{await rm(cursorDir,{recursive:true,force:true});}
});
