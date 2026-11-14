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
 assert.deepEqual(
  Object.fromEntries(Map.groupBy(ADDITIONAL_CITYHIVE_EXPANSION_SOURCES, source => source.state).entries().map(([state,sources])=>[state,sources.length])),
  { CT: 2, DE: 2, HI: 1, KS: 3, LA: 4, MA: 2, MI: 10, NJ: 5 },
 );
 assert.equal(ADDITIONAL_CITYHIVE_EXPANSION_SOURCES.some(s=>/shipping/i.test(s.name)),false);
 assert.equal(ADDITIONAL_CITYHIVE_EXPANSION_SOURCES.some(s=>s.chainId==='bottle-king'),false);
 assert.ok(ADDITIONAL_CITYHIVE_EXPANSION_SOURCES.every(s=>s.discoveryUrl&&s.capturedAt));
});

test('CT first-party product pages preserve exact pickup variants and full-library tiers',async()=>{
 const observedAt='2026-11-14T06:49:51.238Z';
 const cases=[
  {id:'sunrise-liquor:68e7b4f7ddc9964680a31a6f',file:'sunrise',canonical:"Blanton's Original Single Barrel",tier:'allocated',price:109,merchantId:'68e7b4f7ddc9964680a31a6f',productId:'5521ceef6561310003530000',optionId:'f4c73889b4358e77a61aacbd627fe6cceeeb8172afa59476f234063af80c7307'},
  {id:'beverage-king:5ff8d3a20831fc26a1ac15d1',file:'beverage-king',canonical:'Wild Turkey Rare Breed Straight Bourbon',tier:'limited',price:49.98,merchantId:'5ff8d3a20831fc26a1ac15d1',productId:'56553d8e69702d2923120000',optionId:'b56a6adeb1ad500184602447d60e35e0600270238ba5ee3cc53632f7a2ff4a3c'},
 ];
 for(const item of cases){
  const source=ADDITIONAL_CITYHIVE_EXPANSION_SOURCES.find(s=>s.id===item.id);
  const html=await readFile(new URL(`./fixtures/ct-cityhive-product-pages/${item.file}-product-page.html`,import.meta.url),'utf8');
  const rows=parseCentralCityHiveInventory(html,source,bible,{observedAt});
  assert.equal(rows.length,1);
  const row=rows[0];
  assert.equal(row.canonicalName,item.canonical);assert.equal(row.tier,item.tier);assert.equal(row.price,item.price);
  assert.equal(row.merchantId,item.merchantId);assert.equal(row.productId,item.productId);assert.equal(row.optionId,item.optionId);
  assert.equal(row.state,'CT');assert.equal(row.quantity,0);assert.equal(row.quantityIsExact,false);
  assert.equal(row.availabilityStatus,'in_stock');assert.equal(row.sourceAvailabilityVerified,true);
  assert.equal(row.sourceProductBinding.pickupOfferVerified,true);assert.equal(row.sourceProductBinding.reportedQuantity,1);
  assert.equal(new URL(row.sourceUrl).hostname,source.hostname);
 }
});

test('Kansas and Delaware exact pickup receipts require the reviewed retailer, address and bottle', async () => {
 const cases = [
  { state: 'KS', fixture: 'rj-weller-millennium', merchantId: '6060f6496aaeeb555664ca4f', canonical: 'Weller Millennium', tier: 'allocated' },
  { state: 'DE', fixture: 'kreston-larceny-barrel-proof', merchantId: '618406f81a9efe0452444e07', canonical: 'Larceny Barrel Proof', tier: 'limited' },
 ];
 for (const entry of cases) {
  const source = ADDITIONAL_CITYHIVE_EXPANSION_SOURCES.find(store => store.merchantId === entry.merchantId);
  const fixture = JSON.parse(await readFile(new URL(`./fixtures/ks-de-cityhive/${entry.fixture}.json`, import.meta.url), 'utf8'));
  const observedAt = '2026-11-14T07:44:34Z';
  const rows = parseCentralCityHiveInventory(html(fixture), source, bible, { observedAt });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].canonicalName, entry.canonical);
  assert.equal(rows[0].tier, entry.tier);
  assert.equal(rows[0].state, entry.state);
  assert.equal(rows[0].storeId, source.storeId);
  assert.equal(rows[0].storeAddress, source.address);
  assert.equal(rows[0].sourceProductBinding.pickupOfferVerified, true);
  assert.equal(rows[0].quantityIsExact, false);
  assert.equal(getStateLifecycle(entry.state)?.publicStatus === 'active', false);
  fixture.products[0].merchants[0].offer_types = ['shipping'];
  assert.deepEqual(parseCentralCityHiveInventory(html(fixture), source, bible, { observedAt }), []);
 }
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
