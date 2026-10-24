import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import {transform} from 'esbuild';
import * as crypto from 'node:crypto';
type Row=Record<string,any>;
const text=await readFile(new URL('../src/lib/nationwide-pilot-receipt.ts',import.meta.url),'utf8');
const compiled=(await transform(text,{loader:'ts',format:'cjs',target:'node24'})).code;
const now=Date.parse('2026-10-24T23:00:00.000Z'),key='fixture-only-receipt-key-1234567890123456789';
const source=(extra:Row={})=>({id:'ca:fixture-shopify',state:'CA',kind:'shopify-variant-pickup',disabled:false,expiryHours:1,collectorVersion:'shopify-variant-pickup-v2-strict-premises',
  definition:{state:'CA',stores:[{id:'fixture:one'},{id:'fixture:two'}],products:[{productId:'100',variantId:'200'}]},
  partitionBindings:[{storeId:'fixture:one',productId:'100',variantId:'200'},{storeId:'fixture:two',productId:'100',variantId:'200'}],
  admission:{sourceId:'ca:fixture-shopify',bindings:[{storeId:'fixture:one',productId:'100',variantId:'200',canonicalBottleId:'bb_fixture'},{storeId:'fixture:two',productId:'100',variantId:'200',canonicalBottleId:'bb_fixture'}]},...extra});
function load(sources:Row[]=[]){const module={exports:{}};new Function('require','module','exports',compiled)((id:string)=>{if(id==='node:crypto')return crypto;if(id.endsWith('/shopify-pickup-policy.mjs'))return {SHOPIFY_PICKUP_SOURCES:sources};throw Error('Unexpected dependency '+id);},module,module.exports);return module.exports as Row;}
const url=(id='ca:fixture-shopify',state='CA')=>new URL(`https://www.bourbonsignal.com/api/drops?state=${state}&limit=1&source_receipt=${id}&_bs_verify=${now}-abcdef`);
const row=(extra:Row={})=>({sourcePollId:'ca:fixture-shopify',sourceRuntimeId:'ca:fixture-shopify',sourcePollRun:'fixture-run',sourcePollGeneration:2,state:'CA',storeId:'fixture:one',productId:'100',variantId:'200',canonicalBottleId:'bb_fixture',sourceCollectorVersion:'shopify-variant-pickup-v2-strict-premises',observedAt:new Date(now-1000).toISOString(),canAlertAsInventory:true,...extra});
test('legacy literal two, signatures and payload bytes are unchanged with extra trusted sources',()=>{
  const receipt=load([source()]);assert.equal(Object.keys(receipt.PILOT_RECEIPT_SOURCES).length,2);
  for(const[id,d]of Object.entries(receipt.PILOT_RECEIPT_SOURCES) as [string,Row][]){
    const u=url(id,d.state),seconds=Math.floor(now/1000),signature=`v1:${seconds}:${createHmac('sha256',key).update(`${receipt.PILOT_RECEIPT_CONTRACT}\nGET\n${u.origin}${u.pathname}${u.search}\n${seconds}`).digest('hex')}`;
    assert.equal(receipt.signPilotReceipt(u,key,now),signature);
    const r=row({sourcePollId:id,state:d.state,storeId:d.storeId,sourceRuntimeId:undefined,sourceCollectorVersion:undefined});
    const expected={contractVersion:receipt.PILOT_RECEIPT_CONTRACT,surface:'feed',sourceId:id,snapshot:'snapshot',receivedAt:new Date(now).toISOString(),total:1,identities:[{sourceId:id,runId:'fixture-run',generation:2,state:d.state,storeId:d.storeId,canonicalBottleId:'bb_fixture',productId:'100',variantId:'200',observedAt:new Date(now-1000).toISOString()}]};
    assert.equal(JSON.stringify(receipt.pilotReceiptPayload('feed',id,[r],'snapshot',now)),JSON.stringify(expected));
  }
});
test('only trusted registry adds signature authority; no URL parameter can invent or broaden it',()=>{
  const empty=load(),registered=load([source()]);assert.throws(()=>empty.signPilotReceipt(url(),key,now));
  const signature=registered.signPilotReceipt(url(),key,now);assert.equal(registered.authorizePilotReceipt(url(),signature,key,now),true);
  for(const mutate of [(u:URL)=>u.searchParams.set('source_receipt','ca:unregistered'),(u:URL)=>u.searchParams.set('state','NY'),(u:URL)=>u.searchParams.set('store','fixture:two'),(u:URL)=>u.searchParams.set('limit','200')]){const u=url();mutate(u);assert.equal(registered.authorizePilotReceipt(u,signature,key,now),false);assert.throws(()=>registered.signPilotReceipt(u,key,now));}
});
test('registered multiple-store exact tuples pass without a caller-supplied store selector',()=>{
  const receipt=load([source()]),result=receipt.pilotReceiptPayload('coverage','ca:fixture-shopify',[row(),row({storeId:'fixture:two'})],'snapshot',now);
  assert.equal(result.total,2);assert.deepEqual(result.identities.map((r:Row)=>r.storeId),['fixture:one','fixture:two']);
  assert.ok(!JSON.stringify(result).includes('raw'));
});
test('unknown stores/products/variants/canonical/versions and contradictory identity aliases cannot enter receipts',()=>{
  const receipt=load([source()]);
  for(const change of [{storeId:'other'},{store_id:'other'},{productId:'101'},{variantId:'201'},{canonicalBottleId:'other'},{canonicalId:'other'},{sourceRuntimeId:'other'},{state:'NY'},{sourceCollectorVersion:'shopify-variant-pickup-v1'},{sourceCollectorVersion:undefined}])assert.equal(receipt.pilotReceiptPayload('feed','ca:fixture-shopify',[row(change)],null,now).total,0,JSON.stringify(change));
});
test('disabled, stale, expired, future, mixed generations and duplicate tuple rows stay empty',()=>{
  assert.equal(load([source({disabled:true})]).pilotReceiptPayload('feed','ca:fixture-shopify',[row()],null,now).total,0);
  const receipt=load([source()]);for(const change of [{stale:true},{sourceStale:true},{canAlertAsInventory:false},{observedAt:new Date(now-3600001).toISOString()},{observedAt:new Date(now+1).toISOString()}])assert.equal(receipt.pilotReceiptPayload('feed','ca:fixture-shopify',[row(change)],null,now).total,0);
  assert.equal(receipt.pilotReceiptPayload('feed','ca:fixture-shopify',[row(),row({storeId:'fixture:two',sourcePollGeneration:3})],null,now).total,0);
  assert.equal(receipt.pilotReceiptPayload('feed','ca:fixture-shopify',[row(),row()],null,now).total,0);
});
test('malformed/duplicate/colliding trusted registry fails new authority without changing legacy scope',()=>{
  for(const sources of [[source(),source()],[source({id:'fl:jensens-miami'})],[source({partitionBindings:[]})],[source({kind:'unknown'})]]){
    const receipt=load(sources);assert.throws(()=>receipt.cohortReceiptSources());assert.throws(()=>receipt.signPilotReceipt(url(),key,now));assert.doesNotThrow(()=>receipt.signPilotReceipt(url('fl:jensens-miami','FL'),key,now));
  }
});
