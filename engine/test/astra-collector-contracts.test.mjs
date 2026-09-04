import test from 'node:test';
import assert from 'node:assert/strict';
import { BourbonBible } from '../src/core/bible.mjs';
import { reconcileCityHiveRateLimitsWithCache } from '../src/collectors/cityhive-hardening.mjs';
import { runLegacyPrecisionSource } from '../src/sources/legacy-precision-runtime.mjs';
import { createSourceAdapter } from '../src/sources/source-adapter.mjs';
import { runSourceAdapters } from '../src/sources/source-runner.mjs';
import { sourceRuntimeOptionsFromArtifacts } from '../src/sources/source-runtime-state.mjs';
import { appendSourceSloObservations } from '../src/sources/slo-report.mjs';
import { createSourceSuccessResult, createSourceFailureResult, createSourceSkippedResult, summarizeSourceResult } from '../src/sources/source-result.mjs';

// Local counterexamples documented in collectors-audit.md; not live-source evidence.
const at = '2026-09-04T12:00:00.000Z';
test('F08 text scanning does not emit both bottles for an ambiguous alias',()=>{
  const bible=new BourbonBible([{id:'a',canonical:'Alpha',normalizedKey:'a',aliases:['Shared Bourbon']},{id:'b',canonical:'Bravo',normalizedKey:'b',aliases:['Shared Bourbon']}]);
  assert.deepEqual(bible.scanText('Today: Shared Bourbon'),[]);
});
test('F02 retained summary survives repeated failure and not-due serialization',()=>{
  const adapter=createSourceAdapter({id:'fixture',execute:async()=>null});
  const previous=createSourceSuccessResult({adapter,value:{signals:[],roadblocks:[],recordsInspected:100,metadata:{complete:true}},startedAt:at,finishedAt:at,attemptCount:1});
  for(const result of [createSourceFailureResult({adapter,previous,error:new Error('fixture failure'),startedAt:at,finishedAt:at,attemptCount:1}),createSourceSkippedResult({adapter,previous,status:'not_due',now:at})]) {
    const hydrated=sourceRuntimeOptionsFromArtifacts({previousReport:{sourceResults:[summarizeSourceResult(result)]}});
    assert.equal(hydrated.previousSourceResults.fixture.value.recordsInspected,100);
  }
});
test('F03 explicit incomplete empty without fallback cannot become success',async()=>{
  const result=await runLegacyPrecisionSource({sourceId:'fixture',collect:async()=>({signals:[],roadblocks:[],metadata:{complete:false}}),sourceRunnerOptions:{schedule:false,maxAttempts:1}});
  assert.equal(result.sourceResults[0].status,'malformed');
});
test('F08 shared aliases and containment ties fail closed regardless of record order', () => {
  const records = [{ id:'a', canonical:'Alpha Bourbon', normalizedKey:'alpha', aliases:['Shared Bourbon'] }, { id:'b', canonical:'Bravo Bourbon', normalizedKey:'bravo', aliases:['Shared Bourbon'] }];
  for (const input of [records, [...records].reverse()]) {
    const bible = new BourbonBible(input);
    assert.equal(bible.match('Shared Bourbon'), null);
    assert.equal(bible.match('Shared Bourbon 750ml'), null);
    assert.equal(bible.match('Alpha Bourbon')?.record.id, 'a');
  }
});
test('F10 cache continuity retains original 429 evidence and only removes duplicate summaries', () => {
  const failure = { source:'Fixture', status:429, error:'rate limited' };
  const result = reconcileCityHiveRateLimitsWithCache({ sources:[{id:'x', sourceLabel:'Fixture'}], retainedSignals:[{eventType:'cityhive_store_inventory_result',quantity:1,raw:{chain:'x',cacheFallback:true}}], roadblocks:[failure,{source:'Fixture',status:'reachable_no_safe_inventory_rows'}] });
  assert.deepEqual(result.roadblocks, [failure]);
});
test('F03 complete inspected empty is successful, not stale positive collapse', async () => {
  const result = await runLegacyPrecisionSource({ sourceId:'fixture', collect:async()=>({signals:[],roadblocks:[],metadata:{complete:true,recordsInspected:100}}), previousResults:{fixture:{lastGoodAt:at,value:{signals:Array.from({length:10},(_,id)=>({id})),roadblocks:[],metadata:{complete:true,recordsInspected:100}}}}, sourceRunnerOptions:{schedule:false,maxAttempts:1} });
  assert.equal(result.sourceResults[0].status,'success');
  assert.deepEqual(result.signals,[]);
});
test('F03 partial empty cannot replace previous positives', async () => {
  const result = await runLegacyPrecisionSource({ sourceId:'fixture', collect:async()=>({signals:[],roadblocks:[],metadata:{complete:false,recordsInspected:1}}), previousResults:{fixture:{lastGoodAt:at,value:{signals:[{id:1,observedAt:at}],roadblocks:[]}}}, sourceRunnerOptions:{schedule:false,maxAttempts:1} });
  assert.equal(result.stale,true);
  assert.equal(result.signals.length,1);
  assert.equal(result.signals[0].canAlertAsInventory,false);
});
test('F01 timeout must not start another noncooperative attempt', async () => {
  let calls=0;
  const adapter=createSourceAdapter({id:'slow', execute:async()=>{calls++;await new Promise(r=>setTimeout(r,40));return {signals:[]};}});
  const result=await runSourceAdapters([adapter],{},{schedule:false,timeoutMs:5,maxAttempts:2,retryDelayMs:0});
  await new Promise(r=>setTimeout(r,50));
  assert.equal(calls,1);
  assert.equal(result.results[0].status,'timeout');
});
test('F02/F06 summary and SLO roundtrip retain completeness and useful metrics', () => {
  const adapter=createSourceAdapter({id:'fixture',execute:async()=>null});
  const result=createSourceSuccessResult({adapter,value:{signals:[],roadblocks:[],recordsInspected:100,metadata:{complete:true},usefulChanges:3,consecutiveUnchanged:4},startedAt:at,finishedAt:at,attemptCount:1});
  const summary=summarizeSourceResult(result);
  const history=appendSourceSloObservations(null,[summary],{now:at});
  const options=sourceRuntimeOptionsFromArtifacts({previousReport:{sourceResults:[summary],signals:[],roadblocks:[]},sourceHistory:history});
  assert.equal(options.previousSourceResults.fixture.value.recordsInspected,100);
  assert.equal(options.previousSourceResults.fixture.value.metadata.complete,true);
  assert.equal(options.sourceRunnerOptions.sourceMetrics.fixture.usefulChanges,3);
  assert.equal(options.sourceRunnerOptions.sourceMetrics.fixture.consecutiveUnchanged,4);
});
