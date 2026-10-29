import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BourbonBible} from '../src/core/bible.mjs';
import {MIDWEST_CITYHIVE_EXPANSION_SOURCES,parseCentralCityHiveInventory} from '../src/collectors/central-cityhive-expansion.mjs';
import {collectMidwestCityHiveExpansion,isMidwestCityHiveInventory} from '../src/collectors/midwest-cityhive-expansion.mjs';

const bible=await BourbonBible.load(new URL('../out/bourbon-bible.json',import.meta.url));
const fixtures=Object.fromEntries(await Promise.all(['barrel-blends','randalls','brown-derby'].map(async id=>[id,JSON.parse(await readFile(new URL(`./fixtures/midwest-cityhive-expansion/${id}.json`,import.meta.url),'utf8'))])));
const html=f=>`<script>JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(f))}"))</script>`;
const at=fixtures['barrel-blends'].capturedAt;

test('reviewed Missouri/Illinois exact premises never borrow another state or branch availability',()=>{
  assert.equal(MIDWEST_CITYHIVE_EXPANSION_SOURCES.filter(s=>s.state==='MO').length,10);
  assert.equal(MIDWEST_CITYHIVE_EXPANSION_SOURCES.filter(s=>s.state==='IL').length,1);
  const s=MIDWEST_CITYHIVE_EXPANSION_SOURCES[0],f=fixtures[s.chainId];
  const rows=parseCentralCityHiveInventory(html(f),s,bible,{observedAt:at});
  assert.equal(rows.length,2);assert.ok(rows.every(isMidwestCityHiveInventory));
  assert.ok(rows.every(r=>Number.isFinite(r.lat)&&Number.isFinite(r.lng)));
  assert.ok(rows.some(r=>r.canonicalName==='Elijah Craig Barrel Proof'&&r.price===59.99));
  const il=MIDWEST_CITYHIVE_EXPANSION_SOURCES.find(s=>s.state==='IL');
  assert.deepEqual(parseCentralCityHiveInventory(html(fixtures.randalls),il,bible,{observedAt:at}),[]);
  const changed=structuredClone(f);changed.products[0].merchants[0].offer_types=['shipping'];
  assert.equal(parseCentralCityHiveInventory(html(changed),s,bible,{observedAt:at}).some(r=>r.productId===f.products[0].id),false);
  for(const patch of [{state:'IL'},{storeId:il.storeId},{optionId:'wrong'},{quantity:6},{storeAddress:'Other address'}])
    assert.equal(isMidwestCityHiveInventory({...rows[0],...patch}),false);
});

test('Missouri collector is bounded per store and retains original source timestamps on not-due passes',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'mo-cityhive-'));let calls=0;
  try{
    const options={cacheFile:path.join(dir,'cache.json'),cursorDir:path.join(dir,'cursor'),observedAt:at,nowMs:Date.parse(at),sleep:async()=>{},fetchText:async url=>{calls++;const s=MIDWEST_CITYHIVE_EXPANSION_SOURCES.find(s=>s.merchantId===new URL(url).searchParams.get('merchant-id'));assert.equal(s.state,'MO');return{ok:true,status:200,text:html(fixtures[s.chainId])}}};
    const first=await collectMidwestCityHiveExpansion({id:'MO'},bible,options);assert.equal(calls,20);
    assert.equal(new Set(first.signals.map(r=>r.storeId)).size,2);
    const second=await collectMidwestCityHiveExpansion({id:'MO'},bible,{...options,nowMs:options.nowMs+60000});
    assert.equal(calls,20);assert.ok(second.signals.every(r=>r.observedAt===at));
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('Illinois retailer evidence is isolated and one host denial ends its whole source pass',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'il-cityhive-'));let calls=0;
  try{
    const options={cacheFile:path.join(dir,'cache.json'),cursorDir:path.join(dir,'cursor'),observedAt:at,nowMs:Date.parse(at),sleep:async()=>{},fetchText:async url=>{calls++;assert.equal(new URL(url).hostname,'shoprandalls.com');return{ok:false,status:403,text:''}}};
    const result=await collectMidwestCityHiveExpansion({id:'IL'},bible,options);
    assert.equal(calls,1);assert.equal(result.signals.length,0);
    await collectMidwestCityHiveExpansion({id:'IL'},bible,options);assert.equal(calls,1);
  }finally{await rm(dir,{recursive:true,force:true});}
});
