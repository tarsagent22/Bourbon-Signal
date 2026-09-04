import assert from 'node:assert/strict';
import test from 'node:test';
import * as watchdog from './engine-freshness-watchdog.mjs';
test('legacy local watchdog has no mutating default recovery authority', async () => {
  assert.equal(typeof watchdog.createObservationOnlyAdapters, 'function');
  const adapters=watchdog.createObservationOnlyAdapters({isRefreshRunning:async()=>false,verifyProductionReader:async()=>({verified:true})});
  for(const method of ['triggerRefresh','publishExisting','activateStaged','rerunExport'])await assert.rejects(adapters[method](),/canonical.*authority/i);
  assert.equal(await adapters.isRefreshRunning(),false);
  assert.deepEqual(await adapters.verifyProductionReader(),{verified:true});
});
