import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {BourbonBible} from '../src/core/bible.mjs';
import {collectState} from '../src/collectors/generic-state.mjs';
import {ALL_STATE_SOURCES} from '../src/state-sources.mjs';
import {STATE_LIFECYCLE_CONFIG} from '../src/state-lifecycle.mjs';
import {evaluateCapacityBudget} from '../src/reliability-policy.mjs';
import {stateTimeoutMs} from '../src/run.mjs';
import {collectCentralCityHiveProductionSource,centralCityHiveProductionAllowed} from '../src/collectors/central-cityhive-production.mjs';
import {centralCityHiveProductionCohortKey,CENTRAL_CITYHIVE_PRODUCTION_BUDGETS,CENTRAL_CITYHIVE_PRODUCTION_STATES} from '../src/central-cityhive-production-config.mjs';
import {CENTRAL_CITYHIVE_PRODUCTION_COHORTS,CENTRAL_CITYHIVE_PRODUCTION_SOURCES} from '../src/collectors/central-cityhive-premises.mjs';
import {isCentralCityHiveProductionOnSiteSignal} from '../src/central-cityhive-policy.mjs';
import {canonicalizeSignal} from '../src/operational-report.mjs';
import {bibleLookup,buildDrops} from '../src/export-site-contract.mjs';
import {syntheticCentralPromotion,mockedCentralFetch,bibleFile} from './helpers/synthetic-central-production.mjs';
const bible=await BourbonBible.load(bibleFile),config=state=>ALL_STATE_SOURCES.find(source=>source.id===state);
async function setup(t,state='WI'){
  const directory=await mkdtemp(path.join(tmpdir(),'central-production-'));assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  return{...syntheticCentralPromotion(state),cacheDir:path.join(directory,'cache'),incidentDir:path.join(directory,'incidents'),cursorDir:path.join(directory,'cursor'),sleep:async()=>{}};
}

test('inactive, quarantined and altered semantic/cohort/provenance authority blocks before HTTP or cache I/O',async t=>{
  let requests=0;const fetchText=async()=>{requests++;throw Error('Unauthorized HTTP');};
  for(const state of ['WI','OK','RI']){
    const inactive=structuredClone(STATE_LIFECYCLE_CONFIG);
    inactive.activeStates=inactive.activeStates.filter(id=>id!==state);
    inactive.states[state]={...inactive.states[state],publicStatus:'research_only'};
    const opts=await setup(t,state),held=await collectState(config(state),bible,{lifecycleConfig:inactive,cityHiveSourceOptions:{fetchText,cacheDir:'NUL/forbidden',incidentDir:'NUL/forbidden'}});
    assert.equal(held.status,'not_promoted');assert.equal(held.metadata.requestCount,0);
    assert.equal(centralCityHiveProductionCohortKey(state),CENTRAL_CITYHIVE_PRODUCTION_COHORTS[state]);
    assert.ok(centralCityHiveProductionAllowed(state,opts.lifecycleConfig,{manifest:opts.promotionManifest}));
    for(const mutate of [o=>{o.lifecycleConfig.activeStates=o.lifecycleConfig.activeStates.filter(id=>id!==state);},
      o=>o.lifecycleConfig.states[state].inventoryAlertable=true,o=>o.lifecycleConfig.states[state].promotionStage='canary',
      o=>o.promotionManifest.collector.cohortSha256='0'.repeat(64),o=>o.promotionManifest.sourceSemantics.availability='Changed source semantics',
      o=>delete o.lifecycleConfig.states[state].promotionEvidence.immutableEvidence,
      o=>o.promotionManifest.evidence.immutablePromotionEvidence.provenance.artifactDigest='0'.repeat(64)]){
      const changed=structuredClone({lifecycleConfig:opts.lifecycleConfig,promotionManifest:opts.promotionManifest});mutate(changed);
      const result=await collectCentralCityHiveProductionSource(config(state),bible,{...changed,fetchText,cacheDir:'NUL/forbidden',incidentDir:'NUL/forbidden'});
      assert.equal(result.metadata.blockedByPromotion,true);
    }
    for(const env of [{BOURBON_SIGNAL_DISABLED_STATES:state},{BOURBON_SIGNAL_QUARANTINED_STATES:state}])assert.equal(centralCityHiveProductionAllowed(state,opts.lifecycleConfig,{manifest:opts.promotionManifest,env}),false);
  }
  assert.equal(requests,0);
});

