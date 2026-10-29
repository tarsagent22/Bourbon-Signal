import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BourbonBible} from '../src/core/bible.mjs';
import {MINNESOTA_CITYHIVE_EXPANSION_SOURCES,parseCentralCityHiveInventory} from '../src/collectors/central-cityhive-expansion.mjs';
import {collectMinnesotaCityHiveExpansion,isMinnesotaCityHiveInventory} from '../src/collectors/minnesota-cityhive-expansion.mjs';
import {getStateLifecycle} from '../src/state-lifecycle.mjs';

const bible=await BourbonBible.load(new URL('../out/bourbon-bible.json',import.meta.url));
const fixture=JSON.parse(await readFile(new URL('./fixtures/minnesota-cityhive-expansion/top-ten-andover.json',import.meta.url),'utf8'));
const source=MINNESOTA_CITYHIVE_EXPANSION_SOURCES[0];
const html=f=>`<script>JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(f))}"))</script>`;
const parse=f=>parseCentralCityHiveInventory(html(f),source,bible,{observedAt:fixture.capturedAt});

test('Andover first-party fixture admits McKenna10 without mutating authoritative Minnesota lifecycle',()=>{
  const lifecycleBefore=structuredClone(getStateLifecycle('MN'));
  assert.equal(MINNESOTA_CITYHIVE_EXPANSION_SOURCES.length,16);
  const rows=parse(fixture);assert.equal(rows.length,1);
  assert.equal(rows[0].canonicalName,'Henry McKenna 10 Year');assert.equal(rows[0].price,54.96);
  assert.ok(isMinnesotaCityHiveInventory(rows[0]));assert.equal(rows[0].quantity,0);assert.equal(rows[0].quantityIsExact,false);
  assert.ok(Number.isFinite(rows[0].lat)&&Number.isFinite(rows[0].lng));
  assert.deepEqual(getStateLifecycle('MN'),lifecycleBefore);
});

test('Minnesota does not borrow another branch stock or infer shipping availability',()=>{
  for(const mutate of [
    f=>f.merchant_configs[0].merchant.address.full_address='Other Address',
    f=>f.products[0].merchants[0].full_address=MINNESOTA_CITYHIVE_EXPANSION_SOURCES[1].address,
    f=>f.products[0].merchants[0].product_options[0].merchant_id=MINNESOTA_CITYHIVE_EXPANSION_SOURCES[1].merchantId,
    f=>f.products[0].merchants[0].offer_types=['shipping'],
    f=>f.products[0].merchants[0].product_options[0].quantity=0,
    f=>f.products[0].merchants[0].product_options[0].option_display_data.size.quantity='50',
    f=>f.merchant_configs[0].merchant.address.location.coordinates[0]=0,
    f=>{f.products[0].name='Barrell Bourbon 034 Batch';f.products[0].merchants[0].product_options[0].option_display_data.name='Barrell Bourbon 034 Batch';},
  ]){const f=structuredClone(fixture);mutate(f);assert.deepEqual(parse(f),[]);}
  const row=parse(fixture)[0];assert.equal(isMinnesotaCityHiveInventory({...row,storeId:MINNESOTA_CITYHIVE_EXPANSION_SOURCES[1].storeId}),false);
  assert.equal(isMinnesotaCityHiveInventory({...row,sourceProductBinding:{...row.sourceProductBinding,optionId:'wrong'}}),false);
});

test('Minnesota bounded runtime requests each store explicitly, preserves timestamps and stops after a host denial',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'mn-expansion-'));let calls=0;
  try{
    const options={cacheFile:path.join(dir,'cache.json'),cursorDir:path.join(dir,'cursor'),observedAt:fixture.capturedAt,nowMs:Date.parse(fixture.capturedAt),sleep:async()=>{},
      fetchText:async url=>{calls++;assert.ok(MINNESOTA_CITYHIVE_EXPANSION_SOURCES.some(s=>s.merchantId===new URL(url).searchParams.get('merchant-id')));return{ok:true,status:200,text:html(fixture)}}};
    const first=await collectMinnesotaCityHiveExpansion({id:'MN'},bible,options);
    assert.equal(calls,32);assert.equal(first.signals.length,1);
    const second=await collectMinnesotaCityHiveExpansion({id:'MN'},bible,{...options,nowMs:options.nowMs+60000});
    assert.equal(calls,32);assert.equal(second.signals[0].observedAt,fixture.capturedAt);
    await collectMinnesotaCityHiveExpansion({id:'MN'},bible,{...options,nowMs:options.nowMs+31*60000,fetchText:async()=>{calls++;return{ok:false,status:403,text:''}}});
    assert.equal(calls,33);
  }finally{await rm(dir,{recursive:true,force:true});}
});
