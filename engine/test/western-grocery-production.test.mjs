import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {BourbonBible} from '../src/core/bible.mjs';
import {collectState} from '../src/collectors/generic-state.mjs';
import {ALL_STATE_SOURCES} from '../src/state-sources.mjs';
import {STATE_LIFECYCLE_CONFIG} from '../src/state-lifecycle.mjs';
import {stateTimeoutMs} from '../src/run.mjs';
import {WESTERN_GROCERY_BUDGETS,westernGroceryCohortKey} from '../src/western-grocery-production-config.mjs';
import {collectWesternGroceryProductionSource,westernGroceryPromotionAllowed,westernGrocerySourceConfigHash} from '../src/collectors/western-grocery-production.mjs';
import {fixture,syntheticPromotedGroceryConfig,syntheticPromotionManifest,syntheticInactiveGroceryConfig,mockedCompleteGroceryFetch} from './helpers/synthetic-grocery-promotion.mjs';
const bible=new BourbonBible(fixture.records),config=ALL_STATE_SOURCES.find(source=>source.id==='NM');
const options=directory=>{const lifecycleConfig=syntheticPromotedGroceryConfig();return{cacheDir:path.join(directory,'cache'),incidentDir:path.join(directory,'incidents'),cursorDir:path.join(directory,'cursor'),sleep:async()=>{},lifecycleConfig,promotionManifest:syntheticPromotionManifest('NM',lifecycleConfig)};};

test('inactive, incomplete, changed, disabled and quarantined promotion authority makes zero HTTP requests',async()=>{
  let requests=0;const fetchText=async()=>{requests++;throw new Error('Forbidden pre-promotion HTTP');};
  for(const state of ['WA','NM']){
    const source=ALL_STATE_SOURCES.find(row=>row.id===state),report=await collectState(source,bible,{lifecycleConfig:syntheticInactiveGroceryConfig(state),fetcher:fetchText,grocerySourceOptions:{fetchText}});
    assert.equal(report.status,'not_promoted');assert.equal(report.signals.length,0);assert.equal(report.sourceResults.length,0);
    const active=syntheticPromotedGroceryConfig(state);assert.equal(westernGroceryPromotionAllowed(state,active),false,'A synthetic authority must not match the actual immutable manifest');assert.equal(westernGroceryPromotionAllowed(state,active,{manifest:syntheticPromotionManifest(state,active)}),true);
    for(const mutate of [row=>delete row.states[state].promotionEvidence,row=>{row.states[state].promotionStage='research';},
      row=>{row.states[state].inventoryAlertable=true;},row=>{row.states[state].promotionEvidence.immutableEvidence.sourceConfigHash='0'.repeat(64);}]){
      const changed=structuredClone(active);mutate(changed);
      const held=await collectWesternGroceryProductionSource(source,bible,{lifecycleConfig:changed,promotionManifest:syntheticPromotionManifest(state,active),fetchText});
      assert.equal(held.metadata.blockedByPromotion,true);
    }
    for(const mutate of [o=>{o.promotionManifest.lifecycle.publicStatus='research_only';},o=>{o.promotionManifest.lifecycle.refinementLevel='state';},
      o=>{const p=o.lifecycleConfig.states[state].promotionEvidence.immutableEvidence.provenance;p.repository='foreign/repository';p.workflowRunUrl='https://github.com/foreign/repository/actions/runs/1';}]){
      const changed={lifecycleConfig:structuredClone(active),promotionManifest:syntheticPromotionManifest(state,active)};mutate(changed);
      changed.lifecycleConfig.states[state].promotionEvidence.immutableEvidence.sourceConfigHash=westernGrocerySourceConfigHash(state,changed.promotionManifest);
      changed.promotionManifest.evidence.immutablePromotionEvidence=structuredClone(changed.lifecycleConfig.states[state].promotionEvidence.immutableEvidence);
      assert.equal(westernGroceryPromotionAllowed(state,changed.lifecycleConfig,{manifest:changed.promotionManifest}),false);
      const held=await collectWesternGroceryProductionSource(source,bible,{...changed,fetchText,cacheDir:'NUL/forbidden',incidentDir:'NUL/forbidden'});assert.equal(held.metadata.blockedByPromotion,true);
    }
    for(const env of [{BOURBON_SIGNAL_DISABLED_STATES:state},{BOURBON_SIGNAL_QUARANTINED_STATES:state}]){
      assert.equal(westernGroceryPromotionAllowed(state,active,{env,manifest:syntheticPromotionManifest(state,active)}),false);
    }
  }
  assert.equal(requests,0);
});

