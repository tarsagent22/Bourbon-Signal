import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectState } from '../src/collectors/generic-state.mjs';
import { guardStateReport as currentGuard } from '../src/state-report-guard.mjs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// Read-only index replay: the parent's staged guard is the pre-fix review input.
const guardStateReport = process.env.ASTRA_REVIEW_BASELINE === '1'
  ? (await import('data:text/javascript;base64,' + execFileSync('git', ['show', ':engine/src/state-report-guard.mjs'], {cwd:fileURLToPath(new URL('../..',import.meta.url))}).toString('base64'))).guardStateReport
  : currentGuard;
import { sourceRuntimeOptionsFromArtifacts } from '../src/sources/source-runtime-state.mjs';
const positive='3:6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b';
const soldOut='3:5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9';

test('S1 composed collectState -> state guard positive -> complete-empty -> restock',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'astra-review-oh-')), cwd=process.cwd();
  try {
    process.chdir(dir); await mkdir('out/browser',{recursive:true});
    let previous;
    async function refresh(bucket) {
      await writeFile('out/browser/ohlq-availability.json',JSON.stringify({generatedAt:new Date().toISOString(),products:[{ok:true,sku:'abc',productName:'Fixture Bourbon',inventories:[{AgencyId:'1',VariantCode:'abc',I:bucket,State:'OH'}]}]}));
      const candidate=await collectState({id:'OH',label:'Ohio',sources:[],apiCandidates:[]},{match:()=>null,scanText:()=>[]},{...sourceRuntimeOptionsFromArtifacts({previousReport:previous}),sourceRunnerOptions:{schedule:false,maxAttempts:1}});
      const guarded=guardStateReport({previous,candidate});
      assert.equal(candidate.sourceResults[0].status,'success');
      assert.equal(guarded.accepted,true);
      previous=guarded.report;
      return previous;
    }
    const inventory = report => report.signals.filter(s=>s.eventType?.startsWith('browser_assisted_store_inventory_'));
    const first=await refresh(positive);
    assert.equal(inventory(first).length,1);
    const contextIds=first.signals.filter(s=>!inventory(first).includes(s)).map(s=>s.id);
    const empty=await refresh(soldOut);
    assert.equal(inventory(empty).length,0);
    assert.deepEqual(empty.signals.map(s=>s.id),contextIds);
    assert.equal(empty.precisionMetadata.complete,true);
    const restock=await refresh(positive);
    assert.equal(inventory(restock).length,1);
    assert.equal(inventory(restock)[0].availabilityStatus,'in_stock');
    assert.notEqual(inventory(restock)[0].stale,true);
  } finally {process.chdir(cwd);await rm(dir,{recursive:true,force:true});}
});