test('KS activation is exact, silent, and still blocks when disabled or lifecycle is removed',async t=>{
  let requests=0;
  assert.ok(CENTRAL_CITYHIVE_PRODUCTION_STATES.includes('KS'));
  assert.equal(CENTRAL_CITYHIVE_PRODUCTION_SOURCES.filter(source=>source.state==='KS').length,3);
  assert.equal(centralCityHiveProductionCohortKey('KS'),CENTRAL_CITYHIVE_PRODUCTION_COHORTS.KS);
  assert.equal(centralCityHiveProductionAllowed('KS',STATE_LIFECYCLE_CONFIG),true);
  assert.equal(STATE_LIFECYCLE_CONFIG.activeStates.at(-1),'KS');
  assert.equal(STATE_LIFECYCLE_CONFIG.reliabilityPolicy.stateExpectedRunMs.KS,15_000);
  const inactive=structuredClone(STATE_LIFECYCLE_CONFIG);
  inactive.activeStates=inactive.activeStates.filter(id=>id!=='KS');
  inactive.states.KS.publicStatus='research_only';
  const held=await collectCentralCityHiveProductionSource(config('KS'),bible,{
    lifecycleConfig:inactive,
    fetchText:async()=>{requests++;throw Error('Disabled Kansas lifecycle must not request HTTP.');},
  });
  assert.equal(held.metadata.blockedByPromotion,true);
  assert.equal(held.accounting.requestCount,0);
  assert.equal(centralCityHiveProductionAllowed('KS',{...STATE_LIFECYCLE_CONFIG,activeStates:STATE_LIFECYCLE_CONFIG.activeStates.filter(id=>id!=='KS')}),false);
  assert.equal(requests,0);
});
test('KS production parser uses six exact merchant-scoped requests and projects only silent binary pickup rows',async t=>{
  const opts=await setup(t,'KS'),nowMs=Date.parse('2026-11-14T11:10:00.000Z'),fixtureRoot=new URL('./fixtures/ks-cityhive/',import.meta.url);
  const fixtureInfo=JSON.parse(await readFile(new URL('receipts.json',fixtureRoot),'utf8'));
  const captures=new Map(await Promise.all(fixtureInfo.captures.map(async receipt=>[
    receipt.fixture,await readFile(new URL(receipt.fixture,fixtureRoot),'utf8'),
  ])));
  const sha256=value=>createHash('sha256').update(value).digest('hex');
  assert.equal(fixtureInfo.sourceArtifact.runId,'43587613750');
  assert.equal(fixtureInfo.sourceArtifact.artifactDigest,'561b86527e45b5350ccf426c087ea242c026a0947d3e72587469b310dc70a85d');
  for(const receipt of fixtureInfo.captures)assert.equal(sha256(captures.get(receipt.fixture).replace(/\r\n/g,'\n')),receipt.fixtureSha256,receipt.fixture);
  const byHost=new Map([
    ['kingsliquorolathe.com','kings-weller-special-reserve.json'],
    ['vernsliquor.com','verns-larceny-barrel-proof.json'],
    ['rjdiscountliquor.com','rj-elijah-and-larceny-barrel-proof.json'],
  ]),requests=[];
  const rows=await collectCentralCityHiveProductionSource(config('KS'),bible,{
    ...opts,nowMs,
    fetchText:async (url,options)=>{
      const parsed=new URL(url),fixture=byHost.get(parsed.hostname);requests.push(parsed);
      assert.equal(options.timeoutMs,3_000);
      assert.ok(fixture,`Unreviewed production Kansas hostname ${parsed.hostname}`);
      return{ok:true,status:200,url,text:`<script type="application/json">${captures.get(fixture)}</script>`};
    },
  });
  assert.equal(requests.length,6);
  assert.ok(requests.every(url=>url.pathname==='/shop/'&&[...url.searchParams].length===2
    &&url.searchParams.get('merchant-id')===CENTRAL_CITYHIVE_PRODUCTION_SOURCES.find(source=>source.state==='KS'&&source.hostname===url.hostname)?.merchantId));
  assert.equal(new Set(requests.map(url=>url.hostname)).size,3);
  for(const source of CENTRAL_CITYHIVE_PRODUCTION_SOURCES.filter(candidate=>candidate.state==='KS')){
    const terms=requests.filter(url=>url.hostname===source.hostname).map(url=>url.searchParams.get('ch-query'));
    assert.equal(terms.length,2);assert.ok(terms.includes(source.prioritySearchTerm));
  }
  assert.equal(rows.metadata.complete,true);assert.equal(rows.metadata.verifiedPremises.length,3);
  assert.equal(rows.signals.length,4);assert.equal(new Set(rows.signals.map(row=>row.storeId)).size,3);
  assert.ok(rows.signals.every(row=>row.quantity===0&&row.quantityIsExact===false
    &&row.quantitySemantics==='binary_retailer_orderable_no_exact_count'
    &&row.sourceAvailabilityVerified===true&&row.availabilityStatus==='in_stock'
    &&row.sourceProductBinding.premisesVerified===true&&row.sourceProductBinding.pickupOfferVerified===true
    &&Number(row.sourceProductBinding.reportedQuantity)>0
    &&row.canAlertAsInventory===false&&row.canAlertAsWatch===false&&row.alertable===false
    &&row.eligibleForWatch===false&&row.eligibleForDelivery===false&&row.eligibleForEmail===false&&row.eligibleForSms===false
    &&row.sourceRuntimeId==='ks:central-cityhive'&&row.sourceProductBinding.productionOnSiteOnly===true
    &&isCentralCityHiveProductionOnSiteSignal(row,{nowMs})));
  const drops=buildDrops(rows.signals.map(row=>canonicalizeSignal(row,bible)),bibleLookup(bible.records),rows.signals);
  assert.equal(drops.length,4);assert.ok(drops.every(row=>row.quantity===0&&row.quantityIsExact===false
    &&row.canAlertAsInventory===false&&row.canAlertAsWatch===false&&row.eligibleForDelivery===false
    &&row.eligibleForEmail!==true&&row.eligibleForSms!==true));
});

