import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {BourbonBible} from '../src/core/bible.mjs';
import {collectState} from '../src/collectors/generic-state.mjs';
import {ALL_STATE_SOURCES} from '../src/state-sources.mjs';
import {STATE_LIFECYCLE_CONFIG} from '../src/state-lifecycle.mjs';
import {evaluateCapacityBudget} from '../src/reliability-policy.mjs';
import {stateTimeoutMs} from '../src/run.mjs';
import {LOUISIANA_ALASKA_GROCERY_BUDGETS,louisianaAlaskaGroceryCohortKey} from '../src/louisiana-alaska-grocery-production-config.mjs';
import {collectLouisianaAlaskaGroceryProductionSource,louisianaAlaskaGroceryPromotionAllowed} from '../src/collectors/louisiana-alaska-grocery-production.mjs';
import {LOUISIANA_ALASKA_GROCERY_SOURCES} from '../src/collectors/louisiana-alaska-grocery-premises.mjs';
import {parseLouisianaAlaskaGroceryInventory} from '../src/collectors/louisiana-alaska-grocery-expansion.mjs';
import {isLouisianaAlaskaGroceryInventory} from '../src/louisiana-alaska-grocery-policy.mjs';
import {parseBoundGroceryXapiInventory} from '../src/collectors/grocery-xapi-identity.mjs';
import {fixture,syntheticPromotedGroceryConfig,syntheticPromotionManifest,syntheticInactiveGroceryConfig,mockedCompleteGroceryFetch} from './helpers/synthetic-louisiana-alaska-promotion.mjs';
const bible=new BourbonBible(fixture.records),config=ALL_STATE_SOURCES.find(source=>source.id==='AK');
const options=directory=>{const lifecycleConfig=syntheticPromotedGroceryConfig();return{cacheDir:path.join(directory,'cache'),incidentDir:path.join(directory,'incidents'),cursorDir:path.join(directory,'cursor'),sleep:async()=>{},lifecycleConfig,promotionManifest:syntheticPromotionManifest('AK',lifecycleConfig)};};

test('inactive, incomplete, changed, disabled and quarantined promotion authority makes zero HTTP requests',async()=>{
  let requests=0;const fetchText=async()=>{requests++;throw new Error('Forbidden pre-promotion HTTP');};
  for(const state of ['LA','AK']){
    const source=ALL_STATE_SOURCES.find(row=>row.id===state),report=await collectState(source,bible,{lifecycleConfig:syntheticInactiveGroceryConfig(state),fetcher:fetchText,grocerySourceOptions:{fetchText}});
    assert.equal(report.status,'not_promoted');assert.equal(report.signals.length,0);assert.equal(report.sourceResults.length,0);
    const active=syntheticPromotedGroceryConfig(state);assert.equal(louisianaAlaskaGroceryPromotionAllowed(state,active),false,'Unreconciled manifest must block even a schema-valid active config');assert.equal(louisianaAlaskaGroceryPromotionAllowed(state,active,{manifest:syntheticPromotionManifest(state,active)}),true);
    for(const mutate of [row=>delete row.states[state].promotionEvidence,row=>{row.states[state].promotionStage='research';},
      row=>{row.states[state].inventoryAlertable=true;},row=>{row.states[state].promotionEvidence.immutableEvidence.sourceConfigHash='0'.repeat(64);}]){
      const changed=structuredClone(active);mutate(changed);
      const held=await collectLouisianaAlaskaGroceryProductionSource(source,bible,{lifecycleConfig:changed,promotionManifest:syntheticPromotionManifest(state,active),fetchText});
      assert.equal(held.metadata.blockedByPromotion,true);
    }
    for(const env of [{BOURBON_SIGNAL_DISABLED_STATES:state},{BOURBON_SIGNAL_QUARANTINED_STATES:state}]){
      assert.equal(louisianaAlaskaGroceryPromotionAllowed(state,active,{env,manifest:syntheticPromotionManifest(state,active)}),false);
    }
  }
  assert.equal(requests,0);
});

