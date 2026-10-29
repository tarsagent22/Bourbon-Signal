import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {BourbonBible} from '../src/core/bible.mjs';
import {collectTexasShopifyPickup,readTexasPickupState,TEXAS_SHOPIFY_PICKUP_SOURCE as source,isTexasShopifyPickupIdentity,isTexasShopifyPickupInventory} from '../src/collectors/texas-shopify-pickup.mjs';
import {withCollectionContext} from '../src/core/collection-context.mjs';
import {canonicalizeSignal} from '../src/operational-report.mjs';
import {bibleLookup,buildDrops,buildCurrentInventoryAlertsFromDrops} from '../src/export-site-contract.mjs';
import {isTexasRetailerInventory} from '../src/texas-retailer-policy.mjs';
import {guardStateReport} from '../src/state-report-guard.mjs';
import {collectState} from '../src/collectors/generic-state.mjs';
import {STATE_SOURCES} from '../src/state-sources.mjs';
import {isCurrentInventoryEvidence,projectInventoryEvidenceFreshness} from '../../src/lib/public-drop-evidence.ts';

const fixtureRoot=new URL('./fixtures/independent-shopify-pickup/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',fixtureRoot),'utf8'));
const captures=new Map(await Promise.all(manifest.captures.filter(r=>r.sourceId===source.id).map(async row=>[row.requestedUrl,await readFile(new URL(row.file,fixtureRoot),'utf8')])));
const at=manifest.captures.filter(r=>r.sourceId===source.id).map(r=>r.capturedAt).sort().at(-1);
const bible=await BourbonBible.load(new URL('../out/bourbon-bible.json',import.meta.url));
async function setup(t){
  t.mock.timers.enable({apis:['Date'],now:Date.parse(at)+1000});
  const dir=await mkdtemp(path.join(tmpdir(),'bs-tx-shopify-'));
  assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  return {cacheFile:path.join(dir,'source.json'),observedAt:new Date().toISOString()};
}
const transport=async url=>({ok:true,status:200,url,text:captures.get(url)});

test('Texas exact two-product leaf survives canonical public and alert projection without generic admission',async t=>{
  const options=await setup(t),result=await collectTexasShopifyPickup({id:'TX'},bible,{...options,fetchText:transport});
  assert.equal(result.sourceResults[0].sourceId,source.runtimeId);
  assert.equal(result.sourceResults[0].status,'success');
  assert.equal(result.metadata.accounting.requestCount,4);
  assert.equal(result.signals.length,2);
  assert.ok(result.signals.every(isTexasShopifyPickupIdentity));
  assert.ok(result.signals.every(row=>isTexasShopifyPickupInventory(row)));
  const operational=result.signals.map(row=>canonicalizeSignal(row,bible));
  assert.ok(operational.every(isTexasRetailerInventory));
  const drops=buildDrops(operational,bibleLookup(bible.records),operational);
  assert.equal(drops.length,2);
  assert.ok(drops.every(isTexasRetailerInventory));
  assert.ok(drops.every(row=>isCurrentInventoryEvidence(row,Date.now())));
  assert.ok(drops.every(row=>!isCurrentInventoryEvidence(row,Date.now()+61*60_000)));
  assert.ok(drops.every(row=>projectInventoryEvidenceFreshness(row,Date.now()+61*60_000).canAlertAsInventory===false));
  const alerts=buildCurrentInventoryAlertsFromDrops(drops);
  assert.equal(alerts.length,2);
  assert.ok(alerts.every(row=>row.quantity===0&&row.quantityIsExact===false));
  const retained=await collectTexasShopifyPickup({id:'TX'},bible,{...options,nowMs:Date.now()+60_000,fetchText:()=>{throw Error('not due must not fetch');}});
  assert.equal(retained.sourceResults[0].status,'not_due');
  assert.ok(retained.signals.every(row=>row.observedAt===options.observedAt));
  const stale=await collectTexasShopifyPickup({id:'TX'},bible,{...options,nowMs:Date.now()+61*60_000,fetchText:async url=>({ok:false,status:403,url,text:''})});
  assert.ok(stale.signals.every(row=>row.stale&&!row.canAlertAsInventory));
  assert.equal(buildDrops(stale.signals.map(row=>canonicalizeSignal(row,bible)),bibleLookup(bible.records),[]).length,0);
});