test('KS production 403 persists its shared-host cooldown and suppresses the next request',async t=>{
  const opts=await setup(t,'KS');let requests=0;
  const denied=async(url,{onResponse})=>{
    requests++;await onResponse({status:403,retryAfterSeconds:0});
    return{ok:false,status:403,url,text:''};
  };
  await assert.rejects(()=>collectCentralCityHiveProductionSource(config('KS'),bible,{...opts,fetchText:denied}),error=>error.status===403);
  const journal=JSON.parse(await readFile(path.join(opts.incidentDir,'KS.json'),'utf8'));
  const host=journal.hosts['kingsliquorolathe.com'];
  assert.equal(host.httpStatus,403);assert.ok(Date.parse(host.nextAllowedAt)-Date.parse(host.lastAttemptAt)>=24*60*60_000);
  await assert.rejects(()=>collectCentralCityHiveProductionSource(config('KS'),bible,{...opts,fetchText:denied}),error=>error.status===403&&error.details.requestCount===0);
  assert.equal(requests,1);
});

test('RI production requires seven bound queries and projects three exact binary pickup premises',async t=>{
  const opts=await setup(t,'RI');
  const captures={
    riliquordelivery:'eagle-rare-10-year-kentucky-straight-bourbon.json',
    fifthwardliquor:'fifth-ward-eagle-rare-10.json',
    californialiquorsri:'california-liquors-eagle-rare-10.json',
  };
  const requests=[];
  const rows=await collectCentralCityHiveProductionSource(config('RI'),bible,{
    ...opts,
    fetchText:async url=>{
      const request=new URL(url);
      requests.push(request);
      const fixture=captures[request.hostname.split('.')[0]];
      const product=await readFile(new URL('./fixtures/ri-cityhive/'+fixture,import.meta.url),'utf8');
      return {ok:true,status:200,url,text:`<script type="application/json">${product}</script>`};
    },
  });
  assert.equal(requests.length,7);
  assert.ok(requests.every(request=>request.pathname==='/shop/'&&request.searchParams.has('merchant-id')&&request.searchParams.has('ch-query')));
  assert.equal(new Set(rows.signals.map(row=>row.storeId)).size,3);
  const canonical=rows.signals.map(row=>canonicalizeSignal(row,bible));
  const drops=buildDrops(canonical,bibleLookup(bible.records),canonical);
  assert.equal(drops.length,3);
  assert.ok(drops.every(row=>row.quantity===0&&row.quantityIsExact===false&&row.eligibleForDropFeed===true
    &&row.canAlertAsInventory===false&&row.canAlertAsWatch===false&&row.eligibleForDelivery===false
    &&row.eligibleForEmail===false&&row.eligibleForSms===false&&row.sourceRuntimeId==='ri:central-cityhive'));
});

