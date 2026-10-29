import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {VIRGINIA_PRODUCTS,virginiaStoreSignals} from '../src/collectors/precision-probes.mjs';
import {evaluateVirginiaProductCoverage,sanitizeVirginiaInventoryCacheSignals} from '../src/collectors/virginia-inventory-recovery.mjs';
import {canonicalizeSignal} from '../src/operational-report.mjs';
import {confidenceForSignal} from '../src/confidence-policy.mjs';
import {bibleLookup,buildDrops,publicSignal} from '../src/export-site-contract.mjs';
const root=new URL('../data/source-evidence/virginia-negative-balances-20261029/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('json-origins-manifest.json',root),'utf8'));
for(const capture of manifest.results){
 test(`negative source balance ${capture.store}/${capture.product} accounts for exact origin without stock or alerts`,async()=>{
  const bytes=await readFile(new URL(`${capture.store}-${capture.product}.json`,root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),capture.sha256);
  const payload=JSON.parse(bytes),product=VIRGINIA_PRODUCTS.find(x=>x.code===capture.product);
  assert.ok(product);
  const source=payload.products.find(x=>String(x.productId)===capture.product&&String(x.storeInfo?.storeId)===capture.store).storeInfo;
  assert.ok(Number.isSafeInteger(source.quantity)&&source.quantity<0);
  const record={id:`va-negative-${capture.product}`,canonical:product.name,tier:'unicorn',aliases:[]};
  const bible={match:()=>({record,confidence:1})};
  const origin={storeNumber:capture.store,address:source.address1,city:source.city,zip:source.zip,lat:source.latitude,lng:source.longitude};
  const signals=virginiaStoreSignals(product,payload,{id:'VA'},bible,capture.url,new Set([capture.store]),origin);
  assert.equal(signals.length,1);
  const row=signals[0];
  assert.equal(row.storeId,capture.store);
  assert.equal(row.raw.store.quantity,source.quantity);
  assert.equal(row.reportedQuantity,source.quantity);
  assert.equal(row.quantity,0);
  assert.equal(row.quantityIsExact,false);
  assert.equal(row.sourceAvailabilityVerified,false);
  assert.equal(row.availabilityStatus,'unknown');
  assert.equal(row.canAlertAsInventory,false);
  assert.equal(row.canAlertAsWatch,false);
  assert.equal(evaluateVirginiaProductCoverage(signals,new Set([capture.store])).complete,true);
  assert.equal(evaluateVirginiaProductCoverage(signals,new Set([capture.store,'999'])).complete,false);
  const policy=confidenceForSignal(row);
  assert.equal(policy.canAlertAsInventory,false);
  assert.equal(policy.canAlertAsWatch,false);
  const canonical=canonicalizeSignal(row,bible),lookup=bibleLookup([record]);
  assert.equal(canonical.reportedQuantity,source.quantity);
  assert.equal(canonical.canAlertAsInventory,false);
  assert.equal(canonical.canAlertAsWatch,false);
  const projected=publicSignal(canonical,lookup);
  assert.equal(projected.quantityIsExact,false);
  assert.equal(projected.sourceAvailabilityVerified,false);
  assert.equal(projected.canAlertAsInventory,false);
  assert.equal(projected.canAlertAsWatch,false);
  assert.deepEqual(buildDrops([canonical],lookup,[canonical]),[]);
  const cached=sanitizeVirginiaInventoryCacheSignals(signals)[0];
  assert.equal(cached.reportedQuantity,source.quantity);
  assert.equal(cached.raw.store.quantity,source.quantity);
  assert.equal(cached.canAlertAsInventory,false);
  assert.equal(cached.canAlertAsWatch,false);
 });
}
test('negative balance never substitutes a nearby store or mismatched product',()=>{
 const product=VIRGINIA_PRODUCTS.find(x=>x.code==='019880');
 const bible={match:()=>({record:{id:'michters',canonical:product.name},confidence:1})};
 const origin={storeNumber:'103'};
 for(const entry of [{productId:'019880',storeInfo:{storeId:95,quantity:-8}},{productId:'wrong',storeInfo:{storeId:103,quantity:-8}}]){
  assert.deepEqual(virginiaStoreSignals(product,{products:[entry]},{id:'VA'},bible,'https://www.abc.virginia.gov/',new Set(['103']),origin),[]);
 }
 for(const quantity of [null,undefined,'',NaN,Infinity,-Infinity,-1.5,-Number.MAX_SAFE_INTEGER-1]){
  const entry={productId:'019880',storeInfo:{storeId:103,quantity}};
  assert.deepEqual(virginiaStoreSignals(product,{products:[entry]},{id:'VA'},bible,'https://www.abc.virginia.gov/',new Set(['103']),origin),[]);
 }
});