test('unreviewed identity, edition, premise, quantity, clock and generic rows remain blocked',async t=>{
  const options=await setup(t),result=await collectTexasShopifyPickup({id:'TX'},bible,{...options,fetchText:transport}),row=result.signals[0];
  for(const change of [{storeAddress:'411 Other Street Austin TX 78701'},{canonicalBottleId:'other'},
    {variantId:'999'},{price:1},{quantity:100},{quantityIsExact:true},{observedAt:new Date(Date.now()+1000).toISOString()},
    {sourceProductBinding:{...row.sourceProductBinding,pickupUrl:'https://attacker.invalid'}},
    {sourceRuntimeId:'mi:wine-palace-livonia'},{eventType:'warehouse_inventory'},{stale:true}]){
    const changed={...row,...change};assert.equal(isTexasRetailerInventory(changed),false);
    assert.equal(buildDrops([canonicalizeSignal(changed,bible)],bibleLookup(bible.records),[changed]).length,0,JSON.stringify(change));
  }
  const generic={...row,sourceProductBinding:row.sourceProductBinding.pickupUrl};
  assert.equal(buildDrops([canonicalizeSignal(generic,bible)],bibleLookup(bible.records),[generic]).length,0);
});

for(const status of [401,403,429])test(`HTTP ${status} denials persist for 24 hours and stop before another product request`,async t=>{
  const options=await setup(t);let requests=0;
  const first=await collectTexasShopifyPickup({id:'TX'},bible,{...options,fetchText:async url=>{requests++;return{ok:false,status,url,text:''};}});
  assert.equal(requests,1);assert.equal(first.sourceResults[0].error.status,status);
  const cache=JSON.parse(await readFile(options.cacheFile,'utf8'));
  assert.equal(Date.parse(cache.nextAllowedAt)-Date.parse(cache.lastAttemptAt),24*60*60_000);
  const second=await collectTexasShopifyPickup({id:'TX'},bible,{...options,nowMs:Date.now()+8*60*60_000,fetchText:()=>{requests++;throw Error('denied source retried');}});
  assert.equal(requests,1);assert.equal(second.sourceResults[0].status,'circuit_open');
});

for(const status of [401,403,429])test(`parent cancellation after HTTP ${status} preserves only denial metadata and never changes stock`,async t=>{
  const options=await setup(t),incidentFile=path.join(path.dirname(options.cacheFile),'texas-shopify-pickup-incidents.json');
  await collectTexasShopifyPickup({id:'TX'},bible,{...options,fetchText:transport});
  const stockBefore=await readFile(options.cacheFile,'utf8'),controller=new AbortController();let requests=0;
  const nowMs=Date.now()+31*60_000,retryAfterSeconds=status===429?3*24*60*60:0;
  await assert.rejects(withCollectionContext({signal:controller.signal},()=>collectTexasShopifyPickup({id:'TX'},bible,{
    ...options,nowMs,fetchText:async url=>{
      requests++;controller.abort(new Error('parent cancelled after denial'));
      return {ok:false,status,url,text:'',retryAfterSeconds};
    },
  })),/parent cancelled after denial/);
  assert.equal(requests,1);
  assert.equal(await readFile(options.cacheFile,'utf8'),stockBefore,'cancellation cannot publish or mutate inventory');
  const ledger=JSON.parse(await readFile(incidentFile,'utf8')),host=new URL(source.baseUrl).hostname;
  assert.deepEqual(Object.keys(ledger).sort(),['hosts','schemaVersion']);
  assert.deepEqual(Object.keys(ledger.hosts),[host]);
  assert.deepEqual(Object.keys(ledger.hosts[host]).sort(),['httpStatus','lastAttemptAt','nextAllowedAt']);
  assert.equal(ledger.hosts[host].httpStatus,status);
  assert.equal(Date.parse(ledger.hosts[host].nextAllowedAt)-Date.parse(ledger.hosts[host].lastAttemptAt),Math.max(24*60*60_000,retryAfterSeconds*1000));
  // A source-config replacement or missing stock cache cannot reset host denial.
  const old=JSON.parse(stockBefore);old.configSha256='different reviewed cohort';
  await writeFile(options.cacheFile,JSON.stringify(old));
  for(const removeCache of [false,true]){
    if(removeCache)await rm(options.cacheFile);
    const result=await collectTexasShopifyPickup({id:'TX'},bible,{...options,nowMs:nowMs+8*60*60_000,
      fetchText:()=>{requests++;throw Error('denied host retried');}});
    assert.equal(result.sourceResults[0].status,'circuit_open');assert.equal(result.signals.length,0);
  }
  assert.equal(requests,1);
});

