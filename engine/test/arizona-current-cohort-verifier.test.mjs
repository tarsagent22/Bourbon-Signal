import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {verifyArizonaExpansionArtifact} from '../src/verify-az.mjs';
import {ARIZONA_XAPI_RELEASED_STORE_IDS} from '../src/collectors/arizona-xapi.mjs';
const fixture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/arizona-xapi/2026-10-31-phoenix-production.json.gz',import.meta.url))));
const phoenix=row=>row.sourceChain==='virginia-market-phoenix';

test('current138-premise production capture proves Phoenix expansion without recounting released groceries',t=>{
  t.mock.timers.enable({apis:['Date'],now:fixture.now});
  const result=verifyArizonaExpansionArtifact(fixture);
  assert.equal(result.selectedStores,138);assert.equal(result.recentReleasedPublicStores,4);
  assert.equal(result.newPhoenixPublicRows,4);assert.equal(result.newPhoenixAllocatedRows,2);
  assert.equal(result.requiredPhoenixPublicRows,4);assert.equal(result.requiredPhoenixAllocatedRows,2);
  assert.equal(result.currentReleasedCohortSize,138);assert.equal(result.newXapiPublicStoresSinceCurrentRelease,0);
  const newGroceries=fixture.drops.drops.filter(row=>/Arizona XAPI/.test(row.sourceLabel||row.source||'')
    &&!ARIZONA_XAPI_RELEASED_STORE_IDS.includes(String(row.storeId).split(':')[1]));
  assert.equal(newGroceries.length,0);
});

test('Phoenix activation still requires current source-bound stock and allocated rows',t=>{
  t.mock.timers.enable({apis:['Date'],now:fixture.now});
  for(const mutate of [
    input=>{input.drops.drops=input.drops.drops.filter(row=>!phoenix(row));},
    input=>{input.drops.drops.find(row=>phoenix(row)&&row.tier==='allocated').tier='limited';},
    input=>{input.drops.drops.find(phoenix).storeAddress='1 Wrong Street, Phoenix, AZ85006';},
    input=>{input.drops.drops.find(phoenix).observedAt=new Date(Date.parse(input.state.startedAt)-1).toISOString();},
  ]){const changed=structuredClone(fixture);mutate(changed);assert.throws(()=>verifyArizonaExpansionArtifact(changed),/Virginia Market|original source/);}
});

test('all released premises and the original recent-store continuity floor remain required',t=>{
  t.mock.timers.enable({apis:['Date'],now:fixture.now});
  const missing=structuredClone(fixture);missing.state.precisionMetadata.xapi.selectedStores=missing.state.precisionMetadata.xapi.selectedStores.filter(row=>!row.storeId.endsWith(':239'));
  assert.throws(()=>verifyArizonaExpansionArtifact(missing),/All138/);
  const lost=structuredClone(fixture);lost.drops.drops=lost.drops.drops.filter(row=>!['25','4'].includes(String(row.storeId).split(':')[1]));
  assert.throws(()=>verifyArizonaExpansionArtifact(lost),/October30 released/);
  const ordinary=structuredClone(fixture);ordinary.drops.drops=ordinary.drops.drops.filter(row=>!phoenix(row));
  ordinary.expectations={};assert.equal(verifyArizonaExpansionArtifact(ordinary).status,'ok','ordinary refresh can report a sold-out independent without blocking unrelated current inventory');
});
