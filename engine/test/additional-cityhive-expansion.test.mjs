import test from'node:test';
import assert from'node:assert/strict';
import{readFile,mkdtemp,rm}from'node:fs/promises';
import{tmpdir}from'node:os';
import path from'node:path';
import{BourbonBible}from'../src/core/bible.mjs';
import{ADDITIONAL_CITYHIVE_EXPANSION_SOURCES,parseCentralCityHiveInventory}from'../src/collectors/central-cityhive-expansion.mjs';
import{collectAdditionalCityHiveExpansion,isAdditionalCityHiveInventory}from'../src/collectors/additional-cityhive-expansion.mjs';
import{getStateLifecycle}from'../src/state-lifecycle.mjs';
const bible=await BourbonBible.load(new URL('../out/bourbon-bible.json',import.meta.url));
const fixtures=Object.fromEntries(await Promise.all(['MA','LA','MI','NJ'].map(async s=>[s,JSON.parse(await readFile(new URL(`./fixtures/additional-cityhive-expansion/${s}.json`,import.meta.url),'utf8'))])));
const html=f=>`<script>JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(f))}"))</script>`;

for(const state of Object.keys(fixtures))test(`${state} exact current first-party pickup proof preserves state isolation and coordinates`,()=>{
 const f=fixtures[state],source=ADDITIONAL_CITYHIVE_EXPANSION_SOURCES.find(s=>s.merchantId===f.merchantId),before=structuredClone(getStateLifecycle(state));
 const rows=parseCentralCityHiveInventory(html(f),source,bible,{observedAt:f.capturedAt});assert.ok(rows.length>0);assert.ok(rows.every(isAdditionalCityHiveInventory));
 assert.ok(rows.every(r=>r.quantity===0&&r.quantityIsExact===false&&Number.isFinite(r.lat)&&Number.isFinite(r.lng)));
 const row=rows[0];for(const patch of [{state:'TX'},{storeAddress:'Other Address'},{merchantId:'wrong'},{optionId:'wrong'},{lat:0},{quantity:1},{sourceProductBinding:null}])assert.equal(isAdditionalCityHiveInventory({...row,...patch}),false);
 assert.deepEqual(getStateLifecycle(state),before);
 const wrong=structuredClone(f);wrong.merchant_configs.find(c=>c.merchant.id===f.merchantId).merchant.address.location.coordinates[0]=0;assert.deepEqual(parseCentralCityHiveInventory(html(wrong),source,bible,{observedAt:f.capturedAt}),[]);
});

test('additional cohorts exclude shipping premises and unproductive BottleKing candidates',()=>{
 assert.equal(ADDITIONAL_CITYHIVE_EXPANSION_SOURCES.length,21);
 assert.equal(ADDITIONAL_CITYHIVE_EXPANSION_SOURCES.some(s=>/shipping/i.test(s.name)),false);
 assert.equal(ADDITIONAL_CITYHIVE_EXPANSION_SOURCES.some(s=>s.chainId==='bottle-king'),false);
 assert.ok(ADDITIONAL_CITYHIVE_EXPANSION_SOURCES.every(s=>s.discoveryUrl&&s.capturedAt));
});

test('bounded additional-state collector carries original fresh timestamps and persists hostname denials',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'additional-state-'));let calls=0;const f=fixtures.MA;
 try{
  const options={cacheFile:path.join(dir,'cache.json'),cursorDir:path.join(dir,'cursor'),observedAt:f.capturedAt,nowMs:Date.parse(f.capturedAt),sleep:async()=>{},fetchText:async()=>{calls++;return{ok:true,status:200,text:html(f)}}};
  const first=await collectAdditionalCityHiveExpansion({id:'MA'},bible,options);assert.equal(calls,4);assert.ok(first.signals.length>0);
  const second=await collectAdditionalCityHiveExpansion({id:'MA'},bible,{...options,nowMs:options.nowMs+60000});assert.equal(calls,4);assert.ok(second.signals.every(r=>r.observedAt===f.capturedAt));
  await collectAdditionalCityHiveExpansion({id:'MA'},bible,{...options,nowMs:options.nowMs+31*60000,fetchText:async()=>{calls++;return{ok:false,status:403,text:''}}});assert.equal(calls,6);
 }finally{await rm(dir,{recursive:true,force:true});}
});