for(const state of ['inventory cache','incident ledger'])test(`malformed existing ${state} blocks HTTP and preserves the file`,async t=>{
  const options=await setup(t),file=state==='inventory cache'?options.cacheFile:path.join(path.dirname(options.cacheFile),'texas-shopify-pickup-incidents.json');
  for(const corrupt of ['{broken',state==='inventory cache'?'{}':'{"schemaVersion":1,"hosts":{},"signals":[]}']){
    await writeFile(file,corrupt);let requests=0;
    await assert.rejects(collectTexasShopifyPickup({id:'TX'},bible,{...options,fetchText:()=>{requests++;throw Error('unsafe state requested');}}),/malformed/);
    assert.equal(requests,0);assert.equal(await readFile(file,'utf8'),corrupt);
  }
});

for(const status of [403,429])test(`incident rename failure preserves HTTP ${status} and its denial cooldown in the stock cache`,async t=>{
  const options=await setup(t),incidentFile=path.join(path.dirname(options.cacheFile),'texas-shopify-pickup-incidents.json');
  const retryAfterSeconds=status===429?3*24*60*60:0;let requests=0;
  const result=await collectTexasShopifyPickup({id:'TX'},bible,{...options,fetchText:async url=>{
    requests++;
    // Make the journal rename fail after the successful cold read. The stock
    // cache path remains writable, so this exercises the real fallback path.
    await mkdir(incidentFile);
    return {ok:false,status,url,text:'',retryAfterSeconds};
  }});
  assert.equal(result.sourceResults[0].error.status,status);
  assert.equal(result.sourceResults[0].error.details.incidentWriteFailed,true);
  assert.match(result.sourceResults[0].error.message,/denial journal could not be persisted/);
  const cache=JSON.parse(await readFile(options.cacheFile,'utf8'));
  assert.equal(cache.httpStatus,status);
  assert.equal(Date.parse(cache.nextAllowedAt)-Date.parse(cache.lastAttemptAt),Math.max(24*60*60_000,retryAfterSeconds*1000));
  await rm(incidentFile,{recursive:true});
  const next=await collectTexasShopifyPickup({id:'TX'},bible,{...options,nowMs:Date.now()+8*60*60_000,
    fetchText:()=>{requests++;throw Error('failed journal allowed a retry');}});
  assert.equal(requests,1);assert.equal(next.sourceResults[0].status,'circuit_open');
});

test('only ENOENT permits a cold state read; EACCES and other failures remain closed',async()=>{
  for(const label of ['inventory cache','incident ledger']){
    assert.equal(await readTexasPickupState('unreadable',label,async()=>{throw Object.assign(new Error('missing'),{code:'ENOENT'});}),null);
    for(const code of ['EACCES','EIO'])await assert.rejects(readTexasPickupState('unreadable',label,async()=>{
      throw Object.assign(new Error('access refused'),{code});
    }),error=>error.message.includes('could not be read safely')&&error.cause.code===code);
  }
});