for(const state of ['WI','OK'])test(`${state} nonpreview production rows/cache preserve original clocks/current library and never enable delivery`,async t=>{
  const opts=await setup(t,state),now=Date.now();let calls=0;
  const result=await collectCentralCityHiveProductionSource(config(state),bible,{...opts,nowMs:now,fetchText:mockedCentralFetch(()=>calls++)});
  assert.equal(calls,state==='WI'?5:10);assert.ok(result.signals.length>0);
  assert.ok(result.signals.every(row=>isCentralCityHiveProductionOnSiteSignal(row)&&!Object.hasOwn(row,'previewOnly')));
  const clock=result.signals[0].observedAt;
  const cached=await collectCentralCityHiveProductionSource(config(state),bible,{...opts,nowMs:now+29*60_000,fetchText:async()=>{throw Error('Fresh cache requested HTTP');}});
  assert.equal(cached.signals[0].observedAt,clock);assert.equal(cached.accounting.requestCount,0);
  const disabled=new BourbonBible(structuredClone(bible.records).map(record=>({...record,libraryAlertEligible:false})));
  assert.equal((await collectCentralCityHiveProductionSource(config(state),disabled,{...opts,nowMs:now+29*60_000,fetchText:async()=>{throw Error('Library filter must not fetch');}})).signals.length,0);
  const aborted=new AbortController();aborted.abort(Error('cancelled cache'));
  await assert.rejects(()=>collectCentralCityHiveProductionSource(config(state),bible,{...opts,signal:aborted.signal}),/cancelled cache/);
  const file=path.join(opts.cacheDir,state+'.json'),cache=JSON.parse(await readFile(file,'utf8'));cache.cohortKey='0'.repeat(64);await writeFile(file,JSON.stringify(cache));
  let refreshed=0;await collectCentralCityHiveProductionSource(config(state),bible,{...opts,fetchText:mockedCentralFetch(()=>refreshed++)});assert.ok(refreshed>0);
  assert.equal(JSON.parse(await readFile(path.join(opts.incidentDir,state+'.json'),'utf8')).inFlight,null);
});

for(const status of [401,403,429,435])test(`HTTP${status} denial survives cancellation, missing stock cache and forced retry`,async t=>{
  const opts=await setup(t),now=Date.now(),controller=new AbortController();let calls=0;
  await collectCentralCityHiveProductionSource(config('WI'),bible,{...opts,nowMs:now,fetchText:mockedCentralFetch()});
  const file=path.join(opts.cacheDir,'WI.json'),before=await readFile(file,'utf8');
  await assert.rejects(()=>collectCentralCityHiveProductionSource(config('WI'),bible,{...opts,forceLive:true,nowMs:now,signal:controller.signal,
    fetchText:async url=>{calls++;controller.abort(Error('late parent cancellation'));return{ok:false,status,url,text:'',retryAfterSeconds:status===429?3*86400:0};}}),error=>error.status===status);
  assert.equal(calls,1);assert.equal(await readFile(file,'utf8'),before);
  const journal=JSON.parse(await readFile(path.join(opts.incidentDir,'WI.json'),'utf8')),entry=journal.hosts['liquorguys.com'];
  assert.equal(journal.inFlight,null);assert.equal(entry.httpStatus,status);
  assert.ok(Date.parse(entry.nextAllowedAt)-Date.parse(entry.lastAttemptAt)>=(status===429?3:1)*86400_000);
  await rm(file);
  await assert.rejects(()=>collectCentralCityHiveProductionSource(config('WI'),bible,{...opts,forceLive:true,fetchText:()=>{calls++;throw Error('Forbidden denied host retry');}}),error=>error.status===status&&error.details.requestCount===0);
  assert.equal(calls,1);
});

