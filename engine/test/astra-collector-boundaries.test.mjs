import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGoToLiquorStoreProducts } from '../src/collectors/gotoliquorstore-surfaces.mjs';
import { collectPrecisionProbes } from '../src/collectors/precision-probes.mjs';
import { MISSISSIPPI_RETAILER_SOURCES } from '../src/collectors/mississippi-retailer-surfaces.mjs';
import { SourceCircuitBreaker } from '../src/sources/circuit-breaker.mjs';

const store={id:'fixture',merchantId:'12',hostname:'fixture.example',baseUrl:'https://fixture.example',categoryUrl:'https://fixture.example/bourbon'};
const anchor='<a href="/p/bourbon/123">Fixture Bourbon 750ml</a>';
const control='<button data-product-id="123" data-store-id="12">Add to Cart</button>';
const parse=(html)=>parseGoToLiquorStoreProducts(html,store,{stores:[store]});
test('F07 visible control positive',()=>assert.equal(parse(`<div class="product-item">${anchor}${control}</div>`).length,1));
for(const wrapper of ['div hidden','span hidden','fieldset disabled','template','div aria-hidden="true"','div style="display:none"']) {
  test(`F07 rejects control ancestor ${wrapper}`,()=>assert.deepEqual(parse(`<div class="product-item">${anchor}<${wrapper}>${control}</${wrapper.split(' ')[0]}></div>`),[]));
  test(`F07 rejects anchor ancestor ${wrapper}`,()=>assert.deepEqual(parse(`<div class="product-item"><${wrapper}>${anchor}</${wrapper.split(' ')[0]}>${control}</div>`),[]));
}
test('F07 control outside closed card cannot establish availability',()=>assert.deepEqual(parse(`<div class="product-item">${anchor}</div>${control}`),[]));

test('F02 actual generic-shaped MS dispatch preserves fallback and the shared breaker',async()=>{
  const source=MISSISSIPPI_RETAILER_SOURCES.find(s=>s.autonomousFetchAllowed!==false);
  const at='2026-09-04T12:00:00.000Z';
  const breaker=new SourceCircuitBreaker({failureThreshold:1});
  const fail=async()=>{throw new Error('fixture transport failure');};
  const result=await collectPrecisionProbes({id:'MS'}, {match:()=>null}, [], {
    previousSourceResults:{[source.sourceRuntimeId]:{lastGoodAt:at,value:{signals:[{id:'fixture',sourceRuntimeId:source.sourceRuntimeId,observedAt:at}],roadblocks:[],recordsInspected:10,metadata:{complete:true}}}},
    sourceCircuitBreaker:breaker, fetchText:fail,fetchJson:fail,fetchGetJson:fail,sourceRunnerOptions:{schedule:false,maxAttempts:1},
  });
  assert.equal(result.signals.length,1);
  assert.equal(result.signals[0].observedAt,at);
  assert.equal(result.signals[0].canAlertAsInventory,false);
  assert.ok(Object.keys(breaker.snapshot()).includes(source.sourceRuntimeId));
});

for(const state of ['NC','TX']) test(`F01 ${state} pre-aborted caller never reaches transport`,async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(_url,options)=>{calls++;return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));};
  try {
    await collectPrecisionProbes({id:state,label:state,sources:[]},{match:()=>null},[],{signal:AbortSignal.abort(),sourceRunnerOptions:{schedule:false,maxAttempts:1,timeoutMs:30}});
    assert.equal(calls,0);
  } finally {globalThis.fetch=original;}
});
for(const state of ['NC','TX']) test(`F01 ${state} actual dispatch aborts inherited transport at runtime deadline`,async()=>{
  const original=globalThis.fetch;
  let requestSignal;
  globalThis.fetch=async(_url,options)=>{requestSignal=options.signal; return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));};
  try {
    const result=await collectPrecisionProbes({id:state,label:state,sources:[]},{match:()=>null},[],{sourceRunnerOptions:{schedule:false,maxAttempts:1,timeoutMs:30}});
    assert.equal(result.sourceResults[0].status,'timeout');
    assert.ok(requestSignal,'fixture transport must be reached');
    assert.equal(requestSignal.aborted,true);
  } finally {globalThis.fetch=original;}
});
