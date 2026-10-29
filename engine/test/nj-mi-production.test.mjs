import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {BourbonBible} from '../src/core/bible.mjs';
import {collectState} from '../src/collectors/generic-state.mjs';
import {ALL_STATE_SOURCES} from '../src/state-sources.mjs';
import {STATE_LIFECYCLE_CONFIG} from '../src/state-lifecycle.mjs';
import {evaluateCapacityBudget} from '../src/reliability-policy.mjs';
import {stateTimeoutMs} from '../src/run.mjs';
import {collectNjMiCityHiveProductionSource,njMiProductionAllowed} from '../src/collectors/nj-mi-cityhive-production.mjs';
import {njMiProductionCohortKey,NJ_MI_PRODUCTION_BUDGETS} from '../src/nj-mi-production-config.mjs';
import {NJ_MI_PRODUCTION_COHORTS} from '../src/collectors/nj-mi-research-premises.mjs';
import {isNjMiProductionOnSiteSignal} from '../src/nj-mi-research-policy.mjs';
import {syntheticNjMiPromotion,mockedNjMiFetch,bibleFile} from './helpers/synthetic-nj-mi-production.mjs';
const bible=await BourbonBible.load(bibleFile),config=state=>ALL_STATE_SOURCES.find(source=>source.id===state);
async function setup(t,state='NJ'){
  const directory=await mkdtemp(path.join(tmpdir(),'central-production-'));assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  return{...syntheticNjMiPromotion(state),cacheDir:path.join(directory,'cache'),incidentDir:path.join(directory,'incidents'),cursorDir:path.join(directory,'cursor'),sleep:async()=>{}};
}

test('inactive, quarantined and altered semantic/cohort/provenance authority blocks before HTTP or cache I/O',async t=>{
  let requests=0;const fetchText=async()=>{requests++;throw Error('Unauthorized HTTP');};
  for(const state of ['NJ','MI']){
    const opts=await setup(t,state),held=await collectState(config(state),bible,{njMiSourceOptions:{forceLive:true,fetchText,cacheDir:'NUL/forbidden',incidentDir:'NUL/forbidden'}});
    assert.equal(held.status,'not_promoted');assert.equal(held.metadata.requestCount,0);
    assert.equal(njMiProductionCohortKey(state),NJ_MI_PRODUCTION_COHORTS[state]);
    assert.ok(njMiProductionAllowed(state,opts.lifecycleConfig,{manifest:opts.promotionManifest}));
    for(const mutate of [o=>{o.lifecycleConfig.activeStates=o.lifecycleConfig.activeStates.filter(id=>id!==state);},
      o=>o.lifecycleConfig.states[state].inventoryAlertable=true,o=>o.lifecycleConfig.states[state].promotionStage='canary',
      o=>o.promotionManifest.collector.cohortSha256='0'.repeat(64),o=>o.promotionManifest.sourceSemantics.availability='Changed source semantics',
      o=>delete o.lifecycleConfig.states[state].promotionEvidence.immutableEvidence,
      o=>o.promotionManifest.evidence.immutablePromotionEvidence.provenance.artifactDigest='0'.repeat(64)]){
      const changed=structuredClone({lifecycleConfig:opts.lifecycleConfig,promotionManifest:opts.promotionManifest});mutate(changed);
      const result=await collectNjMiCityHiveProductionSource(config(state),bible,{...changed,fetchText,cacheDir:'NUL/forbidden',incidentDir:'NUL/forbidden'});
      assert.equal(result.metadata.blockedByPromotion,true);
    }
    for(const env of [{BOURBON_SIGNAL_DISABLED_STATES:state},{BOURBON_SIGNAL_QUARANTINED_STATES:state}])assert.equal(njMiProductionAllowed(state,opts.lifecycleConfig,{manifest:opts.promotionManifest,env}),false);
  }
  assert.equal(requests,0);assert.ok(!STATE_LIFECYCLE_CONFIG.activeStates.includes('NJ')&&!STATE_LIFECYCLE_CONFIG.activeStates.includes('MI'));
});

