import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';
import{BourbonBible}from'../src/core/bible.mjs';
import{NATIVE_PICKUP_PREPARATION_SOURCES,isCapturedNativePickupOnSiteShape}from'../src/native-shopify-preparation-policy.mjs';
import{collectPreparedNativePickupSource,replayPreparedNativePickup}from'../src/collectors/native-shopify-preparation.mjs';
import{buildShopifyCohortDescriptors}from'../src/collectors/shopify-cohort-runtime.mjs';
import{SHOPIFY_PICKUP_SOURCES}from'../src/sources/shopify-pickup-policy.mjs';
const bible=new BourbonBible(JSON.parse(await readFile(new URL('./fixtures/native-shopify-preparation/bible.json',import.meta.url),'utf8')).records);
const captures=source=>Promise.all(source.receipts.map(async receipt=>({...receipt,text:await readFile(new URL('./fixtures/'+source.base+receipt.artifactPath,import.meta.url),'utf8')})));
for(const source of NATIVE_PICKUP_PREPARATION_SOURCES)test(source.key+' exact captured native proof stays on-site-only and retains original clocks',async()=>{
  const data=await captures(source),nowMs=Date.parse(source.clock)+30000,result=await replayPreparedNativePickup(source.key,bible,data,{nowMs});
  assert.equal(result.sourceHttpRequests,0);assert.equal(result.formatReads,2);assert.equal(result.signals.length,1);assert.equal(result.currentCapturedSignals.length,1);
  const row=result.signals[0];assert.equal(row.quantity,0);assert.equal(row.quantityIsExact,false);assert.equal(Object.hasOwn(row,'previewOnly'),false);
  assert.equal(row.observedAt,source.clock);assert.equal(isCapturedNativePickupOnSiteShape(row,{nowMs}),true);
  assert.equal(row.price,source.key==='pogos-dallas'?63.98:109.99);
  for(const mutation of [{storeId:'neighbor'},{variantId:'wrong'},{price:1},{quantity:1},{canAlertAsInventory:true},{eligibleForDelivery:true},{stale:true}])
    assert.equal(isCapturedNativePickupOnSiteShape({...row,...mutation},{nowMs}),false,JSON.stringify(mutation));
  assert.equal(isCapturedNativePickupOnSiteShape({...row,price:1,sourceProductBinding:{...row.sourceProductBinding,price:1}},{nowMs}),false,'changed row and proof price still cannot rewrite the captured offer');
  assert.equal((await replayPreparedNativePickup(source.key,bible,data,{nowMs:Date.parse(source.clock)+3600001})).currentCapturedSignals.length,0,'expiry cannot be reset by replay');
  for(const mutate of [row=>row.text+=' ',row=>row.finalUrl='https://foreign.invalid',row=>row.observedAt=new Date().toISOString(),row=>row.status=403]){
    const changed=structuredClone(data);mutate(changed[0]);await assert.rejects(()=>replayPreparedNativePickup(source.key,bible,changed,{nowMs}),/Changed original/);
  }
});
test('TX active or hypothetical MI activation cannot enable either source or any held fallback',async()=>{
  let calls=0;const options={activeStates:['TX','MI'],enabledSourceIds:NATIVE_PICKUP_PREPARATION_SOURCES.map(row=>row.definition.runtimeId)};
  Object.defineProperty(options,'fetchText',{get(){calls++;throw Error('No transport may be inspected');}});
  for(const source of NATIVE_PICKUP_PREPARATION_SOURCES){assert.equal(source.enabled,false);assert.equal((await collectPreparedNativePickupSource(source.key,bible,options)).metadata.requestCount,0);}
  await assert.rejects(()=>collectPreparedNativePickupSource('thewinegardenco.com',bible,options),/Unknown closed/);
  assert.equal(calls,0);assert.deepEqual(buildShopifyCohortDescriptors(NATIVE_PICKUP_PREPARATION_SOURCES.map(row=>row.definition)),[]);assert.deepEqual(SHOPIFY_PICKUP_SOURCES,[]);
});