test('real incident rename failure leaves a durable unresolved latch and no late inventory mutation',async t=>{
  const opts=await setup(t);let calls=0;
  await collectCentralCityHiveProductionSource(config('WI'),bible,{...opts,fetchText:mockedCentralFetch()});
  const stock=path.join(opts.cacheDir,'WI.json'),before=await readFile(stock,'utf8'),journal=path.join(opts.incidentDir,'WI.json'),held=journal+'.held';
  await assert.rejects(()=>collectCentralCityHiveProductionSource(config('WI'),bible,{...opts,forceLive:true,fetchText:async url=>{
    calls++;await rename(journal,held);await mkdir(journal);return{ok:false,status:403,url,text:''};
  }}),error=>error.status===403&&error.details.incidentWriteFailed&&error.details.unresolvedAttempt);
  assert.equal(await readFile(stock,'utf8'),before);assert.ok(JSON.parse(await readFile(held,'utf8')).inFlight);
  await assert.rejects(()=>collectCentralCityHiveProductionSource(config('WI'),bible,{...opts,forceLive:true,fetchText:()=>{calls++;throw Error('Forbidden journal retry');}}));
  await rm(journal,{recursive:true});await rename(held,journal);
  await assert.rejects(()=>collectCentralCityHiveProductionSource(config('WI'),bible,{...opts,forceLive:true,fetchText:()=>{calls++;throw Error('Unresolved attempt retried');}}),error=>error.code==='CITYHIVE_UNRESOLVED_ATTEMPT');
  assert.equal(calls,1);
});

test('malformed/unwritable journals block HTTP and incomplete/redirected premises cannot write inventory',async t=>{
  const opts=await setup(t);let calls=0;
  await mkdir(opts.incidentDir,{recursive:true});const file=path.join(opts.incidentDir,'WI.json');await writeFile(file,'corrupt');
  await assert.rejects(()=>collectCentralCityHiveProductionSource(config('WI'),bible,{...opts,fetchText:()=>calls++}));assert.equal(calls,0);
  await rm(file);await assert.rejects(()=>collectCentralCityHiveProductionSource(config('WI'),bible,{...opts,persistIncidentJournal:()=>{throw Error('read-only journal');},fetchText:()=>calls++}));assert.equal(calls,0);
  await assert.rejects(()=>collectCentralCityHiveProductionSource(config('WI'),bible,{...opts,fetchText:mockedCentralFetch(()=>calls++,(json)=>json.merchant_configs=[])}),/complete reviewed cohort/);
  await assert.rejects(()=>readFile(path.join(opts.cacheDir,'WI.json')),{code:'ENOENT'});
  await assert.rejects(()=>collectCentralCityHiveProductionSource(config('WI'),bible,{...opts,fetchText:async()=>({ok:true,status:200,url:'https://foreign.invalid',text:'{}'})}),/redirected/);
});

test('complete negative observations remain healthy, while source failures retain their HTTP status/request count',async t=>{
  const opts=await setup(t);
  const report=await collectState(config('WI'),bible,{lifecycleConfig:opts.lifecycleConfig,promotionManifest:opts.promotionManifest,cityHiveSourceOptions:{...opts,fetchText:mockedCentralFetch(()=>{},json=>{for(const product of json.products)for(const merchant of product.merchants||[])for(const option of merchant.product_options||[])option.quantity=0;})}});
  assert.equal(report.status,'monitored_no_current_inventory');assert.equal(report.signals.length,0);assert.equal(report.sourceResults[0].recordsInspected,1);
  const failed=await collectState(config('WI'),bible,{lifecycleConfig:opts.lifecycleConfig,promotionManifest:opts.promotionManifest,cityHiveSourceOptions:{...opts,forceLive:true,fetchText:async url=>({ok:false,status:403,url,text:''})}});
  assert.equal(failed.status,'blocked');assert.equal(failed.sourceResults[0].error.status,403);assert.equal(failed.metadata.requestCount,1);assert.equal(failed.signals.length,0);
});

