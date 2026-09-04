import assert from 'node:assert/strict';
import test from 'node:test';
import { compareStateQuality, scoreStateQuality } from '../src/state-quality-scorecard.mjs';
test('stale state quality remains ineligible without freezing unrelated snapshot updates',()=>{
 const stale=scoreStateQuality({state:'AA',coverageTier:'live_store_inventory',signalCount:100,dropCount:100,storeLevelDropCount:100,alertCandidateCount:5,sourceCount:3,roadblockCount:0,status:'stale_useful',freshestObservedAt:'2020-01-01T00:00:00Z'});
 assert.equal(stale.releaseEligible,false);
 const result=compareStateQuality({states:[stale]},{states:[stale]});
 assert.equal(result.ok,true,'an unchanged already-ineligible state must not freeze every snapshot');
 assert.ok(result.warnings.some(w=>w.includes('insufficient fresh evidence')));
});