test('complete cohort cache preserves original clocks, stays on-site only, rejects old cohorts and expires after30minutes',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'western-production-cache-'));
  try{
    const opts=options(directory),now=Date.now();let requests=0;
    const result=await collectWesternGroceryProductionSource(config,bible,{...opts,nowMs:now,fetchText:mockedCompleteGroceryFetch('NM',()=>requests++)});
    assert.equal(result.metadata.complete,true);assert.ok(result.signals.length>0);assert.ok(requests>=35&&requests<=43);
    assert.ok(result.signals.every(row=>row.quantity===0&&row.quantityIsExact===false&&row.eligibleForOnSite
      &&!row.canAlertAsInventory&&!row.canAlertAsWatch&&!row.eligibleForWatch&&!row.eligibleForDelivery&&!row.eligibleForEmail&&!row.eligibleForSms));
    const clock=result.signals[0].observedAt;
    const again=await collectWesternGroceryProductionSource(config,bible,{...opts,nowMs:now+29*60_000,fetchText:async()=>{throw new Error('Fresh cache requested HTTP');}});
    assert.equal(again.signals[0].observedAt,clock);assert.equal(again.accounting.requestCount,0);assert.equal(again.metadata.cacheReused,true);
    assert.equal(again.metadata.sourceObservedAt,clock);
    const cancelled=new AbortController();cancelled.abort(new Error('cancelled before cache admission'));
    await assert.rejects(()=>collectWesternGroceryProductionSource(config,bible,{...opts,nowMs:now+29*60_000,signal:cancelled.signal,
      fetchText:async()=>{throw new Error('Cancelled cache requested HTTP');}}),/cancelled before cache admission/);
    const disabledBible=new BourbonBible(fixture.records.map(record=>({...record,libraryAlertEligible:false})));
    const newlyDisabled=await collectWesternGroceryProductionSource(config,disabledBible,{...opts,nowMs:now+29*60_000,
      fetchText:async()=>{throw new Error('Current library eligibility should filter the existing source observation');}});
    assert.equal(newlyDisabled.accounting.requestCount,0);assert.equal(newlyDisabled.signals.length,0);
    const inactive=await collectWesternGroceryProductionSource(config,bible,{...opts,lifecycleConfig:syntheticInactiveGroceryConfig('NM'),
      nowMs:now+29*60_000,fetchText:async()=>{throw new Error('Inactive cache admission attempted HTTP');}});
    assert.equal(inactive.signals.length,0);assert.equal(inactive.metadata.blockedByPromotion,true);
    const cacheFile=path.join(opts.cacheDir,'NM-grocery-production-cache.json'),cache=JSON.parse(await readFile(cacheFile,'utf8'));
    cache.cohortKey=westernGroceryCohortKey('WA');await writeFile(cacheFile,JSON.stringify(cache));
    let refreshed=0;
    await collectWesternGroceryProductionSource(config,bible,{...opts,nowMs:now+29*60_000,fetchText:mockedCompleteGroceryFetch('NM',()=>refreshed++)});
    assert.ok(refreshed>0);
    let expired=0;
    await collectWesternGroceryProductionSource(config,bible,{...opts,nowMs:now+60*60_000,fetchText:mockedCompleteGroceryFetch('NM',()=>expired++)});
    assert.ok(expired>0);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('denial journal survives late abort and stops forced retries before HTTP or cache reuse',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'western-production-denial-'));let calls=0;
  try{
    const opts=options(directory),controller=new AbortController();
    await assert.rejects(()=>collectWesternGroceryProductionSource(config,bible,{...opts,forceLive:true,signal:controller.signal,
      fetchText:async url=>{calls++;controller.abort(new Error('late cancellation'));return{ok:false,status:403,url,text:''};}}),error=>error.status===403);
    const journal=JSON.parse(await readFile(path.join(opts.incidentDir,'NM-grocery-production-incidents.json'),'utf8'));
    assert.equal(journal.hosts['www.safeway.com'].httpStatus,403);assert.equal(journal.inFlight,null);assert.equal(calls,1);
    await assert.rejects(()=>collectWesternGroceryProductionSource(config,bible,{...opts,forceLive:true,fetchText:async()=>{calls++;throw new Error('Forbidden retry');}}),error=>error.status===403&&error.details.requestCount===0);
    assert.equal(calls,1);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('unwritable or malformed incident storage fails before HTTP and denial status survives a later journal write failure',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'western-production-ledger-failure-'));let calls=0,writes=0;
  try{
    const opts=options(directory),fetchText=async url=>{calls++;return{ok:false,status:429,url,text:'',retryAfterSeconds:3600};};
    await assert.rejects(()=>collectWesternGroceryProductionSource(config,bible,{...opts,fetchText,persistIncidentJournal:()=>{throw new Error('No durable journal');}}));
    assert.equal(calls,0);
    await assert.rejects(()=>collectWesternGroceryProductionSource(config,bible,{...opts,fetchText,persistIncidentJournal:()=>{if(++writes>2){const error=new Error('Disk changed');error.code='EACCES';throw error;}}}),error=>error.status===429&&error.details.incidentWriteFailed);
    assert.equal(calls,1);
    await mkdir(opts.incidentDir,{recursive:true});await writeFile(path.join(opts.incidentDir,'NM-grocery-production-incidents.json'),'not JSON');
    await assert.rejects(()=>collectWesternGroceryProductionSource(config,bible,{...opts,fetchText}));assert.equal(calls,1);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('parent budgets outlive bounded source budgets and failed cohorts cannot write usable inventory caches',async()=>{
  assert.equal(stateTimeoutMs({id:'WA'}),720_000);assert.equal(stateTimeoutMs({id:'NM'}),300_000);
  assert.ok(WESTERN_GROCERY_BUDGETS.WA.sourceMs<stateTimeoutMs({id:'WA'}));assert.ok(WESTERN_GROCERY_BUDGETS.NM.sourceMs<stateTimeoutMs({id:'NM'}));
  const directory=await mkdtemp(path.join(tmpdir(),'western-production-incomplete-'));
  try{
    const opts=options(directory);
    await assert.rejects(()=>collectWesternGroceryProductionSource(config,bible,{...opts,fetchText:async url=>({ok:true,status:200,url,text:'{}'})}),/complete reviewed cohort/);
    await assert.rejects(()=>readFile(path.join(opts.cacheDir,'NM-grocery-production-cache.json')),{code:'ENOENT'});
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('source cancellation stops the first request and cannot publish a late inventory cache',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'western-production-timeout-'));let calls=0;
  try{
    const opts=options(directory);
    await assert.rejects(()=>collectWesternGroceryProductionSource(config,bible,{...opts,timeoutMs:5,
      fetchText:async(_url,{signal})=>{calls++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}}),error=>error.name==='TimeoutError');
    assert.equal(calls,1);
    await assert.rejects(()=>readFile(path.join(opts.cacheDir,'NM-grocery-production-cache.json')),{code:'ENOENT'});
    assert.deepEqual(JSON.parse(await readFile(path.join(opts.incidentDir,'NM-grocery-production-incidents.json'),'utf8')),{schemaVersion:1,state:'NM',hosts:{},inFlight:null});
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('the state report preserves a denied HTTP status and actual request count without fallback stock',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'western-production-report-'));
  try{
    const opts=options(directory),report=await collectState(config,bible,{lifecycleConfig:opts.lifecycleConfig,
      promotionManifest:opts.promotionManifest,grocerySourceOptions:{...opts,fetchText:async url=>({ok:false,status:403,url,text:''})}});
    assert.equal(report.status,'blocked');assert.equal(report.signals.length,0);assert.equal(report.metadata.requestCount,1);
    assert.equal(report.roadblocks[0].status,403);assert.equal(report.sourceResults[0].error.status,403);
    assert.equal(report.sourceResults[0].attemptCount,1);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('malformed existing inventory storage blocks HTTP without replacing the file',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'western-production-corrupt-cache-'));let calls=0;
  try{
    const opts=options(directory);await mkdir(opts.cacheDir,{recursive:true});
    const file=path.join(opts.cacheDir,'NM-grocery-production-cache.json');await writeFile(file,'invalid cached JSON');
    await assert.rejects(()=>collectWesternGroceryProductionSource(config,bible,{...opts,fetchText:async()=>{calls++;throw new Error('Unexpected HTTP');}}));
    assert.equal(calls,0);assert.equal(await readFile(file,'utf8'),'invalid cached JSON');
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('native grocery response headers persist denial and long Retry-After before body/parent abort, including cold cache',async t=>{
  const native=globalThis.fetch;t.after(()=>{globalThis.fetch=native;});
  for(const status of [401,403,429,435]){
    const directory=await mkdtemp(path.join(tmpdir(),'grocery-native-denial-'));assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));
    try{
      const opts=options(directory),cache=path.join(opts.cacheDir,'NM-grocery-production-cache.json'),file=path.join(opts.incidentDir,'NM-grocery-production-incidents.json');
      await collectWesternGroceryProductionSource(config,bible,{...opts,fetchText:mockedCompleteGroceryFetch()});const original=await readFile(cache,'utf8');
      const controller=new AbortController();let calls=0,beforeBody=false;
      globalThis.fetch=async(url,request)=>{calls++;assert.equal(request.redirect,'error');assert.ok(request.headers['ocp-apim-subscription-key']);controller.abort(Error('Parent aborted after headers'));
        return{ok:false,status,url,headers:new Headers({'retry-after':'259200'}),body:{cancel:async()=>{
          const value=await readFile(file,'utf8').then(JSON.parse).catch(()=>null);beforeBody=value?.hosts?.['www.safeway.com']?.httpStatus===status;
        }},text:async()=>{throw Error('Denied body must not be read');}};};
      await assert.rejects(()=>collectWesternGroceryProductionSource(config,bible,{...opts,forceLive:true,signal:controller.signal}),error=>error.status===status&&error.details.incidentPersisted);
      assert.equal(calls,1);assert.equal(beforeBody,true);assert.equal(await readFile(cache,'utf8'),original);
      const journal=JSON.parse(await readFile(file,'utf8')),entry=journal.hosts['www.safeway.com'];assert.equal(journal.inFlight,null);
      assert.ok(Date.parse(entry.nextAllowedAt)-Date.parse(entry.lastAttemptAt)>=3*86_400_000);
      await rm(cache);await assert.rejects(()=>collectWesternGroceryProductionSource(config,bible,{...opts,forceLive:true}),error=>error.status===status&&error.details.requestCount===0);assert.equal(calls,1);
    }finally{await rm(directory,{recursive:true,force:true});}
  }
});

test('real grocery denial rename failure preserves durable unresolved latch across missing inventory cache and force',async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),'grocery-native-write-failure-'));assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));
  const native=globalThis.fetch;t.after(()=>{globalThis.fetch=native;});
  try{
    const opts=options(directory),cache=path.join(opts.cacheDir,'NM-grocery-production-cache.json'),file=path.join(opts.incidentDir,'NM-grocery-production-incidents.json');
    await collectWesternGroceryProductionSource(config,bible,{...opts,fetchText:mockedCompleteGroceryFetch()});const original=await readFile(cache,'utf8');let calls=0;
    globalThis.fetch=async url=>{calls++;assert.ok(JSON.parse(await readFile(file,'utf8')).inFlight);await rename(file,file+'.held');await mkdir(file);
      return{ok:false,status:429,url,headers:new Headers({'retry-after':'259200'}),body:{cancel:async()=>{}}};};
    await assert.rejects(()=>collectWesternGroceryProductionSource(config,bible,{...opts,forceLive:true}),error=>error.status===429&&error.details.incidentWriteFailed&&error.details.unresolvedAttempt);
    assert.equal(await readFile(cache,'utf8'),original);await rm(cache);
    await assert.rejects(()=>collectWesternGroceryProductionSource(config,bible,{...opts,forceLive:true}));assert.equal(calls,1);
    await rm(file,{recursive:true});await rename(file+'.held',file);
    await assert.rejects(()=>collectWesternGroceryProductionSource(config,bible,{...opts,forceLive:true}),error=>error.code==='GROCERY_UNRESOLVED_ATTEMPT');assert.equal(calls,1);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('legacy grocery host denials survive migration and semantic-null journals fail before HTTP',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'grocery-legacy-denial-'));assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));let calls=0;
  try{
    const opts=options(directory),file=path.join(opts.incidentDir,'NM-grocery-production-incidents.json'),at=Date.now();await mkdir(opts.incidentDir,{recursive:true});
    const fetchText=async()=>{calls++;throw Error('Must not fetch');};
    await writeFile(file,JSON.stringify({'host:www.safeway.com':{status:'access_denied',httpStatus:403,lastAttemptAt:new Date(at).toISOString(),nextAllowedAt:new Date(at+3*86_400_000).toISOString()}}));
    await assert.rejects(()=>collectWesternGroceryProductionSource(config,bible,{...opts,fetchText,forceLive:true}),error=>error.status===403);assert.equal(calls,0);
    await writeFile(file,'null');await assert.rejects(()=>collectWesternGroceryProductionSource(config,bible,{...opts,fetchText}),/must be an object/);assert.equal(calls,0);
  }finally{await rm(directory,{recursive:true,force:true});}
});
