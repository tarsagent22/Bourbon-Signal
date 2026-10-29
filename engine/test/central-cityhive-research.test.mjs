import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,rename,mkdtemp,rm} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BourbonBible } from '../src/core/bible.mjs';
import { researchSourceForState,withResearchLifecycle,collectResearchStateReport } from '../src/research-state-registry.mjs';
import { STATE_LIFECYCLE_CONFIG } from '../src/state-lifecycle.mjs';
import { buildShadowEvidence } from '../src/run-expansion-shadow.mjs';
import { CENTRAL_CITYHIVE_EXPANSION_SOURCES } from '../src/collectors/central-cityhive-expansion.mjs';
import {persistCityHiveIncidentJournal} from '../src/collectors/central-cityhive-transport.mjs';

const bible=await BourbonBible.load(new URL('../out/bourbon-bible.json',import.meta.url));
const fixtures=new Map();
for(const source of CENTRAL_CITYHIVE_EXPANSION_SOURCES)fixtures.set(source.hostname,await readFile(new URL(`./fixtures/central-cityhive/${source.id}.json`,import.meta.url),'utf8'));
const html=fixture=>`<script type="application/json">${fixture}</script>`;
const frozen=JSON.stringify(STATE_LIFECYCLE_CONFIG);

test('WI and OK research registration cannot activate a source or mutate production lifecycle',()=>{
  assert.equal(researchSourceForState('WI',{shadowMode:false}),null);
  assert.equal(researchSourceForState('OK',{shadowMode:false}),null);
  const researchProduction={...STATE_LIFECYCLE_CONFIG,activeStates:STATE_LIFECYCLE_CONFIG.activeStates.filter(state=>!['WI','OK'].includes(state)),
    states:{...STATE_LIFECYCLE_CONFIG.states,WI:{publicStatus:'research_only'},OK:{publicStatus:'research_only'}}};
  const candidate=withResearchLifecycle(researchProduction);
  assert.deepEqual(candidate.activeStates,researchProduction.activeStates);
  for(const state of ['WI','OK']){
    assert.equal(candidate.states[state].publicStatus,'research_only');assert.equal(candidate.states[state].shadowEligible,true);
    assert.equal(candidate.states[state].inventoryAlertable,false);assert.equal(candidate.states[state].watchAlertable,false);
  }
  assert.equal(JSON.stringify(STATE_LIFECYCLE_CONFIG),frozen);
  const active=withResearchLifecycle({...STATE_LIFECYCLE_CONFIG,activeStates:[...STATE_LIFECYCLE_CONFIG.activeStates,'OK'],states:{...STATE_LIFECYCLE_CONFIG.states,OK:{publicStatus:'active'}}});
  assert.equal(active.states.OK.publicStatus,'active');
});

test('registered WI/OK shadow collection executes real parser, retains receipts, and disables every delivery flag',async()=>{
  const original=process.env.BOURBON_SIGNAL_SHADOW_MODE,dir=await mkdtemp(path.join(tmpdir(),'central-shadow-'));
  try{process.env.BOURBON_SIGNAL_SHADOW_MODE='1';
    for(const state of ['WI','OK']){
      const config=researchSourceForState(state),calls=[];
      const report=await collectResearchStateReport(config,bible,{captureRoot:null,cursorDir:dir,sleep:async()=>{},incidentFile:path.join(dir,state+'-incidents.json'),
        readAttempts:async()=>({}),writeAttempts:async()=>{},fetchText:async url=>{calls.push(url);return{ok:true,status:200,url,text:html(fixtures.get(new URL(url).hostname))}}});
      assert.ok(report.signals.length>0);assert.equal(report.metadata.receipts.length,calls.length);
      assert.equal(buildShadowEvidence(state,report).complete,true);
      for(const mutation of [{storeId:'unreviewed'},{sourceRuntimeId:'unreviewed'},{raw:{shadowOnly:false}}])
        assert.equal(buildShadowEvidence(state,{...report,signals:report.signals.map(row=>({...row,...mutation}))}).complete,false);
      assert.equal(buildShadowEvidence(state,{...report,metadata:{...report.metadata,complete:false}}).complete,false);
      for(const row of report.signals){
        assert.equal(row.raw.shadowOnly,true);assert.equal(row.quantity,0);assert.equal(row.quantityIsExact,false);
        for(const flag of ['alertable','canAlertAsInventory','canAlertAsWatch','eligibleForOnSite','eligibleForDropFeed','eligibleForWatch','eligibleForDelivery','eligibleForEmail','eligibleForSms'])assert.equal(row[flag],false);
      }
      await assert.rejects(()=>collectResearchStateReport({...config},bible),/registered isolated/);
    }
    assert.equal(JSON.stringify(STATE_LIFECYCLE_CONFIG),frozen);
  }finally{if(original===undefined)delete process.env.BOURBON_SIGNAL_SHADOW_MODE;else process.env.BOURBON_SIGNAL_SHADOW_MODE=original;await rm(dir,{recursive:true,force:true});}
});