for(const state of ['NJ','MI'])test(`${state} nonpreview production rows/cache preserve original clocks/current library and never enable delivery`,async t=>{
  const opts=await setup(t,state),now=Date.now();let calls=0;
  const result=await collectNjMiCityHiveProductionSource(config(state),bible,{...opts,nowMs:now,fetchText:mockedNjMiFetch(()=>calls++)});
  assert.equal(calls,state==='NJ'?4:1);assert.ok(result.signals.length>0);
  assert.ok(result.signals.every(row=>isNjMiProductionOnSiteSignal(row)&&!Object.hasOwn(row,'previewOnly')));
  const clock=result.signals[0].observedAt;
  const cached=await collectNjMiCityHiveProductionSource(config(state),bible,{...opts,nowMs:now+29*60_000,fetchText:async()=>{throw Error('Fresh cache requested HTTP');}});
  assert.equal(cached.signals[0].observedAt,clock);assert.equal(cached.accounting.requestCount,0);
  const disabled=new BourbonBible(structuredClone(bible.records).map(record=>({...record,libraryAlertEligible:false})));
  assert.equal((await collectNjMiCityHiveProductionSource(config(state),disabled,{...opts,nowMs:now+29*60_000,fetchText:async()=>{throw Error('Library filter must not fetch');}})).signals.length,0);
  const aborted=new AbortController();aborted.abort(Error('cancelled cache'));
  await assert.rejects(()=>collectNjMiCityHiveProductionSource(config(state),bible,{...opts,signal:aborted.signal}),/cancelled cache/);
  const file=path.join(opts.cacheDir,state+'.json'),cache=JSON.parse(await readFile(file,'utf8'));cache.cohortKey='0'.repeat(64);await writeFile(file,JSON.stringify(cache));
  let refreshed=0;await collectNjMiCityHiveProductionSource(config(state),bible,{...opts,fetchText:mockedNjMiFetch(()=>refreshed++)});assert.ok(refreshed>0);
  assert.equal(JSON.parse(await readFile(path.join(opts.incidentDir,state+'.json'),'utf8')).inFlight,null);
});

for(const status of [401,403,429,435])test(`HTTP${status} denial survives cancellation, missing stock cache and forced retry`,async t=>{
  const opts=await setup(t),now=Date.now(),controller=new AbortController();let calls=0;
  await collectNjMiCityHiveProductionSource(config('NJ'),bible,{...opts,nowMs:now,fetchText:mockedNjMiFetch()});
  const file=path.join(opts.cacheDir,'NJ.json'),before=await readFile(file,'utf8');
  await assert.rejects(()=>collectNjMiCityHiveProductionSource(config('NJ'),bible,{...opts,forceLive:true,nowMs:now,signal:controller.signal,
    fetchText:async url=>{calls++;controller.abort(Error('late parent cancellation'));return{ok:false,status,url,text:'',retryAfterSeconds:status===429?3*86400:0};}}),error=>error.status===status);
  assert.equal(calls,1);assert.equal(await readFile(file,'utf8'),before);
  const journal=JSON.parse(await readFile(path.join(opts.incidentDir,'NJ.json'),'utf8')),entry=journal.hosts['garyswine.com'];
  assert.equal(journal.inFlight,null);assert.equal(entry.httpStatus,status);
  assert.ok(Date.parse(entry.nextAllowedAt)-Date.parse(entry.lastAttemptAt)>=(status===429?3:1)*86400_000);
  await rm(file);
  await assert.rejects(()=>collectNjMiCityHiveProductionSource(config('NJ'),bible,{...opts,forceLive:true,fetchText:()=>{calls++;throw Error('Forbidden denied host retry');}}),error=>error.status===status&&error.details.requestCount===0);
  assert.equal(calls,1);
});

