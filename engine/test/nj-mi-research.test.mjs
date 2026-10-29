import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {BourbonBible} from '../src/core/bible.mjs';
import {collectNjMiResearchReport,njMiResearchSourceForState,collectNjMiDiscoveryReport,njMiDiscoverySourceForState} from '../src/nj-mi-research-runtime.mjs';
import {withCollectionContext} from '../src/core/collection-context.mjs';
import {researchSourceForState,withResearchLifecycle} from '../src/research-state-registry.mjs';
import {confidenceForSignal} from '../src/confidence-policy.mjs';
import {canonicalizeSignal} from '../src/operational-report.mjs';
import {bibleLookup,buildDrops,isActiveCustomerStateRow} from '../src/export-site-contract.mjs';
import {readNjMiResearchJournal} from '../src/nj-mi-research-journal.mjs';

const bible=await BourbonBible.load(new URL('../out/bourbon-bible.json',import.meta.url));
const fixtures=Object.fromEntries(await Promise.all(['NJ','MI'].map(async state=>[
  state,JSON.parse(await readFile(new URL(`./fixtures/additional-cityhive-expansion/${state}.json`,import.meta.url),'utf8')),
])));
const nativeManifest=JSON.parse(await readFile(new URL('./fixtures/independent-shopify-pickup/manifest.json',import.meta.url),'utf8'));
const native=new Map(await Promise.all(nativeManifest.captures.filter(row=>row.sourceId==='wine-palace-livonia').map(async row=>[
  row.requestedUrl,await readFile(new URL(`./fixtures/independent-shopify-pickup/${row.file}`,import.meta.url),'utf8')])));
const env={BOURBON_SIGNAL_SHADOW_MODE:'1'};
async function setup(t){
  const root=await mkdtemp(path.join(tmpdir(),'bs-nj-mi-research-'));assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir())+path.sep));
  t.after(()=>rm(root,{recursive:true,force:true}));return{reportDirectory:root,journalFile:path.join(root,'incidents.json'),env};
}

test('NJ/MI research registration cannot activate customer states or alert policy',()=>{
  const life=withResearchLifecycle({activeStates:['AZ'],states:{AZ:{publicStatus:'active'}}});
  assert.deepEqual(life.activeStates,['AZ']);
  for(const state of ['NJ','MI']){
    assert.equal(life.states[state].publicStatus,'research_only');assert.equal(life.states[state].inventoryAlertable,false);
    assert.equal(researchSourceForState(state,{shadowMode:false}),null);
    assert.equal(researchSourceForState(state,{shadowMode:true}),njMiResearchSourceForState(state));
    assert.equal(isActiveCustomerStateRow({state}),false);
    assert.equal(njMiResearchSourceForState(state).sources.length,state==='NJ'?4:1);
    assert.equal(njMiDiscoverySourceForState(state).sources.length,state==='NJ'?5:10);
  }
});

for(const status of [401,403,429,435])test(`NJ HTTP${status} stops each host once and journals before parent cancellation`,async t=>{
  const options=await setup(t),controller=new AbortController();let calls=0;
  await assert.rejects(withCollectionContext({signal:controller.signal},()=>collectNjMiResearchReport(njMiResearchSourceForState('NJ'),bible,{
    ...options,signal:controller.signal,fetchText:async url=>{calls++;controller.abort(Error('fixture parent cancellation'));return{url,ok:false,status,text:'',retryAfterSeconds:3*24*60*60};},
  })),/fixture parent cancellation/);
  assert.equal(calls,1);const journal=await readNjMiResearchJournal(options.journalFile),incident=journal.hosts['garyswine.com'];
  assert.equal(incident.httpStatus,status);assert.equal(incident.reviewRequired,true);
  assert.equal(Date.parse(incident.nextAllowedAt)-Date.parse(incident.observedAt),3*24*60*60_000);
  assert.deepEqual(Object.keys(journal).sort(),['hosts','schemaVersion']);
  const seen=[];await collectNjMiResearchReport(njMiResearchSourceForState('NJ'),bible,{...options,fetchText:async url=>{
    seen.push(new URL(url).hostname);return{url,ok:false,status:403,text:''};
  }});
  assert.ok(!seen.includes('garyswine.com'));assert.equal(new Set(seen).size,seen.length);
});

test('zero strict value parks remaining premises on the same host and survives another invocation',async t=>{
  const options=await setup(t),seen=[];
  const collect=()=>collectNjMiResearchReport(njMiResearchSourceForState('NJ'),bible,{...options,fetchText:async url=>{
    seen.push(new URL(url).hostname);return{url,ok:true,status:200,text:'<html>No products</html>'};
  }});
  const result=await collect();assert.equal(result.signals.length,0);assert.equal(seen.length,3);
  assert.equal(new Set(seen).size,3);await collect();assert.equal(seen.length,3);
});