test('source deadlines fit parent watchdogs and denial cache saves independently after publication failure',async()=>{
  for(const state of ['WI','OK','KS']){const b=CENTRAL_CITYHIVE_PRODUCTION_BUDGETS[state];assert.ok(b.sourceMs<stateTimeoutMs({id:state}));assert.equal(b.stateMs,stateTimeoutMs({id:state}));assert.ok(b.maxRequests*(b.requestTimeoutMs||10_000)+b.maxRequests*1000<=b.sourceMs);}
  const workflow=await readFile(new URL('../../.github/workflows/refresh-feed.yml',import.meta.url),'utf8');
  const steps=workflow.split(/\r?\n {6}- name:/),file='engine/out/source-incidents/central-cityhive';
  const restore=steps.find(step=>step.includes('actions/cache/restore@v4')&&step.includes(file));
  const save=steps.find(step=>step.includes('actions/cache/save@v4')&&step.includes(file));
  assert.ok(restore&&save);assert.match(save,/if: always\(\)/);assert.equal(save.match(/\bkey: (.+)/)[1],restore.match(/\bkey: (.+)/)[1]);
  const policy=STATE_LIFECYCLE_CONFIG.reliabilityPolicy;
  const expected=[...new Set([...STATE_LIFECYCLE_CONFIG.activeStates,'WI','OK','KS'])].map(state=>policy.stateExpectedRunMs[state]||policy.defaultExpectedStateRunMs);
  const capacity=evaluateCapacityBudget({stateExpectedRunMs:expected,
    concurrency:policy.workerConcurrency,intervalMs:policy.refreshIntervalMs,safetyMarginMs:policy.refreshSafetyMarginMs});
  assert.equal(capacity.ok,true,'Distinct active/planned state runtime forecasts must fit the existing collection-only capacity');
  assert.equal(CENTRAL_CITYHIVE_PRODUCTION_BUDGETS.KS.sourceMs,25_000);
  assert.equal(CENTRAL_CITYHIVE_PRODUCTION_BUDGETS.KS.stateMs,30_000);
  assert.equal(CENTRAL_CITYHIVE_PRODUCTION_BUDGETS.KS.maxRequests,6);
  assert.equal(CENTRAL_CITYHIVE_PRODUCTION_BUDGETS.KS.requestTimeoutMs,3_000);
  assert.equal(policy.stateExpectedRunMs.KS,15_000);
  assert.ok(capacity.projectedRunMs<=capacity.availableRunMs,'The 30 second Kansas allowance keeps the scheduler inside the current capacity.');
});

test('a late successful HTTP response after parent cancellation cannot publish inventory or start another request',async t=>{
  const opts=await setup(t),controller=new AbortController();let calls=0;const transport=mockedCentralFetch();
  await assert.rejects(()=>collectCentralCityHiveProductionSource(config('WI'),bible,{...opts,signal:controller.signal,fetchText:async url=>{
    calls++;controller.abort(new DOMException('Parent deadline reached','TimeoutError'));await new Promise(resolve=>setTimeout(resolve,20));return transport(url);
  }}),error=>error.name==='TimeoutError');
  assert.equal(calls,1);await assert.rejects(()=>readFile(path.join(opts.cacheDir,'WI.json')),{code:'ENOENT'});
  assert.equal(JSON.parse(await readFile(path.join(opts.incidentDir,'WI.json'),'utf8')).inFlight,null);
});

test('the native HTTP boundary journals denied headers and Retry-After before body reads despite parent abort',async t=>{
  const nativeFetch=globalThis.fetch;t.after(()=>{globalThis.fetch=nativeFetch;});
  for(const status of [401,403,429,435]){
    const opts=await setup(t),controller=new AbortController();let requests=0,cancelled=0,beforeCancel=false;
    globalThis.fetch=async(url,request)=>{
      requests++;assert.equal(request.redirect,'error');controller.abort(Error('Parent aborted after response headers'));
      return{ok:false,status,url,headers:new Headers({'retry-after':'259200'}),body:{cancel:async()=>{
        cancelled++;const journal=await readFile(path.join(opts.incidentDir,'WI.json'),'utf8').then(JSON.parse).catch(()=>null);
        beforeCancel=journal?.hosts?.['liquorguys.com']?.httpStatus===status;
      }},text:async()=>{throw Error('Denied response body must not be read');}};
    };
    await assert.rejects(()=>collectCentralCityHiveProductionSource(config('WI'),bible,{...opts,signal:controller.signal}),error=>error.status===status);
    assert.equal(requests,1);assert.equal(cancelled,1);assert.equal(beforeCancel,true,'denial must persist before cancellation touches the body');
    const journal=JSON.parse(await readFile(path.join(opts.incidentDir,'WI.json'),'utf8')),incident=journal.hosts['liquorguys.com'];
    assert.ok(Date.parse(incident.nextAllowedAt)-Date.parse(incident.lastAttemptAt)>=3*86_400_000);
    assert.equal(journal.inFlight,null);
    await assert.rejects(()=>collectCentralCityHiveProductionSource(config('WI'),bible,{...opts,forceLive:true}),error=>error.status===status&&error.details.requestCount===0);
    assert.equal(requests,1);
  }
});
