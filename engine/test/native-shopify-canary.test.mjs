import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {BourbonBible} from '../src/core/bible.mjs';
import {NATIVE_PICKUP_PREPARATION_SOURCES} from '../src/native-shopify-preparation-policy.mjs';
import {prepareNativeShopifyCanary,buildNativeShopifyCanaryPayload} from '../src/prepare-native-shopify-canary.mjs';
import {collectNativeShopifyOnSite} from '../src/collectors/native-shopify-onsite.mjs';

const records=JSON.parse(await readFile(new URL('./fixtures/native-shopify-preparation/bible.json',import.meta.url),'utf8')).records;
for(const source of NATIVE_PICKUP_PREPARATION_SOURCES)test(source.key+' raw canary preserves clocks, silent permissions and unrelated sources',async()=>{
 const captures=await Promise.all(source.receipts.map(async receipt=>({...receipt,text:await readFile(new URL('./fixtures/'+source.base+receipt.artifactPath,import.meta.url),'utf8')})));
 const nowMs=Math.max(...captures.map(row=>Date.parse(row.observedAt)))+30_000;
 mock.timers.enable({apis:['Date'],now:nowMs});
 try{
  const options={sourceId:source.definition.runtimeId,captures,bible:new BourbonBible(records),nowMs};
  const candidate=await prepareNativeShopifyCanary(options);
  const oldest=new Date(Math.min(...captures.map(row=>Date.parse(row.observedAt)))).toISOString();
  assert.equal(candidate.drops.length,1);assert.equal(candidate.drops[0].observedAt,oldest);
  assert.deepEqual(candidate.sourceReceipts,captures.map(({text,file,artifactPath,...receipt})=>receipt));
  assert.equal(candidate.drops[0].quantity,0);assert.equal(candidate.drops[0].quantityIsExact,false);
  for(const flag of ['canAlertAsInventory','canAlertAsWatch','eligibleForDelivery','eligibleForEmail','eligibleForSms'])assert.equal(candidate.drops[0][flag],false);
  const other={state:'TX',sourceRuntimeId:'tx:hotspot-austin',storeId:'hotspot-existing',observedAt:'original-unchanged'};
  const baseLocation={state:'TX',id:'hotspot-existing',address:'original-unchanged'};
  const preview=buildNativeShopifyCanaryPayload({candidate,baseDrops:[other],baseLocations:[baseLocation],nowMs});
  assert.deepEqual(preview.drops[0],other);assert.deepEqual(preview.locations[0],baseLocation);
  assert.equal(preview.previewPolicy.productionSnapshotPublicationEnabled,false);
  assert.equal(preview.lifecycleChanged,false);assert.equal(preview.stateHealthChanged,false);
  const again=buildNativeShopifyCanaryPayload({candidate,baseDrops:preview.drops,baseLocations:preview.locations,nowMs});
  assert.deepEqual(again,preview,'same native leaf is replaced once without duplicating or removing siblings');
  for(const captures of [options.captures.slice(1),[options.captures[0],options.captures[0]],options.captures.map((r,i)=>i?r:{...r,status:403}),options.captures.map((r,i)=>i?r:{...r,finalUrl:r.url+'?redirected'}),options.captures.map((r,i)=>i?r:{...r,text:r.text+' '}),options.captures.map((r,i)=>i?r:{...r,observedAt:new Date(nowMs-3600001).toISOString()}),options.captures.map((r,i)=>i?r:{...r,observedAt:new Date(nowMs+1).toISOString()})]){
   await assert.rejects(()=>prepareNativeShopifyCanary({...options,captures}));
  }
  const altered=structuredClone(captures),product=JSON.parse(altered[0].text);product.product.variants[0].id='foreign-variant';altered[0].text=JSON.stringify(product);altered[0].bytes=Buffer.byteLength(altered[0].text);altered[0].sha256=createHash('sha256').update(altered[0].text).digest('hex');
  await assert.rejects(()=>prepareNativeShopifyCanary({...options,captures:altered}),/did not qualify|incomplete|product|variant/i,'rehashing a changed variant cannot establish identity');
  await assert.rejects(()=>prepareNativeShopifyCanary({...options,bible:new BourbonBible(records.map(row=>({...row,libraryAlertEligible:false})))}),/did not qualify/);
  for(const mutation of [{storeId:'neighbor'},{variantId:'wrong'},{quantity:1},{eligibleForDelivery:true},{sourceStale:true},{quarantined:true},{previewOnly:true},{sourcePollId:'invented',sourceProductBinding:null}])assert.throws(()=>buildNativeShopifyCanaryPayload({candidate:{...candidate,drops:[{...candidate.drops[0],...mutation}]},nowMs}));
  await assert.rejects(()=>prepareNativeShopifyCanary({...options,nowMs:nowMs+3600001}),/stale/);
  let touched=0;const inactive={};for(const field of ['fetchText','cacheDir','incidentDir'])Object.defineProperty(inactive,field,{get(){touched++;throw Error('Inactive authority inspected '+field);}});
  assert.equal((await collectNativeShopifyOnSite(source.definition.runtimeId,options.bible,inactive)).metadata.requestCount,0);assert.equal(touched,0);
 }finally{mock.timers.reset();}
});