test('immediate durable denial suppresses subsequent shadow runs rather than manufacturing fresh observations',async()=>{
  const original=process.env.BOURBON_SIGNAL_SHADOW_MODE,dir=await mkdtemp(path.join(tmpdir(),'central-denial-'));
  try{process.env.BOURBON_SIGNAL_SHADOW_MODE='1';let attempts={},calls=0,writes=0;
    const options={captureRoot:null,cursorDir:dir,sleep:async()=>{},incidentFile:path.join(dir,'incidents.json'),readAttempts:async()=>attempts,
      writeAttempts:async(_state,next)=>{attempts=structuredClone(next);writes++;},
      fetchText:async url=>{calls++;return{ok:false,status:403,url,text:'Forbidden'}}};
    const config=researchSourceForState('WI');
    const first=await collectResearchStateReport(config,bible,options);
    assert.equal(calls,1);assert.equal(writes,1);assert.equal(buildShadowEvidence('WI',first).complete,false);
    const second=await collectResearchStateReport(config,bible,options);
    assert.equal(calls,1);assert.equal(second.metadata.receipts.length,0);assert.equal(second.signals.length,0);
    assert.equal(buildShadowEvidence('WI',second).complete,false);
  }finally{if(original===undefined)delete process.env.BOURBON_SIGNAL_SHADOW_MODE;else process.env.BOURBON_SIGNAL_SHADOW_MODE=original;await rm(dir,{recursive:true,force:true});}
});

async function researchSetup(t){
  const original=process.env.BOURBON_SIGNAL_SHADOW_MODE,directory=await mkdtemp(path.join(tmpdir(),'central-research-denial-'));
  assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));process.env.BOURBON_SIGNAL_SHADOW_MODE='1';
  t.after(async()=>{if(original===undefined)delete process.env.BOURBON_SIGNAL_SHADOW_MODE;else process.env.BOURBON_SIGNAL_SHADOW_MODE=original;await rm(directory,{recursive:true,force:true});});
  return{captureRoot:null,cursorDir:path.join(directory,'cursor'),incidentFile:path.join(directory,'incidents.json'),sleep:async()=>{},readAttempts:async()=>({}),writeAttempts:async()=>{}};
}
test('native research denials persist before aborted body work and honor Retry-After without relying on legacy attempts',async t=>{
  const native=globalThis.fetch;t.after(()=>{globalThis.fetch=native;});
  for(const status of [401,403,429,435]){
    const options=await researchSetup(t),controller=new AbortController();let calls=0,beforeCancel=false;
    globalThis.fetch=async(url,request)=>{calls++;assert.equal(request.redirect,'error');controller.abort(Error('Parent abort after headers'));
      return{ok:false,status,url,headers:new Headers({'retry-after':'259200'}),body:{cancel:async()=>{
        const journal=await readFile(options.incidentFile,'utf8').then(JSON.parse).catch(()=>null);beforeCancel=journal?.hosts?.['liquorguys.com']?.httpStatus===status;
      }},text:async()=>{throw Error('Denied body must not be read');}};};
    const config=researchSourceForState('WI'),report=await collectResearchStateReport(config,bible,{...options,signal:controller.signal});
    assert.equal(calls,1);assert.equal(beforeCancel,true);assert.equal(report.signals.length,0);assert.equal(buildShadowEvidence('WI',report).complete,false);
    const journal=JSON.parse(await readFile(options.incidentFile,'utf8')),entry=journal.hosts['liquorguys.com'];
    assert.equal(journal.inFlight,null);assert.ok(Date.parse(entry.nextAllowedAt)-Date.parse(entry.lastAttemptAt)>=3*86_400_000);
    const held=await collectResearchStateReport(config,bible,options);assert.equal(calls,1);assert.equal(held.metadata.requests.length,0);
  }
});
test('real research denial rename failure preserves an unresolved durable latch and blocks all subsequent HTTP',async t=>{
  const options=await researchSetup(t),config=researchSourceForState('WI');let calls=0;
  await assert.rejects(()=>collectResearchStateReport(config,bible,{...options,fetchText:async url=>{
    calls++;assert.ok(JSON.parse(await readFile(options.incidentFile,'utf8')).inFlight);
    await rename(options.incidentFile,options.incidentFile+'.held');await mkdir(options.incidentFile);
    return{ok:false,status:429,url,text:'',retryAfterSeconds:259200};
  }}),error=>error.status===429&&error.details.incidentWriteFailed===true&&error.details.unresolvedAttempt===true);
  await assert.rejects(()=>collectResearchStateReport(config,bible,{...options,fetchText:async()=>{calls++;throw Error('Must not fetch');}}));
  assert.equal(calls,1);await rm(options.incidentFile,{recursive:true});await rename(options.incidentFile+'.held',options.incidentFile);
  await assert.rejects(()=>collectResearchStateReport(config,bible,options),error=>error.code==='CITYHIVE_UNRESOLVED_ATTEMPT');assert.equal(calls,1);
});
test('malformed journal and failed pre-HTTP latch writes prevent research requests; late healthy rows cannot cross abort',async t=>{
  const options=await researchSetup(t),config=researchSourceForState('WI');let calls=0;
  const fetchText=async()=>{calls++;throw Error('Must not fetch');};
  await writeFile(options.incidentFile,'{broken');await assert.rejects(()=>collectResearchStateReport(config,bible,{...options,fetchText}));assert.equal(calls,0);
  await writeFile(options.incidentFile,'null');await assert.rejects(()=>collectResearchStateReport(config,bible,{...options,fetchText}),/must be an object/);assert.equal(calls,0);
  await rm(options.incidentFile);
  await assert.rejects(()=>collectResearchStateReport(config,bible,{...options,fetchText,persistIncidentJournal:(file,value)=>{
    if(value.inFlight)throw Object.assign(Error('Latch unavailable'),{code:'EACCES'});persistCityHiveIncidentJournal(file,value);
  }}),/Latch unavailable/);assert.equal(calls,0);
  const controller=new AbortController();await assert.rejects(()=>collectResearchStateReport(config,bible,{...options,signal:controller.signal,fetchText:async url=>{
    calls++;controller.abort(Error('Late source result'));return{ok:true,status:200,url,text:html(fixtures.get(new URL(url).hostname))};
  }}),/Late source result/);assert.equal(calls,1);assert.equal(JSON.parse(await readFile(options.incidentFile,'utf8')).inFlight,null);
});
