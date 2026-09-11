import assert from 'node:assert/strict';
import test from 'node:test';
import * as nc from '../src/collectors/north-carolina-intelligence.mjs';
import { runLegacyPrecisionSource } from '../src/sources/legacy-precision-runtime.mjs';
import { guardStateReport } from '../src/state-report-guard.mjs';
const now='2026-09-11T03:00:00.000Z', old='2026-08-27T14:57:11.666Z';
function signal(id,eventType='nc_board_shipment_snapshot') { return {id,state:'NC',eventType,canonicalBottleId:id,canonicalName:id,sourceLabel:'official fixture',storeId:id,locationPrecision:eventType==='store_inventory_result'?'store_level':'board_county',observedAt:old,canAlertAsInventory:eventType==='store_inventory_result',canAlertAsWatch:false}; }
test('NC bounded positive observations reach state continuity instead of a whole-source raw-volume rejection', async()=>{
  assert.equal(typeof nc.ncPrecisionResult,'function','NC must declare its bounded non-census result');
  const previous={state:'NC',finishedAt:old,signals:Array.from({length:100},(_,i)=>signal('prior-'+i))};
  const fresh={...signal('current','store_inventory_result'),observedAt:now};
  const result=await runLegacyPrecisionSource({sourceId:'precision:nc',stateId:'NC',collect:async()=>nc.ncPrecisionResult([fresh],[]),previousResults:{'precision:nc':{lastGoodAt:old,value:{signals:previous.signals,roadblocks:[]}}},sourceRunnerOptions:{schedule:false,maxAttempts:1}});
  assert.equal(result.sourceResults[0].status,'success');
  assert.equal(result.signals[0].observedAt,now);
  const guarded=guardStateReport({previous,candidate:{state:'NC',finishedAt:now,signals:result.signals,sourceResults:result.sourceResults,roadblocks:[]},now,options:{mergePartialFallback:true}});
  assert.equal(guarded.report.status,'partial_useful_quality_fallback');
  assert.equal(guarded.report.signals.find(s=>s.id==='current').canAlertAsInventory,true);
  assert.equal(guarded.report.signals.filter(s=>s.stale).length,100);
  for(const row of guarded.report.signals.filter(s=>s.stale)) {
    assert.equal(row.observedAt,old);assert.equal(row.canAlertAsInventory,false);assert.equal(row.canAlertAsWatch,false);assert.equal(row.sourceAvailabilityVerified,false);
  }
});
test('empty NC bounded result still fails closed and complete other-state collapse stays rejected',async()=>{
  assert.equal(typeof nc.ncPrecisionResult,'function');
  const previous={'precision:nc':{lastGoodAt:old,value:{signals:[signal('old')],roadblocks:[]}}};
  const empty=await runLegacyPrecisionSource({sourceId:'precision:nc',collect:async()=>nc.ncPrecisionResult([],[]),previousResults:previous,sourceRunnerOptions:{schedule:false,maxAttempts:1}});
  assert.notEqual(empty.sourceResults[0].status,'success');assert.equal(empty.signals[0].canAlertAsInventory,false);
  const other=await runLegacyPrecisionSource({sourceId:'precision:other',collect:async()=>({signals:[signal('new')],roadblocks:[]}),previousResults:{'precision:other':{lastGoodAt:old,value:{signals:Array.from({length:100},(_,i)=>signal(String(i))),roadblocks:[]}}},sourceRunnerOptions:{schedule:false,maxAttempts:1}});
  assert.equal(other.sourceResults[0].status,'collapsed');
});