test('real incident rename failure leaves a durable unresolved latch and no late inventory mutation',async t=>{
  const opts=await setup(t);let calls=0;
  await collectNjMiCityHiveProductionSource(config('NJ'),bible,{...opts,fetchText:mockedNjMiFetch()});
  const stock=path.join(opts.cacheDir,'NJ.json'),before=await readFile(stock,'utf8'),journal=path.join(opts.incidentDir,'NJ.json'),held=journal+'.held';
  await assert.rejects(()=>collectNjMiCityHiveProductionSource(config('NJ'),bible,{...opts,forceLive:true,fetchText:async url=>{
    calls++;await rename(journal,held);await mkdir(journal);return{ok:false,status:403,url,text:''};
  }}),error=>error.status===403&&error.details.incidentWriteFailed&&error.details.unresolvedAttempt);
  assert.equal(await readFile(stock,'utf8'),before);assert.ok(JSON.parse(await readFile(held,'utf8')).inFlight);
  await assert.rejects(()=>collectNjMiCityHiveProductionSource(config('NJ'),bible,{...opts,forceLive:true,fetchText:()=>{calls++;throw Error('Forbidden journal retry');}}));
  await rm(journal,{recursive:true});await rename(held,journal);
  await assert.rejects(()=>collectNjMiCityHiveProductionSource(config('NJ'),bible,{...opts,forceLive:true,fetchText:()=>{calls++;throw Error('Unresolved attempt retried');}}),error=>error.code==='CITYHIVE_UNRESOLVED_ATTEMPT');
  assert.equal(calls,1);
});

test('malformed/unwritable journals block HTTP and incomplete/redirected premises cannot write inventory',async t=>{
  const opts=await setup(t);let calls=0;
  await mkdir(opts.incidentDir,{recursive:true});const file=path.join(opts.incidentDir,'NJ.json');await writeFile(file,'corrupt');
  await assert.rejects(()=>collectNjMiCityHiveProductionSource(config('NJ'),bible,{...opts,fetchText:()=>calls++}));assert.equal(calls,0);
  await rm(file);await assert.rejects(()=>collectNjMiCityHiveProductionSource(config('NJ'),bible,{...opts,persistIncidentJournal:()=>{throw Error('read-only journal');},fetchText:()=>calls++}));assert.equal(calls,0);
  await assert.rejects(()=>collectNjMiCityHiveProductionSource(config('NJ'),bible,{...opts,fetchText:mockedNjMiFetch(()=>calls++,(json)=>json.merchant_configs=[])}),/complete reviewed cohort/);
  await assert.rejects(()=>readFile(path.join(opts.cacheDir,'NJ.json')),{code:'ENOENT'});
  await assert.rejects(()=>collectNjMiCityHiveProductionSource(config('NJ'),bible,{...opts,fetchText:async()=>({ok:true,status:200,url:'https://foreign.invalid',text:'{}'})}),/redirected/);
});

test('complete negative observations remain healthy, while source failures retain their HTTP status/request count',async t=>{
  const opts=await setup(t);
  const report=await collectState(config('NJ'),bible,{lifecycleConfig:opts.lifecycleConfig,promotionManifest:opts.promotionManifest,njMiSourceOptions:{...opts,fetchText:mockedNjMiFetch(()=>{},json=>{for(const product of json.products)for(const merchant of product.merchants||[])for(const option of merchant.product_options||[])option.quantity=0;})}});
  assert.equal(report.status,'monitored_no_current_inventory');assert.equal(report.signals.length,0);assert.equal(report.sourceResults[0].recordsInspected,4);
  const failed=await collectState(config('NJ'),bible,{lifecycleConfig:opts.lifecycleConfig,promotionManifest:opts.promotionManifest,njMiSourceOptions:{...opts,forceLive:true,fetchText:async url=>({ok:false,status:403,url,text:''})}});
  assert.equal(failed.status,'blocked');assert.equal(failed.sourceResults[0].error.status,403);assert.equal(failed.metadata.requestCount,1);assert.equal(failed.signals.length,0);
});

