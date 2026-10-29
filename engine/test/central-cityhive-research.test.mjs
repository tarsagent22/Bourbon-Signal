import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BourbonBible } from '../src/core/bible.mjs';
import { researchSourceForState,withResearchLifecycle,collectResearchStateReport } from '../src/research-state-registry.mjs';
import { STATE_LIFECYCLE_CONFIG } from '../src/state-lifecycle.mjs';
import { buildShadowEvidence } from '../src/run-expansion-shadow.mjs';
import { CENTRAL_CITYHIVE_EXPANSION_SOURCES } from '../src/collectors/central-cityhive-expansion.mjs';

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
      const report=await collectResearchStateReport(config,bible,{captureRoot:null,cursorDir:dir,sleep:async()=>{},
        readAttempts:async()=>({}),writeAttempts:async()=>{},fetchText:async url=>{calls.push(url);return{ok:true,status:200,url,text:html(fixtures.get(new URL(url).hostname))}}});
      assert.ok(report.signals.length>0);assert.equal(report.metadata.receipts.length,calls.length);
      assert.equal(buildShadowEvidence(state,report).complete,true);
      for(const row of report.signals){
        assert.equal(row.raw.shadowOnly,true);assert.equal(row.quantity,0);assert.equal(row.quantityIsExact,false);
        for(const flag of ['alertable','eligibleForOnSite','eligibleForDelivery','eligibleForEmail','eligibleForSms'])assert.equal(row[flag],false);
      }
      await assert.rejects(()=>collectResearchStateReport({...config},bible),/registered isolated/);
    }
    assert.equal(JSON.stringify(STATE_LIFECYCLE_CONFIG),frozen);
  }finally{if(original===undefined)delete process.env.BOURBON_SIGNAL_SHADOW_MODE;else process.env.BOURBON_SIGNAL_SHADOW_MODE=original;await rm(dir,{recursive:true,force:true});}
});

test('immediate durable denial suppresses subsequent shadow runs rather than manufacturing fresh observations',async()=>{
  const original=process.env.BOURBON_SIGNAL_SHADOW_MODE,dir=await mkdtemp(path.join(tmpdir(),'central-denial-'));
  try{process.env.BOURBON_SIGNAL_SHADOW_MODE='1';let attempts={},calls=0,writes=0;
    const options={captureRoot:null,cursorDir:dir,sleep:async()=>{},readAttempts:async()=>attempts,
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
