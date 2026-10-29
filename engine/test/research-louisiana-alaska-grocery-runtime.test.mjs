import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BourbonBible} from '../src/core/bible.mjs';
import {fixture,mockedCompleteGroceryFetch} from './helpers/synthetic-louisiana-alaska-promotion.mjs';
import {louisianaAlaskaResearchSourceForState,collectLouisianaAlaskaResearchReport,isLouisianaAlaskaGroceryShadowInventory} from '../src/research-louisiana-alaska-grocery-runtime.mjs';
import {prepareLouisianaAlaskaCanary} from '../src/prepare-louisiana-alaska-canary.mjs';
import {buildShadowEvidence} from '../src/run-expansion-shadow.mjs';
import {isLouisianaAlaskaGroceryOnSiteSignal} from '../src/louisiana-alaska-grocery-policy.mjs';
const bible=new BourbonBible(fixture.records);
for(const state of ['LA','AK'])test(`${state} full raw research replay preserves clocks, exact heads and zero alert authority`,async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'synthetic-laak-shadow-'));try{
 const env={BOURBON_SIGNAL_SHADOW_MODE:'1',GITHUB_ACTIONS:'true',GITHUB_RUN_ID:'123',GITHUB_SHA:'a'.repeat(40),GITHUB_REPOSITORY:'tarsagent22/Bourbon-Signal'};
 const options={env,reportDirectory:directory,incidentDir:path.join(directory,'incidents'),cursorDir:path.join(directory,'cursor'),sleep:async()=>{},fetchText:mockedCompleteGroceryFetch(state)};
 const report=await collectLouisianaAlaskaResearchReport(louisianaAlaskaResearchSourceForState(state),bible,options);
 assert.equal(report.metadata.complete,true);assert.equal(report.metadata.receipts.length,state==='LA'?43:53);assert.ok(report.signals.length>0);assert.ok(report.signals.every(isLouisianaAlaskaGroceryShadowInventory));
 assert.equal(buildShadowEvidence(state,report).complete,true);assert.equal(buildShadowEvidence(state,report).metrics.alertCandidateCount,0);
 assert.equal(isLouisianaAlaskaGroceryShadowInventory({...report.signals[0],eligibleForOnSite:true}),false);
 const provenance={status:'verified_github_shadow_artifact',state,repository:env.GITHUB_REPOSITORY,workflowRunId:'123',headSha:env.GITHUB_SHA,currentHead:env.GITHUB_SHA};
 const args={state,report:{...report,signals:[{id:'fabricated'}]},reportDirectory:directory,bible,provenance};
 const result=await prepareLouisianaAlaskaCanary(args);assert.ok(result.drops.length>0);assert.ok(result.drops.every(row=>row.id!=='fabricated'&&isLouisianaAlaskaGroceryOnSiteSignal(row)&&!Object.hasOwn(row,'previewOnly')));
 assert.ok(result.drops.every(row=>result.sourceReceipts.some(receipt=>receipt.observedAt===row.observedAt)));
 await assert.rejects(()=>prepareLouisianaAlaskaCanary({...args,nowMs:Date.now()+121*60000}),/stale/);
 await assert.rejects(()=>prepareLouisianaAlaskaCanary({...args,provenance:{...provenance,currentHead:'b'.repeat(40)}}),/exact source head/);
 const tampered=structuredClone(report);tampered.metadata.receipts[0].sha256='0'.repeat(64);await assert.rejects(()=>prepareLouisianaAlaskaCanary({...args,report:tampered}),/immutable receipt/);
 const incomplete=structuredClone(report);incomplete.metadata.receipts=incomplete.metadata.receipts.filter(receipt=>new URL(receipt.url).searchParams.get('q')!=='whiskey');await assert.rejects(()=>prepareLouisianaAlaskaCanary({...args,report:incomplete}),/complete broad inventory/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('native denial is sealed before late abort and blocks subsequent states on the same resolver without HTTP',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'synthetic-laak-denial-'));try{
 let calls=0;const env={BOURBON_SIGNAL_SHADOW_MODE:'1'},options={env,reportDirectory:directory,incidentDir:path.join(directory,'incidents'),sleep:async()=>{},fetchText:async(url,options)=>{calls++;await options.onResponse({url,status:403});throw Error('late abort');}};
 await assert.rejects(()=>collectLouisianaAlaskaResearchReport(louisianaAlaskaResearchSourceForState('LA'),bible,options),/late abort/);
 const journal=JSON.parse(await readFile(path.join(options.incidentDir,'LA.json'),'utf8'));assert.equal(journal['host:www.safeway.com'].httpStatus,403);assert.equal(journal['host:www.safeway.com'].reviewRequired,true);
 await assert.rejects(()=>collectLouisianaAlaskaResearchReport(louisianaAlaskaResearchSourceForState('AK'),bible,options),/durable denial/);assert.equal(calls,1);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('LA/AK workflows route only to the exact-head portable replay and mandatory issuer closure',async()=>{
 for(const name of ['state-expansion-canary.yml','state-promotion-provenance.yml']){
  const workflow=await readFile(new URL('../../.github/workflows/'+name,import.meta.url),'utf8');
  assert.ok(workflow.includes('LA|AK) family=laak; preparer=prepare-louisiana-alaska-canary.mjs'));
  assert.ok(workflow.includes('LA|AK) verifier=test-laak-public-canary.mjs'));
 }
 const {validateLaAkShadowOrigin}=await import('../../scripts/download-laak-shadow.mjs');
 const input={state:'LA',currentHead:'a'.repeat(40),run:{id:123,status:'completed',conclusion:'success',repository:{full_name:'tarsagent22/Bourbon-Signal'},path:'.github/workflows/state-expansion-shadow.yml',head_sha:'a'.repeat(40)},artifact:{id:456,name:'state-expansion-shadow-123',expired:false,digest:'sha256:'+'b'.repeat(64),size_in_bytes:100}};
 assert.equal(validateLaAkShadowOrigin(input).headSha,input.currentHead);
 assert.throws(()=>validateLaAkShadowOrigin({...input,currentHead:'b'.repeat(40)}),/source or workflow changed/);
 assert.throws(()=>validateLaAkShadowOrigin({...input,state:'WY'}),/source or workflow changed/);
 assert.throws(()=>validateLaAkShadowOrigin({...input,artifact:{...input.artifact,name:'other'}}),/Unbound/);
});
