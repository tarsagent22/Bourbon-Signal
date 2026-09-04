import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectPrecisionProbes } from '../src/collectors/precision-probes.mjs';

// Decoded stock buckets and positive->empty counterexample from collectors-audit.md.
const soldOut='3:5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9';
async function collect(products) {
  const cwd=process.cwd(), originalFetch=globalThis.fetch;
  const dir=await mkdtemp(path.join(tmpdir(),'astra-oh-'));
  try {
    process.chdir(dir);
    globalThis.fetch=()=>{throw new Error('NETWORK FORBIDDEN');};
    await mkdir('out/browser',{recursive:true});
    await writeFile('out/browser/ohlq-availability.json',JSON.stringify({generatedAt:new Date().toISOString(),products}));
    await writeFile('out/current-snapshot.json',JSON.stringify({signals:[{state:'OH',key:'old',eventType:'browser_assisted_store_inventory_in_stock',availabilityStatus:'in_stock',observedAt:'2026-08-01T12:00:00Z',canonicalName:'Fixture Bourbon'}]}));
    return await collectPrecisionProbes({id:'OH',label:'Ohio',sources:[]},{match:()=>null},[],{sourceRunnerOptions:{schedule:false,maxAttempts:1}});
  } finally {process.chdir(cwd);globalThis.fetch=originalFetch;await rm(dir,{recursive:true,force:true});}
}
test('F03 OH fresh fully decoded negative inventory does not fall back to prior positives',async()=>{
  const result=await collect([{ok:true,sku:'abc',inventories:[{AgencyId:'1',VariantCode:'abc',I:soldOut}]}]);
  assert.deepEqual(result.signals,[]);
  assert.equal(result.stale,false);
  assert.equal(result.metadata.complete,true);
  assert.equal(result.metadata.outcome,'complete_empty');
  assert.deepEqual(result.metadata.negativeObservations.map(x=>[x.sku,x.storeId,x.availabilityStatus]),[['abc','1','sold_out']]);
});
test('F03 OH mixed failures do not assert global completeness',async()=>{
  const result=await collect([{ok:true,sku:'abc',inventories:[{AgencyId:'1',VariantCode:'abc',I:soldOut}]},{ok:false,sku:'def',status:429}]);
  assert.notEqual(result.metadata?.complete,true);
  assert.equal(result.stale,true);
});
