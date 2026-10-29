import test from 'node:test';
import assert from 'node:assert/strict';
import{readFile,mkdtemp,rm}from'node:fs/promises';
import path from'node:path';
import{tmpdir}from'node:os';
import{BourbonBible}from'../src/core/bible.mjs';
import{collectIllinois}from'../src/collectors/precision-probes.mjs';
import{canonicalizeSignal}from'../src/operational-report.mjs';
import{confidenceForSignal}from'../src/confidence-policy.mjs';
import{bibleLookup,buildDrops,buildCurrentInventoryAlertsFromDrops}from'../src/export-site-contract.mjs';
import{isMidwestCityHiveInventory}from'../src/collectors/midwest-cityhive-expansion.mjs';
const bible=await BourbonBible.load(new URL('../out/bourbon-bible.json',import.meta.url));
const fixture=JSON.parse(await readFile(new URL('./fixtures/midwest-cityhive-expansion/randalls-fairview-live.json',import.meta.url),'utf8'));
const body=`<script>JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(fixture))}"))</script>`;
async function collect(dir){return collectIllinois({id:'IL'},bible,{observedAt:fixture.capturedAt,cursorDir:path.join(dir,'cursor'),expansionCacheFile:path.join(dir,'cache.json'),sleep:async()=>{},query:async()=>({hits:[],nbPages:0,nbHits:0}),expansionFetchText:async()=>({ok:true,status:200,text:body})});}

test('normal Illinois collector publishes two exact-premise binary rows through customer projection',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse(fixture.capturedAt)+60000});
 const dir=await mkdtemp(path.join(tmpdir(),'il-customer-'));
 try{
  const collected=await collect(dir);const source=collected.signals.filter(isMidwestCityHiveInventory);
  assert.equal(source.length,2);assert.deepEqual(source.map(r=>r.canonicalName).sort(),['Elijah Craig Barrel Proof','Elijah Craig Barrel Proof Rye']);
  const operational=source.map(r=>canonicalizeSignal(r,bible));
  const drops=buildDrops(operational,bibleLookup(bible.records),operational);const alerts=buildCurrentInventoryAlertsFromDrops(drops);
  assert.equal(alerts.length,2);assert.equal(new Set(alerts.map(r=>r.storeId)).size,1);
  for(const row of alerts){assert.equal(row.quantity,0);assert.equal(row.quantityIsExact,false);assert.ok(Number.isFinite(row.lat)&&Number.isFinite(row.lng));assert.equal(row.eligibleForEmail,false);assert.equal(row.eligibleForSms,false);assert.equal(row.sendRecommendation,'display_on_site_until_change_detected');}
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('Illinois confidence and public-current policies reject forged or absent source proof',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'il-proof-'));
 try{
  const row=(await collect(dir)).signals.find(isMidwestCityHiveInventory);assert.ok(row);
  for(const change of [{storeAddress:'Other Store'},{merchantId:'wrong'},{sourceProductBinding:null},{quantity:10},{sourceAvailabilityVerified:false},{lat:0}]){
   const mutated={...row,...change};assert.equal(confidenceForSignal(mutated).canAlertAsInventory,false);
   assert.equal(buildCurrentInventoryAlertsFromDrops([{...mutated,canAlertAsInventory:true,type:mutated.eventType,tier:'allocated'}]).length,0);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
