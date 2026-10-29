import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {BourbonBible} from '../src/core/bible.mjs';
import {confidenceForSignal} from '../src/confidence-policy.mjs';
import {canonicalizeSignal} from '../src/operational-report.mjs';
import {bibleLookup,buildDrops,publicSignal} from '../src/export-site-contract.mjs';
import {verifySourceScopedEvidence} from '../src/source-scoped-refresh.mjs';
import {normalizeHistoricalImplementationBytes} from '../src/verification/historical-implementation.mjs';
const fixture=JSON.parse(await fs.readFile(new URL('../data/source-evidence/south-carolina-square-publication-20261029/bookers.json',import.meta.url),'utf8'));
test('actual fresh Square stock survives canonicalization, public projection and strict source publication proof',t=>{
 t.mock.method(Date,'now',()=>Date.parse(fixture.reportFinishedAt));
 const bible=new BourbonBible([fixture.record]),raw=structuredClone(fixture.row);
 const canonical=canonicalizeSignal(raw,bible),lookup=bibleLookup(bible.records),published=publicSignal(canonical,lookup);
 assert.equal(published.canAlertAsInventory,true);
 assert.equal(published.quantity,4);
 const drops=buildDrops([canonical],lookup,[canonical]);
 assert.equal(drops.length,1);
 assert.equal(drops[0].leafSourceRuntimeId,'sc:liquor-library');
 const proof=verifySourceScopedEvidence({state:'SC',sourceRefresh:{sourceIds:['liquor-library']},startedAt:fixture.reportStartedAt,finishedAt:fixture.reportFinishedAt,signals:[raw]},drops,['liquor-library'],fixture.reportFinishedAt);
 assert.equal(proof.verified,true);
 assert.equal(proof.sources[0].exportedRows,1);
 for(const mutate of [x=>x.storeId='wrong',x=>x.raw.square.locationId='wrong',x=>x.quantity=0,x=>x.observedAt='2020-01-01T00:00:00Z']){
  const altered=structuredClone(raw);mutate(altered);const policy=confidenceForSignal(altered);
  assert.equal(policy.canAlertAsInventory,false);assert.equal(policy.canAlertAsWatch,false);
 }
});
test('SC proof allowance cannot normalize a different state, broader raw copy, missing or duplicate boundary',async()=>{
 const name='engine/src/operational-report.mjs',text=await fs.readFile(new URL('../src/operational-report.mjs',import.meta.url),'utf8');
 const exact="    raw: signal.state === 'SC' && signal.sourceChain === 'liquor-library' ? { chain: signal.raw?.chain, square: signal.raw?.square } : signal.state === 'MS' ? {\n";
 for(const changed of [text.replace(exact,exact.replace("'SC'","'MS'")),text.replace(exact,exact.replace('square: signal.raw?.square','...signal.raw')),text.replace(exact,''),text+'\n'+exact])assert.throws(()=>normalizeHistoricalImplementationBytes(name,Buffer.from(changed)),/exact SC Square proof preservation/);
});