test('complete cohort cache preserves original clocks, stays on-site only, rejects old cohorts and expires after30minutes',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'louisiana-alaska-production-cache-'));
  try{
    const opts=options(directory),now=Date.now();let requests=0;
    const result=await collectLouisianaAlaskaGroceryProductionSource(config,bible,{...opts,nowMs:now,fetchText:mockedCompleteGroceryFetch('AK',()=>requests++)});
    assert.equal(result.metadata.complete,true);assert.ok(result.signals.length>0);assert.ok(requests>=45&&requests<=53);
    assert.ok(result.signals.every(row=>row.quantity===0&&row.quantityIsExact===false&&row.eligibleForOnSite
      &&!row.canAlertAsInventory&&!row.canAlertAsWatch&&!row.eligibleForWatch&&!row.eligibleForDelivery&&!row.eligibleForEmail&&!row.eligibleForSms));
    const clock=result.signals[0].observedAt;
    const again=await collectLouisianaAlaskaGroceryProductionSource(config,bible,{...opts,nowMs:now+29*60_000,fetchText:async()=>{throw new Error('Fresh cache requested HTTP');}});
    assert.equal(again.signals[0].observedAt,clock);assert.equal(again.accounting.requestCount,0);assert.equal(again.metadata.cacheReused,true);
    assert.equal(again.metadata.sourceObservedAt,clock);
    const cancelled=new AbortController();cancelled.abort(new Error('cancelled before cache admission'));
    await assert.rejects(()=>collectLouisianaAlaskaGroceryProductionSource(config,bible,{...opts,nowMs:now+29*60_000,signal:cancelled.signal,
      fetchText:async()=>{throw new Error('Cancelled cache requested HTTP');}}),/cancelled before cache admission/);
    const disabledBible=new BourbonBible(fixture.records.map(record=>({...record,libraryAlertEligible:false})));
    const newlyDisabled=await collectLouisianaAlaskaGroceryProductionSource(config,disabledBible,{...opts,nowMs:now+29*60_000,
      fetchText:async()=>{throw new Error('Current library eligibility should filter the existing source observation');}});
    assert.equal(newlyDisabled.accounting.requestCount,0);assert.equal(newlyDisabled.signals.length,0);
    const inactive=await collectLouisianaAlaskaGroceryProductionSource(config,bible,{...opts,lifecycleConfig:syntheticInactiveGroceryConfig('AK'),
      nowMs:now+29*60_000,fetchText:async()=>{throw new Error('Inactive cache admission attempted HTTP');}});
    assert.equal(inactive.signals.length,0);assert.equal(inactive.metadata.blockedByPromotion,true);
    const cacheFile=path.join(opts.cacheDir,'AK-grocery-production-cache.json'),cache=JSON.parse(await readFile(cacheFile,'utf8'));
    cache.cohortKey=louisianaAlaskaGroceryCohortKey('LA');await writeFile(cacheFile,JSON.stringify(cache));
    let refreshed=0;
    await collectLouisianaAlaskaGroceryProductionSource(config,bible,{...opts,nowMs:now+29*60_000,fetchText:mockedCompleteGroceryFetch('AK',()=>refreshed++)});
    assert.ok(refreshed>0);
    let expired=0;
    await collectLouisianaAlaskaGroceryProductionSource(config,bible,{...opts,nowMs:now+60*60_000,fetchText:mockedCompleteGroceryFetch('AK',()=>expired++)});
    assert.ok(expired>0);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('denial journal survives late abort and stops forced retries before HTTP or cache reuse',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'louisiana-alaska-production-denial-'));let calls=0;
  try{
    const opts=options(directory),controller=new AbortController();
    await collectLouisianaAlaskaGroceryProductionSource(config,bible,{...opts,fetchText:mockedCompleteGroceryFetch('AK')});
    const cachedBefore=await readFile(path.join(opts.cacheDir,'AK-grocery-production-cache.json'),'utf8');
    await assert.rejects(()=>collectLouisianaAlaskaGroceryProductionSource(config,bible,{...opts,forceLive:true,signal:controller.signal,
      fetchText:async url=>{calls++;controller.abort(new Error('late cancellation'));return{ok:false,status:403,url,text:''};}}),error=>error.status===403);
    const journal=JSON.parse(await readFile(path.join(opts.incidentDir,'AK-grocery-production-incidents.json'),'utf8'));
    assert.equal(journal['host:www.safeway.com'].httpStatus,403);assert.equal(calls,1);
    await assert.rejects(()=>collectLouisianaAlaskaGroceryProductionSource(config,bible,{...opts,forceLive:true,fetchText:async()=>{calls++;throw new Error('Forbidden retry');}}),error=>error.status===403&&error.details.requestCount===0);
    assert.equal(calls,1);assert.equal(await readFile(path.join(opts.cacheDir,'AK-grocery-production-cache.json'),'utf8'),cachedBefore);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('unwritable or malformed incident storage fails before HTTP and denial status survives a later journal write failure',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'louisiana-alaska-production-ledger-failure-'));let calls=0,writes=0;
  try{
    const opts=options(directory),fetchText=async url=>{calls++;return{ok:false,status:429,url,text:'',retryAfterSeconds:3600};};
    await assert.rejects(()=>collectLouisianaAlaskaGroceryProductionSource(config,bible,{...opts,fetchText,persistIncidentJournal:()=>{throw new Error('No durable journal');}}));
    assert.equal(calls,0);
    await assert.rejects(()=>collectLouisianaAlaskaGroceryProductionSource(config,bible,{...opts,fetchText,persistIncidentJournal:()=>{if(++writes>2){const error=new Error('Disk changed');error.code='EACCES';throw error;}}}),error=>error.status===429&&error.details.incidentWriteFailed);
    assert.equal(calls,1);
    await mkdir(opts.incidentDir,{recursive:true});await writeFile(path.join(opts.incidentDir,'AK-grocery-production-incidents.json'),'not JSON');
    await assert.rejects(()=>collectLouisianaAlaskaGroceryProductionSource(config,bible,{...opts,fetchText}));assert.equal(calls,1);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('parent budgets outlive bounded source budgets and failed cohorts cannot write usable inventory caches',async()=>{
  assert.equal(stateTimeoutMs({id:'LA'}),360_000);assert.equal(stateTimeoutMs({id:'AK'}),420_000);
  assert.ok(LOUISIANA_ALASKA_GROCERY_BUDGETS.LA.sourceMs<stateTimeoutMs({id:'LA'}));assert.ok(LOUISIANA_ALASKA_GROCERY_BUDGETS.AK.sourceMs<stateTimeoutMs({id:'AK'}));
  const directory=await mkdtemp(path.join(tmpdir(),'louisiana-alaska-production-incomplete-'));
  try{
    const opts=options(directory);
    await assert.rejects(()=>collectLouisianaAlaskaGroceryProductionSource(config,bible,{...opts,fetchText:async url=>({ok:true,status:200,url,text:'{}'})}),/complete reviewed cohort/);
    await assert.rejects(()=>readFile(path.join(opts.cacheDir,'AK-grocery-production-cache.json')),{code:'ENOENT'});
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('source cancellation stops the first request and cannot publish a late inventory cache',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'louisiana-alaska-production-timeout-'));let calls=0;
  try{
    const opts=options(directory);
    await assert.rejects(()=>collectLouisianaAlaskaGroceryProductionSource(config,bible,{...opts,timeoutMs:5,
      fetchText:async(_url,{signal})=>{calls++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}}),error=>error.name==='TimeoutError');
    assert.equal(calls,1);
    await assert.rejects(()=>readFile(path.join(opts.cacheDir,'AK-grocery-production-cache.json')),{code:'ENOENT'});
    assert.equal(JSON.parse(await readFile(path.join(opts.incidentDir,'AK-grocery-production-incidents.json'),'utf8'))['host:www.safeway.com'].status,'in_flight');
    let repeated=0;await assert.rejects(()=>collectLouisianaAlaskaGroceryProductionSource(config,bible,{...opts,forceLive:true,fetchText:async()=>{repeated++;throw Error('Interrupted request repeated');}}));assert.equal(repeated,0);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('the state report preserves a denied HTTP status and actual request count without fallback stock',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'louisiana-alaska-production-report-'));
  try{
    const opts=options(directory),report=await collectState(config,bible,{lifecycleConfig:opts.lifecycleConfig,
      promotionManifest:opts.promotionManifest,grocerySourceOptions:{...opts,fetchText:async url=>({ok:false,status:403,url,text:''})}});
    assert.equal(report.status,'blocked');assert.equal(report.signals.length,0);assert.equal(report.metadata.requestCount,1);
    assert.equal(report.roadblocks[0].status,403);assert.equal(report.sourceResults[0].error.status,403);
    assert.equal(report.sourceResults[0].attemptCount,1);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('malformed existing inventory storage blocks HTTP without replacing the file',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'louisiana-alaska-production-corrupt-cache-'));let calls=0;
  try{
    const opts=options(directory);await mkdir(opts.cacheDir,{recursive:true});
    const file=path.join(opts.cacheDir,'AK-grocery-production-cache.json');await writeFile(file,'invalid cached JSON');
    await assert.rejects(()=>collectLouisianaAlaskaGroceryProductionSource(config,bible,{...opts,fetchText:async()=>{calls++;throw new Error('Unexpected HTTP');}}));
    assert.equal(calls,0);assert.equal(await readFile(file,'utf8'),'invalid cached JSON');
  }finally{await rm(directory,{recursive:true,force:true});}
});


test('bounded requests fit unchanged source deadlines; forecast remains pending three actual hosted measurements',async()=>{
  for(const budget of Object.values(LOUISIANA_ALASKA_GROCERY_BUDGETS)){
    assert.ok(budget.maxRequests*budget.requestTimeoutMs+(budget.maxRequests-1)*budget.interRequestDelayMs<budget.sourceMs);
    assert.ok(budget.sourceMs<budget.stateMs);
  }
  const policy=STATE_LIFECYCLE_CONFIG.reliabilityPolicy;
  assert.equal(policy.stateExpectedRunMs.LA,undefined);
  assert.equal(policy.stateExpectedRunMs.AK,undefined);
  const preparation=JSON.parse(await readFile(new URL('../data/source-evidence/louisiana-alaska-grocery-production-20261029/preparation.json',import.meta.url),'utf8'));
  assert.equal(preparation.prospectiveCapacity.status,'pending_three_complete_hosted_source_runtimes');
  assert.equal(preparation.prospectiveCapacity.capacityAdmissionClaimed,false);
  assert.equal(preparation.prospectiveCapacity.forecastFormula,'ceil((2 * max(three qualifying hosted per-state runtimesMs)) / 30000) * 30000');
  const workflow=await readFile(new URL('../../.github/workflows/refresh-feed.yml',import.meta.url),'utf8'),steps=workflow.split(/\r?\n {6}- name:/),journal='engine/out/source-incidents/louisiana-alaska-grocery';
  const restore=steps.find(step=>step.includes('actions/cache/restore@v4')&&step.includes(journal)),save=steps.find(step=>step.includes('actions/cache/save@v4')&&step.includes(journal));
  assert.ok(restore&&save);assert.match(save,/if: always\(\)/);assert.equal(save.match(/\bkey: (.+)/)[1],restore.match(/\bkey: (.+)/)[1]);
});


test('explicit native store quantities retain exactness without enabling any alert path',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'louisiana-alaska-exact-quantity-'));
  try{
    const opts=options(directory),mocked=mockedCompleteGroceryFetch('AK');
    const result=await collectLouisianaAlaskaGroceryProductionSource(config,bible,{...opts,fetchText:async(url,options)=>{
      const response=await mocked(url,options);if(!url.includes('storeresolver')){const body=JSON.parse(response.text);for(const product of body.response.docs)product.channelInventory.instoreItemQty=4;response.text=JSON.stringify(body);}return response;
    }});
    assert.ok(result.signals.length>0);assert.ok(result.signals.every(row=>row.quantity===4&&row.quantityIsExact===true&&row.inventorySemantics==='exact_retailer_quantity'));
    assert.ok(result.signals.every(row=>row.alertable===false&&!row.canAlertAsInventory&&!row.canAlertAsWatch&&!row.eligibleForWatch&&!row.eligibleForDelivery&&!row.eligibleForEmail&&!row.eligibleForSms));
  }finally{await rm(directory,{recursive:true,force:true});}
});