test('incident write failure never permits a stock write after parent cancellation',async t=>{
  const options=await setup(t),incidentFile=path.join(path.dirname(options.cacheFile),'texas-shopify-pickup-incidents.json');
  await collectTexasShopifyPickup({id:'TX'},bible,{...options,fetchText:transport});
  const before=await readFile(options.cacheFile,'utf8'),controller=new AbortController();
  await assert.rejects(withCollectionContext({signal:controller.signal},()=>collectTexasShopifyPickup({id:'TX'},bible,{
    ...options,nowMs:Date.now()+31*60_000,fetchText:async url=>{
      await mkdir(incidentFile);controller.abort(new Error('parent cancelled with journal failure'));
      return {ok:false,status:403,url,text:''};
    },
  })),/parent cancelled with journal failure/);
  assert.equal(await readFile(options.cacheFile,'utf8'),before);
});

test('production independently restores and always saves inventory and incident files, including path negatives',async()=>{
  const workflow=await readFile(new URL('../../.github/workflows/refresh-feed.yml',import.meta.url),'utf8');
  const files=[['engine/out/cache/texas-shopify-pickup.json','attempts'],['engine/out/cache/texas-shopify-pickup-incidents.json','incidents']];
  function check(text){
    const steps=text.split(/\r?\n {6}- name:/),keys=[];
    for(const [cachePath,kind]of files){
      const exactPath=step=>step.match(/\bpath: ([^\r\n]+)/)?.[1]===cachePath;
      const restore=steps.find(step=>step.includes('actions/cache/restore@v4')&&exactPath(step));
      const save=steps.find(step=>step.includes('actions/cache/save@v4')&&exactPath(step));
      assert.ok(restore,`${kind} restore requires its own exact file`);assert.ok(save,`${kind} save requires its own exact file`);
      assert.match(save,/\bif: always\(\)/);
      const key=save.match(/\bkey: (.+)/)[1];keys.push(key);
      assert.equal(key,restore.match(/\bkey: (.+)/)[1]);
      assert.ok(restore.includes(`inventory-tx-shopify-${kind}-`));assert.match(key,/github\.run_attempt/);
      const general=steps.find(step=>step.startsWith(' Restore collector artifacts and adaptive scheduler state'));
      assert.ok(steps.indexOf(restore)>steps.indexOf(general),'independent state wins over older verified collector state');
    }
    assert.notEqual(keys[0],keys[1],'incident metadata must have independent durable storage');
  }
  check(workflow);
  assert.throws(()=>check(workflow.replaceAll(files[1][0],files[0][0])),/incidents restore requires its own exact file/);
  assert.throws(()=>check(workflow.replace(/(Save Texas Shopify pickup denial journal[^]*?)if: always\(\)/,'$1if: success()')),/always/);
});

test('complete negative pickup observations replace positives without a false collapse',async t=>{
  const options=await setup(t);
  await collectTexasShopifyPickup({id:'TX'},bible,{...options,fetchText:transport});
  const result=await collectTexasShopifyPickup({id:'TX'},bible,{...options,nowMs:Date.now()+31*60_000,fetchText:async url=>{
    const text=captures.get(url);return{ok:true,status:200,url,text:url.endsWith('.json')?text:text.replace(/Pickup available/gi,'Pickup unavailable')};
  }});
  assert.equal(result.sourceResults[0].status,'success');
  assert.equal(result.signals.length,0);assert.equal(result.metadata.recordsInspected,2);
  assert.equal(result.metadata.negativeObservations.length,2);
});

