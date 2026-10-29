import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {evaluateCapacityBudget} from '../src/reliability-policy.mjs';
import {WESTERN_GROCERY_BUDGETS} from '../src/western-grocery-production-config.mjs';
import {CENTRAL_CITYHIVE_PRODUCTION_BUDGETS} from '../src/central-cityhive-production-config.mjs';
const read=relative=>JSON.parse(readFileSync(new URL(relative,import.meta.url),'utf8'));
const forecast=read('../data/source-evidence/refresh-capacity-20261029/forecast-refinement.json');
const config=read('../../src/config/state-lifecycle.json');
test('four planning forecasts follow one observed-sample formula without changing source or parent budgets',()=>{
  assert.equal(forecast.sourceObservations.length,3);
  assert.equal(new Set(forecast.sourceObservations.map(row=>row.runId)).size,3);
  for(const [state,derived] of Object.entries(forecast.derivedForecasts)){
    const samples=forecast.sourceObservations.map(run=>{
      assert.equal(run.qualifying,true);assert.equal(run.status,'success');assert.match(run.artifactDigest,/^[a-f0-9]{64}$/);
      const sample=run.samples.find(row=>row.state===state);
      assert.equal(Date.parse(sample.collectorFinishedAt)-Date.parse(sample.collectorStartedAt),sample.elapsedMs);
      assert.match(sample.reportSha256,/^[a-f0-9]{64}$/);return sample.elapsedMs;
    });
    assert.deepEqual(samples,derived.samplesMs);
    const expected=Math.ceil(2*Math.max(...samples)/30000)*30000;
    assert.equal(derived.forecastMs,expected);
    assert.equal(config.reliabilityPolicy.stateExpectedRunMs[state],expected);
    assert.equal(config.activeStates.includes(state),false);
    assert.equal(config.states[state].publicStatus,'research_only');
    assert.equal(config.states[state].inventoryAlertable,false);assert.equal(config.states[state].watchAlertable,false);
  }
  assert.deepEqual(WESTERN_GROCERY_BUDGETS,{WA:{sourceMs:600000,stateMs:720000},NM:{sourceMs:180000,stateMs:300000}});
  assert.deepEqual(CENTRAL_CITYHIVE_PRODUCTION_BUDGETS,{WI:{sourceMs:90000,stateMs:150000,maxRequests:5},OK:{sourceMs:180000,stateMs:240000,maxRequests:10}});
  const p=config.reliabilityPolicy,states=[...config.activeStates,'WA','NM','WI','OK'];
  assert.deepEqual(evaluateCapacityBudget({stateExpectedRunMs:states.map(state=>p.stateExpectedRunMs[state]||p.defaultExpectedStateRunMs),concurrency:p.workerConcurrency,intervalMs:p.refreshIntervalMs,safetyMarginMs:p.refreshSafetyMarginMs}),forecast.prospectiveCollectionModel);
  assert.equal(forecast.sourceAndParentHardcapsChanged,false);assert.equal(forecast.promotionManifestSemanticsChanged,false);
});
