import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithMeta } from '../src/core/fetcher.mjs';
import { runLegacyPrecisionSource } from '../src/sources/legacy-precision-runtime.mjs';
import { guardStateReport } from '../src/state-report-guard.mjs';

const at = '2026-09-04T12:00:00.000Z';
const rows = Array.from({length:10}, (_, i) => ({id:`p${i}`,storeId:String(i),raw:{product:{sku:'abc'}},canAlertAsInventory:true}));
const scope = rows.map(s => ({sku:'abc',storeId:s.storeId}));
async function legacy(previous, candidate) {
  return runLegacyPrecisionSource({sourceId:'precision:oh',stateId:'OH',collect:async()=>candidate,
    previousResults:{'precision:oh':{lastGoodAt:at,value:previous}},sourceRunnerOptions:{schedule:false,maxAttempts:1}});
}
const value = (metadata, signals=rows) => ({signals,roadblocks:[],...(metadata ? {metadata} : {})});

test('R1 historical Wake HTTP/www canonicalization succeeds only under an explicit identity', async () => {
  const original=globalThis.fetch, calls=[];
  globalThis.fetch=async (url, options) => {
    calls.push(String(url)); assert.equal(options.redirect,'manual');
    if(calls.length===1) return new Response(null,{status:301,headers:{location:'https://wakeabc.com/search-our-inventory/'}});
    return new Response('fixture');
  };
  try {
    const result=await fetchWithMeta('http://www.wakeabc.com/search-our-inventory', {reviewedSeedUrls:['https://wakeabc.com/']});
    assert.equal(result.ok,true,result.error); assert.equal(calls.length,2);
    assert.ok(calls.every(u=>u.startsWith('https:')), 'upgrade before sending any request');
  } finally {globalThis.fetch=original;}
});

for (const [name, before, after] of [
  ['independent complete to partial', {complete:true,recordsInspected:1000},{complete:false,recordsInspected:1000}],
  ['metadata-less to complete', null,{complete:true,recordsInspected:1000,inspectedScope:scope}],
  ['complete to metadata-less', {complete:true,recordsInspected:1000,inspectedScope:scope},null],
  ['scoped complete to partial', {complete:true,recordsInspected:10,inspectedScope:scope},{complete:false,recordsInspected:10,inspectedScope:scope}],
]) test(`R2 ${name} preserves current positives`,async()=>{
  const result=await legacy(value(before),value(after));
  assert.equal(result.sourceResults[0].status,'success');
  assert.equal(result.signals[0].canAlertAsInventory,true);
  assert.equal(result.metadata?.complete,after?.complete);
});

test('R2 large disjoint inspected scope cannot disguise positive collapse',async()=>{
  const before={complete:true,recordsInspected:10,inspectedScope:scope};
  const after={complete:true,recordsInspected:1000,inspectedScope:[{sku:'other',storeId:'other'}]};
  const result=await legacy(value(before),value(after,[]));
  assert.notEqual(result.sourceResults[0].status,'success');
});
test('R2 partial smaller scope retains independently current positives without claiming completeness',async()=>{
  const result=await legacy(value({complete:true,recordsInspected:1000,inspectedScope:scope}),value({complete:false,recordsInspected:1,inspectedScope:scope.slice(0,1)},rows.slice(0,1)));
  assert.equal(result.sourceResults[0].status,'success');
  assert.equal(result.signals[0].canAlertAsInventory,true);
  assert.equal(result.metadata.complete,false);
});

const ohRow=(sku,storeId)=>({id:`${sku}-${storeId}`,state:'OH',sourceRuntimeId:'precision:oh',raw:{product:{sku}},storeId,eventType:'browser_assisted_store_inventory_in_stock',locationPrecision:'store_level',canAlertAsInventory:true,observedAt:at});
function negativeCandidate(metadataChange={}, sourceChange={}) {
  const metadata={complete:true,recordsInspected:1,inspectedScope:[{sku:'abc',storeId:'1'}],negativeObservations:[{sku:'abc',storeId:'1',availabilityStatus:'sold_out',observedAt:at}],...metadataChange};
  return {state:'OH',signals:[],sourceResults:[{sourceId:'precision:oh',status:'success',ok:true,stale:false,metadata,...sourceChange}],precisionMetadata:metadata};
}
test('S1 uncovered SKU sibling survives even when bottle and store labels collide',()=>{
  const previous={state:'OH',signals:['abc','def','ghi'].map(sku=>({...ohRow(sku,'1'),canonicalName:'Same Bottle'}))};
  const candidate=negativeCandidate();
  candidate.signals=[{...ohRow('def','1'),canonicalName:'Same Bottle'}];
  const result=guardStateReport({previous,candidate,now:at});
  assert.deepEqual(result.report.signals.map(s=>s.id),['def-1','ghi-1']);
  assert.equal(result.report.signals[0].canAlertAsInventory,true);
  assert.equal(result.report.signals[1].stale,true);
});
test('S1 exact covered OH negative closes only that identity during state fallback',()=>{
  const previous={state:'OH',signals:[ohRow('abc','1'),ohRow('abc','2'),ohRow('def','1')]};
  const result=guardStateReport({previous,candidate:negativeCandidate(),now:at});
  assert.deepEqual(result.report.signals.map(s=>s.id),['abc-2','def-1']);
  assert.ok(result.report.signals.every(s=>s.stale && !s.canAlertAsInventory));
});
for (const [name, meta, source] of [
  ['partial',{complete:false},{}],['uncovered',{inspectedScope:[{sku:'abc',storeId:'2'}]},{}],
  ['failed',{}, {ok:false,status:'failed'}],['stale',{}, {stale:true}],['quarantined',{}, {quarantined:true}],
  ['unknown',{negativeObservations:[{sku:'abc',storeId:'1',availabilityStatus:'unknown',observedAt:at}]},{}],
]) test(`S1 ${name} negative cannot clear prior identity`,()=>{
  const result=guardStateReport({previous:{state:'OH',signals:[ohRow('abc','1')]},candidate:negativeCandidate(meta,source),now:at});
  assert.equal(result.report.signals.length,1);
});
