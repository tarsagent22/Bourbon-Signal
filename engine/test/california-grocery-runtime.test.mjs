import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BourbonBible} from '../src/core/bible.mjs';
import {collectCaliforniaGrocerySource,californiaGroceryCohortKey} from '../src/collectors/california-grocery-runtime-source.mjs';
import {CALIFORNIA_GROCERY_SOURCES} from '../src/collectors/california-grocery-premises.mjs';
import {collectCalifornia} from '../src/collectors/precision-probes.mjs';
import {ALL_STATE_SOURCES} from '../src/state-sources.mjs';
const fixture=JSON.parse(await readFile(new URL('./fixtures/california-grocery-expansion/identity.json',import.meta.url)));
const bible=new BourbonBible(fixture.records),config=ALL_STATE_SOURCES.find(s=>s.id==='CA');

test('independent grocery denial journal survives abort and stops unchanged subsequent requests',async()=>{
  const cacheDir=await mkdtemp(path.join(tmpdir(),'ca-grocery-ledger-'));let calls=0;
  try{
    const controller=new AbortController();
    await assert.rejects(()=>collectCaliforniaGrocerySource(config,bible,{cacheDir,forceLive:true,signal:controller.signal,sleep:async()=>{},
      fetchText:async()=>{calls++;controller.abort(new Error('lateabort'));return{ok:false,status:403,text:''}}}),/lateabort/);
    const ledger=JSON.parse(await readFile(path.join(cacheDir,'CA-grocery-xapi-attempts.json'),'utf8'));
    assert.equal(ledger['host:www.safeway.com'].httpStatus,403);assert.equal(calls,1);
    const retry=await collectCaliforniaGrocerySource(config,bible,{cacheDir,forceLive:true,sleep:async()=>{},fetchText:async()=>{calls++;throw new Error('unexpectedrequest')}});
    assert.equal(calls,1);assert.equal(retry.signals.length,0);assert.equal(retry.metadata.requests.length,0);
  }finally{await rm(cacheDir,{recursive:true,force:true});}
});

test('fresh grocery cache retains original observations and expires independently from Shopify cache',async()=>{
  const cacheDir=await mkdtemp(path.join(tmpdir(),'ca-grocery-cache-'));const now=Date.now(),observedAt=new Date(now-60_000).toISOString();
  try{
    const row={id:'captured',observedAt,raw:{source:'first-party'}};
    await writeFile(path.join(cacheDir,'CA-grocery-xapi-cache.json'),JSON.stringify({schemaVersion:1,cohortKey:californiaGroceryCohortKey(),generatedAt:observedAt,signals:[row],metadata:{complete:true}}));
    const reused=await collectCaliforniaGrocerySource(config,bible,{cacheDir,nowMs:now,fetchText:async()=>{throw new Error('unexpectednetwork')}});
    assert.equal(reused.accounting.requestCount,0);assert.equal(reused.signals[0].observedAt,observedAt);
    assert.equal(reused.signals[0].raw.cacheFallback,true);
    let calls=0;
    const expired=await collectCaliforniaGrocerySource(config,bible,{cacheDir,nowMs:now+31*60_000,sleep:async()=>{},fetchText:async()=>{calls++;return{ok:false,status:403,text:''}}});
    assert.equal(calls,1);assert.equal(expired.signals.length,0);
  }finally{await rm(cacheDir,{recursive:true,force:true});}
});

test('a previous California cohort cache cannot hide newly reviewed stores',async()=>{
  const cacheDir=await mkdtemp(path.join(tmpdir(),'ca-grocery-cohort-'));const observedAt=new Date().toISOString();let calls=0;
  try{
    const oldKey=californiaGroceryCohortKey(CALIFORNIA_GROCERY_SOURCES.slice(0,2));
    assert.notEqual(oldKey,californiaGroceryCohortKey());
    await writeFile(path.join(cacheDir,'CA-grocery-xapi-cache.json'),JSON.stringify({schemaVersion:1,cohortKey:oldKey,generatedAt:observedAt,signals:[{observedAt}],metadata:{complete:true}}));
    const result=await collectCaliforniaGrocerySource(config,bible,{cacheDir,sleep:async()=>{},fetchText:async()=>{calls++;return{ok:false,status:403,text:''}}});
    assert.equal(calls,1);assert.equal(result.signals.length,0);assert.equal(result.metadata.cacheReused,undefined);
  }finally{await rm(cacheDir,{recursive:true,force:true});}
});

test('California aggregation preserves Shopify inventory siblings when grocery denies and journals separately',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'ca-grocery-siblings-'));const previousCwd=process.cwd(),previousFetch=globalThis.fetch;
  const previousLive=process.env.BOURBON_SIGNAL_CA_FORCE_SHOPIFY_LIVE;
  try{
    process.chdir(directory);process.env.BOURBON_SIGNAL_CA_FORCE_SHOPIFY_LIVE='1';
    globalThis.fetch=async url=>{
      const parsed=new URL(url);
      if(parsed.pathname.includes('products.json'))return new Response(JSON.stringify({products:[{id:1001,title:'Eagle Rare 10 Year',handle:'eagle-rare',product_type:'Bourbon',tags:['Bourbon'],variants:[{id:1002,title:'750 ml',available:true,price:'79.99'}]}]}),{status:200});
      return new Response('In-store collection available. Free in store pickup. Reserve your order for pickup.',{status:200});
    };
    const result=await collectCalifornia(config,bible,{sourceRunnerOptions:{schedule:false,maxAttempts:1},grocerySourceOptions:{forceLive:true,
      cacheDir:path.join(directory,'grocery'),sleep:async()=>{},fetchText:async()=>({ok:false,status:403,text:''})}});
    assert.ok(result.signals.some(row=>row.sourceChain==='del-mesa-liquor'&&row.eventType==='retailer_store_inventory_result'));
    assert.ok(result.signals.some(row=>row.sourceChain==='mission-trails-wine-spirits'&&row.eventType==='retailer_store_inventory_result'));
    assert.ok(result.sourceResults.some(row=>row.sourceId==='ca:grocery-xapi'&&!row.ok));
    const ledger=JSON.parse(await readFile(path.join(directory,'grocery','CA-grocery-xapi-attempts.json'),'utf8'));
    assert.equal(ledger['host:www.safeway.com'].httpStatus,403);
  }finally{
    globalThis.fetch=previousFetch;process.chdir(previousCwd);
    if(previousLive===undefined)delete process.env.BOURBON_SIGNAL_CA_FORCE_SHOPIFY_LIVE;else process.env.BOURBON_SIGNAL_CA_FORCE_SHOPIFY_LIVE=previousLive;
    await rm(directory,{recursive:true,force:true});
  }
});