test('source deadlines fit parent watchdogs and denial cache saves independently after publication failure',async()=>{
  for(const state of ['NJ','MI']){const b=NJ_MI_PRODUCTION_BUDGETS[state];assert.ok(b.sourceMs<stateTimeoutMs({id:state}));assert.equal(b.stateMs,stateTimeoutMs({id:state}));assert.ok(b.maxRequests*10_000+b.maxRequests*1000<=b.sourceMs);}
  const workflow=await readFile(new URL('../../.github/workflows/refresh-feed.yml',import.meta.url),'utf8');
  const steps=workflow.split(/\r?\n {6}- name:/),file='engine/out/source-incidents/nj-mi-cityhive';
  const restore=steps.find(step=>step.includes('actions/cache/restore@v4')&&step.includes(file));
  const save=steps.find(step=>step.includes('actions/cache/save@v4')&&step.includes(file));
  assert.ok(restore&&save);assert.match(save,/if: always\(\)/);assert.equal(save.match(/\bkey: (.+)/)[1],restore.match(/\bkey: (.+)/)[1]);
  const policy=STATE_LIFECYCLE_CONFIG.reliabilityPolicy;
  const expected=STATE_LIFECYCLE_CONFIG.activeStates.map(state=>policy.stateExpectedRunMs[state]||policy.defaultExpectedStateRunMs);
  const capacity=evaluateCapacityBudget({stateExpectedRunMs:expected,
    concurrency:policy.workerConcurrency,intervalMs:policy.refreshIntervalMs,safetyMarginMs:policy.refreshSafetyMarginMs});
  assert.equal(capacity.ok,true,'The actual selected active fleet must retain its reviewed planning budget; inactive NJ/MI cannot consume phantom workers');
});

test('a late successful HTTP response after parent cancellation cannot publish inventory or start another request',async t=>{
  const opts=await setup(t),controller=new AbortController();let calls=0;const transport=mockedNjMiFetch();
  await assert.rejects(()=>collectNjMiCityHiveProductionSource(config('NJ'),bible,{...opts,signal:controller.signal,fetchText:async url=>{
    calls++;controller.abort(new DOMException('Parent deadline reached','TimeoutError'));await new Promise(resolve=>setTimeout(resolve,20));return transport(url);
  }}),error=>error.name==='TimeoutError');
  assert.equal(calls,1);await assert.rejects(()=>readFile(path.join(opts.cacheDir,'NJ.json')),{code:'ENOENT'});
  assert.equal(JSON.parse(await readFile(path.join(opts.incidentDir,'NJ.json'),'utf8')).inFlight,null);
});

test('the native HTTP boundary journals denied headers and Retry-After before body reads despite parent abort',async t=>{
  const nativeFetch=globalThis.fetch;t.after(()=>{globalThis.fetch=nativeFetch;});
  for(const status of [401,403,429,435]){
    const opts=await setup(t),controller=new AbortController();let requests=0,cancelled=0;
    globalThis.fetch=async(url,request)=>{
      requests++;assert.equal(request.redirect,'error');controller.abort(Error('Parent aborted after response headers'));
      return{ok:false,status,url,headers:new Headers({'retry-after':'259200'}),body:{cancel:async()=>{
        cancelled++;const journal=JSON.parse(await readFile(path.join(opts.incidentDir,'NJ.json'),'utf8'));
        assert.equal(journal.hosts['garyswine.com'].httpStatus,status,'denial must persist before cancellation touches the body');
      }},text:async()=>{throw Error('Denied response body must not be read');}};
    };
    await assert.rejects(()=>collectNjMiCityHiveProductionSource(config('NJ'),bible,{...opts,signal:controller.signal}),error=>error.status===status);
    assert.equal(requests,1);assert.equal(cancelled,1);
    const journal=JSON.parse(await readFile(path.join(opts.incidentDir,'NJ.json'),'utf8')),incident=journal.hosts['garyswine.com'];
    assert.ok(Date.parse(incident.nextAllowedAt)-Date.parse(incident.lastAttemptAt)>=3*86_400_000);
    assert.equal(journal.inFlight,null);
    await assert.rejects(()=>collectNjMiCityHiveProductionSource(config('NJ'),bible,{...opts,forceLive:true}),error=>error.status===status&&error.details.requestCount===0);
    assert.equal(requests,1);
  }
});