test('production parsing and independent policy both reject generic Wild Turkey Kentucky as a Master expression',()=>{
  const excluded=fixture.excludedCase,source=LOUISIANA_ALASKA_GROCERY_SOURCES.find(row=>row.id===excluded.source.id),product=excluded.product,observedAt=new Date().toISOString();
  const inherited=parseBoundGroceryXapiInventory({response:{docs:[product]}},source,bible);
  assert.equal(inherited[0].record.canonical,'Wild Turkey Master','Captured inherited alias regression must remain exercised');
  assert.deepEqual(parseLouisianaAlaskaGroceryInventory({response:{docs:[product]}},source,bible,{observedAt}),[]);
  const legitimate=fixture.cases[0].products.map(row=>({...row,storeId:source.merchantId}));
  const row=parseLouisianaAlaskaGroceryInventory({response:{docs:legitimate}},source,bible,{observedAt})[0];assert.ok(row);
  const master=bible.records.find(record=>record.canonical==='Wild Turkey Master');
  const wrong={...row,productId:product.id,variantId:product.pid,rawName:product.name,canonicalName:master.canonical,canonicalBottleId:master.id,price:product.price,
    sourceUrl:'https://'+source.host+'/shop/product-details.'+product.id+'.html',
    sourceProductBinding:{...row.sourceProductBinding,productId:product.id,variantId:product.pid,rawName:product.name,canonicalBottleId:master.id,price:product.price,productSnapshot:product},
    raw:{...row.raw,product}};
  assert.equal(isLouisianaAlaskaGroceryInventory(wrong),false);
});
