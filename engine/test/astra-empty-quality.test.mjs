import assert from 'node:assert/strict';
import test from 'node:test';
import { compareStateQuality } from '../src/state-quality-scorecard.mjs';
test('an empty non-alerting partition cannot block unrelated fresh opportunity publication',()=>{
 const current={states:[{state:'NY',input:{dropCount:0},freshness:{eligible:false},weaknesses:['insufficient_fresh_evidence']}]};
 const result=compareStateQuality({states:[]},current);
 assert.equal(result.failures.length,0);
});
test('positive stale-only inventory is explicitly warned without global publication deadlock',()=>{
 const result=compareStateQuality({states:[]},{states:[{state:'NY',input:{dropCount:10},freshness:{eligible:false},weaknesses:['insufficient_fresh_evidence']}]});
 assert.ok(result.warnings.some(reason=>reason.includes('insufficient fresh evidence')));
});