test('malformed existing journal fails closed before retailer HTTP and remains unchanged',async t=>{
  const options=await setup(t),corrupt='{broken';await writeFile(options.journalFile,corrupt);let calls=0;
  await assert.rejects(collectNjMiResearchReport(njMiResearchSourceForState('NJ'),bible,{...options,fetchText:()=>{calls++;}}));
  assert.equal(calls,0);assert.equal(await readFile(options.journalFile,'utf8'),corrupt);
});

test('MI native exact Blanton variant is an independent fallback with portable hashed receipts and inactive projection',async t=>{
  const options=await setup(t),urls=[];
  const result=await collectNjMiDiscoveryReport(njMiDiscoverySourceForState('MI'),bible,{...options,fetchText:async url=>{
    urls.push(url);return native.has(url)?{url,ok:true,status:200,text:native.get(url)}:{url,ok:false,status:403,text:''};
  }});
  assert.equal(result.signals.length,1);assert.equal(result.signals[0].canonicalName,"Blanton's Original Single Barrel");
  assert.equal(urls.filter(url=>new URL(url).hostname==='megabev.com').length,1);
  assert.equal(result.signals[0].quantity,0);assert.equal(result.signals[0].quantityIsExact,false);
  assert.equal(result.signals[0].eligibleForDelivery,false);assert.equal(result.metadata.customerDeliveryAllowed,false);
  for(const receipt of result.metadata.receipts){
    assert.match(receipt.artifactPath,/^source-captures\/[A-Za-z0-9.-]+\.txt$/);
    const bytes=await readFile(path.join(options.reportDirectory,receipt.artifactPath));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),receipt.sha256);
  }
  const raw=result.signals[0],normalized=canonicalizeSignal(raw,bible);
  assert.equal(normalized.observedAt,raw.observedAt);assert.equal(normalized.quantity,0);
  assert.equal(confidenceForSignal(raw).canAlertAsInventory,false);
  const candidates=buildDrops([normalized],bibleLookup(bible.records),[normalized]);
  assert.ok(candidates.every(row=>row.canAlertAsInventory===false&&row.eligibleForDelivery!==true));
  assert.ok(candidates.every(row=>!isActiveCustomerStateRow(row)));
});

test('captured NJ/MI CityHive bodies require the registered exact premise and preserve inactive policy',async t=>{
  for(const state of ['NJ','MI']){
    const options=await setup(t),fixture=fixtures[state],host=new URL(fixture.sourceUrl).hostname;
    const result=await collectNjMiResearchReport(njMiResearchSourceForState(state),bible,{...options,fetchText:async url=>{
      const text=new URL(url).hostname===host?`<script type="application/json">${JSON.stringify(fixture)}</script>`:'';
      return{url,ok:Boolean(text),status:text?200:403,text};
    }});
    assert.ok(result.signals.length>0,state);
    for(const row of result.signals){assert.equal(row.quantity,0);assert.equal(row.quantityIsExact,false);assert.equal(row.raw.shadowOnly,true);
      assert.equal(confidenceForSignal(row).canAlertAsInventory,false);}
  }
});

test('hosted workflow always persists its incident-only file and synchronizes the full current library first',async()=>{
  const workflow=await readFile(new URL('../../.github/workflows/nj-mi-research-preflight.yml',import.meta.url),'utf8');
  const steps=workflow.split(/\r?\n {6}- /),file='engine/out/research-source-attempts/nj-mi-incidents.json';
  assert.ok(steps.some(step=>step.includes('actions/cache/restore@v4')&&step.includes(file)));
  assert.ok(steps.some(step=>step.includes('actions/cache/save@v4')&&step.includes(file)&&step.includes('if: always()')));
  assert.ok(workflow.indexOf('src/sync-library-catalog.mjs')<workflow.indexOf('node scripts/run-nj-mi-research-pass.mjs'));
  assert.ok(workflow.includes('contents: read'));assert.ok(!workflow.includes('pull_request'));
  const common=await readFile(new URL('../../.github/workflows/state-expansion-shadow.yml',import.meta.url),'utf8');
  const commonSteps=common.split(/\r?\n {6}- /);
  assert.ok(commonSteps.some(step=>step.includes('actions/cache/restore@v4')&&step.includes(file)));
  assert.ok(commonSteps.some(step=>step.includes('actions/cache/save@v4')&&step.includes(file)&&step.includes('if: always()')));
  assert.ok(common.includes('src/sync-library-catalog.mjs && npm run bible'));
});