test('current library disabling suppresses this exact product while the sibling remains',async t=>{
  const options=await setup(t),records=structuredClone(bible.records);
  const record=records.find(record=>record.id===source.products[0].canonicalBottleId);record.libraryAlertEligible=false;
  const result=await collectTexasShopifyPickup({id:'TX'},new BourbonBible(records),{...options,fetchText:transport});
  assert.equal(result.signals.length,1);assert.equal(result.signals[0].canonicalName,'Eagle Rare 10 Year');
});

test('current exact library tier takes precedence over a legacy standard seed',async t=>{
  const options=await setup(t),records=structuredClone(bible.records);
  records.find(record=>record.id===source.products[0].canonicalBottleId).tier='standard';
  const result=await collectTexasShopifyPickup({id:'TX'},new BourbonBible(records),{...options,fetchText:transport});
  assert.equal(result.signals.find(row=>row.canonicalBottleId===source.products[0].canonicalBottleId)?.tier,'limited');
});

test('state partial quality fallback preserves fresh independent pickup and stale Texas siblings',async t=>{
  const options=await setup(t);
  // The legacy lane is explicitly suspended, including on a cold cache.
  let legacyRequests=0;
  t.mock.method(globalThis,'fetch',async()=>{legacyRequests++;throw Error('suspended Texas lane made a request');});
  const previous={state:'TX',label:'Texas',status:'useful',finishedAt:at,signals:Array.from({length:110},(_,i)=>({id:'old-'+i,state:'TX',
    eventType:'cityhive_store_inventory_result',locationPrecision:'store_level',canAlertAsInventory:true,sourceAvailabilityVerified:true,
    canonicalBottleId:'old-bottle-'+i,storeId:'old-store-'+i,sourceLabel:'Old Texas sibling',observedAt:at})),sources:[],sourceResults:[],roadblocks:[]};
  const previousPrecision={contractVersion:'bourbon-signal-source-result-v1',sourceId:'precision:tx',status:'success',ok:true,
    alertable:true,lastGoodAt:at,finishedAt:at,value:{signals:previous.signals,roadblocks:[]}};
  // Run the mocked legacy collector in its own temporary output directory so
  // fixture denials never write a cooldown into an operator/CI collector cache.
  const originalDirectory=process.cwd(),requested=[];let candidate;
  try{
    process.chdir(path.dirname(options.cacheFile));
    candidate=await collectState(STATE_SOURCES.find(config=>config.id==='TX'),bible,{fetcher:async url=>{
      requested.push(url);return{ok:true,status:200,url,text:captures.get(url)||'<html><title>Official Texas reporting</title></html>',contentType:'text/html'};
    },texasShopifyOptions:options,
      sourceRunnerOptions:{schedule:false,maxAttempts:1},previousSourceResults:{'precision:tx':previousPrecision}});
  }finally{process.chdir(originalDirectory);}
  const legacy=candidate.sourceResults.find(result=>result.sourceId==='precision:tx');
  assert.equal(legacy.status,'disabled');assert.equal(legacy.attemptCount,0);assert.equal(legacyRequests,0);
  assert.equal(requested.length,6);
  assert.equal(requested.filter(url=>new URL(url).host==='hotspot.fun').length,4);
  assert.deepEqual(requested.filter(url=>new URL(url).host!=='hotspot.fun').sort(),[
    'https://comptroller.texas.gov/taxes/alcohol/','https://www.tabc.texas.gov/public-information/tabc-public-inquiry/',
  ]);
  assert.ok(legacy.value.signals.every(row=>row.stale&&!row.canAlertAsInventory));
  assert.equal(candidate.stale,false);
  const guarded=guardStateReport({previous,candidate,options:{mergePartialFallback:true}});
  assert.equal(guarded.report.stale,false);assert.equal(guarded.report.status,'partial_useful_quality_fallback');
  assert.equal(guarded.report.signals.filter(row=>row.sourceRuntimeId===source.runtimeId&&row.canAlertAsInventory).length,2);
  assert.ok(guarded.report.signals.filter(row=>row.sourceLabel==='Old Texas sibling').every(row=>row.stale&&!row.canAlertAsInventory));
});
