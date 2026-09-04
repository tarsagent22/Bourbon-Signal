import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {requiresStateAlertSuppression} from '../src/state-failure-isolation.mjs';
test('failed run 33925674074 TX diagnostic is denied by the shared export/verification predicate',async()=>{
 const fixture=JSON.parse(await readFile(new URL('./fixtures/astra-tx-partial-operating.json',import.meta.url),'utf8'));
 assert.equal(fixture.operating.alertCandidateCount,1);
 assert.equal(requiresStateAlertSuppression(fixture.operating),true);
});
test('alert suppression preserves healthy and fresh-anomaly-only states',()=>{
 for(const operating of [{health:'healthy',freshness:{status:'fresh'},fallback:{status:'none'}},{health:'degraded',freshness:{status:'fresh'},fallback:{status:'none'}}])assert.equal(requiresStateAlertSuppression(operating),false);
 for(const operating of [{health:'blocked'},{freshness:{status:'stale'}},{fallback:{status:'partial'}},{fallback:{status:'last_published'}}])assert.equal(requiresStateAlertSuppression(operating),true);
});
