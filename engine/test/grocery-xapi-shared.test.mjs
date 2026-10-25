import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { collectGroceryXapiCapture as collect, groceryXapiRequest, collectGroceryXapiSources } from '../src/collectors/grocery-xapi.mjs';
import { BourbonBible } from '../src/core/bible.mjs';
const fixture = JSON.parse(await readFile(new URL('./fixtures/grocery-xapi/2026-10-25-five-prospects-six-premises-derived.json', import.meta.url), 'utf8'));
const bibleData = JSON.parse(await readFile(new URL('./fixtures/shopify-variant-pickup/current-bourbon-bible.json', import.meta.url), 'utf8'));
const bible = new BourbonBible(bibleData.records);
const policies = Object.fromEntries(['NV','CA','AZ'].map(state => [state, { admitSource: () => true, admitBottle: () => true }]));
const sourceOf = s => ({ ...s, banner: s.host.split('.')[1] });
const inputOf = s => ({ source: sourceOf(s), payload: { response: { docs: s.products.map(p => p.product) } }, observedAt: s.source.capturedAt, bible, policies });
test('conflicting duplicate SKU and bottle-size metadata fail closed without borrowing a positive row', () => {
  const input = inputOf(fixture.sources[0]);
  const first = structuredClone(input.payload.response.docs[0]);
  input.payload = { response: { docs: [first, { ...first, channelInventory: { instore: 0 } }] } };
  assert.deepEqual(collect(input), []);
  input.payload.response.docs = [first, structuredClone(first)];
  assert.equal(collect(input).length, 1);
  input.payload.response.docs = [{ ...first, dispItemSizeQty: 1750 }];
  assert.deepEqual(collect(input), []);
});
for (const s of fixture.sources) test(`real complete objects ${s.sourceId}`, () => {
  const result = collect(inputOf(s));
  assert.equal(result.length, s.products.length);
  for (let i=0; i<result.length; i++) {
    const expected = s.products[i].expected;
    for (const key of ['productId','quantity','reportedQuantity','canonicalName','inventorySemantics']) assert.equal(result[i][key], expected[key]);
  }
  const actual = new URL(groceryXapiRequest(sourceOf(s), 123).url), captured = new URL(s.source.url);
  actual.searchParams.delete('request-id'); captured.searchParams.delete('request-id');
  assert.equal(actual.href, captured.href);
});
test('fail closed source/state, canonical policy, matcher and quantity negatives', () => {
  const original = inputOf(fixture.sources[0]);
  for (const mutate of [
    x => { x.source.state='OH'; }, x => { x.source.premise.state='CA'; },
    x => { x.source.host='www.safeway.com'; }, x => { x.source.premise.storeId='albertsons:9999'; },
    x => { x.policies={}; }, x => { x.policies={NV:{admitSource:()=>true,admitBottle:()=>false}}; },
    x => { x.payload.response.docs.forEach(p=>p.storeId='9999'); },
    x => { x.payload.response.docs.forEach(p=>p.dispItemPackageQty=2); },
    x => { x.payload.response.docs=x.payload.response.docs.slice(0,1); x.payload.response.docs[0].upc='bad'; },
  ]) { const input=structuredClone({...original,bible:null,policies:null}); input.bible=bible; input.policies=policies; mutate(input); assert.deepEqual(collect(input),[]); }
  for (const value of [true, null, [], 0, -1, 1.5, Number.MAX_SAFE_INTEGER+1, '1.5']) {
    const input=inputOf(fixture.sources[0]); input.payload=structuredClone(input.payload);
    input.payload.response.docs.forEach(p=>p.channelInventory={instore:1,instoreItemQty:value});
    assert.deepEqual(collect(input),[]);
  }
});
test('one injected collection path for all captures; no retries after denial', async () => {
  const sources=fixture.sources.map(sourceOf), calls=[];
  const fetchText=async url=>{calls.push(url);const id=new URL(url).searchParams.get('storeid');const s=fixture.sources.find(s=>s.merchantId===id);return {ok:true,status:200,text:JSON.stringify(inputOf(s).payload)};};
  const dependencies={sources,bible,policies,fetchText,pace:async()=>{},clock:()=>1792900000000,serialize:c=>JSON.parse(JSON.stringify(c))};
  const result=await collectGroceryXapiSources(dependencies);
  assert.equal(result.signals.length,16); assert.equal(calls.length,6);
  let deniedCalls=0;
  const denied=await collectGroceryXapiSources({...dependencies,fetchText:async()=>{deniedCalls++;return {ok:false,status:403};}});
  assert.equal(deniedCalls,1); assert.deepEqual(denied.signals,[]);
});
test('volume, timestamp and ZIP reject coercion and non-decimal values', () => {
  for (const volume of [[750], {valueOf:()=>750}, true, '7.5e2', '0x2ee', '', null]) {
    const input=inputOf(fixture.sources[0]); input.payload=structuredClone(input.payload);
    input.payload.response.docs.forEach(p=>p.dispItemSizeQty=volume);
    assert.deepEqual(collect(input),[]);
  }
  for (const observedAt of [1792900000000, ['2026-10-25T03:13:20.052Z'], '2026-10-25', '2026-02-30T00:00:00.000Z']) assert.deepEqual(collect({...inputOf(fixture.sources[0]),observedAt}),[]);
  const input=inputOf(fixture.sources[0]); input.source=structuredClone(input.source); input.source.premise.zip=89121;
  assert.deepEqual(collect(input),[]);
  for (const id of ['123', [123], NaN, Infinity, 1.5, -1, Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>groceryXapiRequest(sourceOf(fixture.sources[0]),id),TypeError);
});
test('bounded collection snapshots admitted sources and propagates transport limits', async () => {
  const sources=fixture.sources.slice(0,2).map(s=>structuredClone(sourceOf(s)));
  const controller=new AbortController(), visited=[];
  const dependencies={sources,bible,policies,clock:()=>1792900000000,pace:async()=>{},serialize:c=>c,signal:controller.signal};
  const result=await collectGroceryXapiSources({...dependencies,fetchText:async(url,options)=>{
    assert.equal(options.maxRedirects,0); assert.equal(options.maxBytes,2097152); assert.equal(options.timeoutMs,12000); assert.equal(options.retries,0); assert.equal(options.signal,controller.signal);
    const id=new URL(url).searchParams.get('storeid'); visited.push(id);
    sources[1].merchantId='9999'; sources[1].premise.address='mutated'; sources.push(sourceOf(fixture.sources[2]));
    const s=fixture.sources.find(s=>s.merchantId===id);
    return {ok:true,status:200,text:JSON.stringify(inputOf(s).payload)};
  }});
  assert.deepEqual(visited,['4024','1059']); assert.equal(result.signals.length,4);
  await assert.rejects(collectGroceryXapiSources({...dependencies,sources:Array(7).fill(sourceOf(fixture.sources[0])),fetchText:async()=>assert.fail('oversize cohort fetched')}),TypeError);
});
test('abort before fetch and after transport prevents subsequent work', async () => {
  const controller=new AbortController(); controller.abort(); let calls=0;
  const dependencies={sources:fixture.sources.map(sourceOf),bible,policies,clock:()=>1792900000000,pace:async()=>{},serialize:()=>assert.fail('aborted serialization'),fetchText:async()=>{calls++;}};
  await assert.rejects(collectGroceryXapiSources({...dependencies,signal:controller.signal}),{name:'AbortError'}); assert.equal(calls,0);
  const active=new AbortController();
  await assert.rejects(collectGroceryXapiSources({...dependencies,signal:active.signal,fetchText:async()=>{calls++;active.abort();return {ok:true,status:200,text:'{}'};}}),{name:'AbortError'}); assert.equal(calls,1);
});
