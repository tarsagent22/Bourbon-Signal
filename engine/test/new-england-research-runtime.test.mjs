import test from 'node:test';import assert from 'node:assert/strict';import{mkdtemp,readFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';import path from'node:path';
import{BourbonBible}from'../src/core/bible.mjs';import{collectNewEnglandResearchReport,newEnglandResearchSourceForState}from'../src/new-england-research-runtime.mjs';
import{isValidShadowReport}from'../src/run-expansion-shadow.mjs';
import{isNewEnglandResearchInventory}from'../src/new-england-policy.mjs';import{prepareNewEnglandCanary,buildNewEnglandIssuedSourceProof}from'../src/prepare-new-england-canary.mjs';import{mockedNewEnglandFetch}from'./helpers/synthetic-new-england-production.mjs';
const bible=new BourbonBible(JSON.parse(await readFile(new URL('./fixtures/new-england/library.json',import.meta.url),'utf8')).records);
const env={BOURBON_SIGNAL_SHADOW_MODE:'1',GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'tarsagent22/Bourbon-Signal',GITHUB_RUN_ID:'999001',GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ATTEMPT:'1'};
test('NE complete seven-premise raw receipt research reparses into isolated canaries and exact three-run source closure',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'ne-proof-'));t.after(()=>rm(dir,{recursive:true,force:true}));let total=0;
 for(const state of['MA','CT','RI']){const reportDirectory=path.join(dir,state),report=await collectNewEnglandResearchReport(newEnglandResearchSourceForState(state),bible,{env,reportDirectory,incidentDir:path.join(dir,'incidents'),fetchText:mockedNewEnglandFetch()});
 assert.equal(isValidShadowReport(state,report),true);assert.equal(report.strategy,'retailer_store_inventory');assert.equal(report.sourceResults.length,state==='CT'?3:2);assert.ok(report.lastGoodAt);assert.equal(report.metadata.complete,true);assert.ok(report.signals.every(isNewEnglandResearchInventory));total+=report.signals.length;
 const provenance={status:'verified_github_shadow_artifact',state,repository:env.GITHUB_REPOSITORY,workflowRunId:env.GITHUB_RUN_ID,headSha:env.GITHUB_SHA,currentHead:env.GITHUB_SHA,artifactId:'999002',artifactDigest:'b'.repeat(64)};
 const input={state,report,reportDirectory,bible,provenance},value=await prepareNewEnglandCanary(input);assert.equal(value.locations.length,state==='CT'?3:2);assert.ok(value.drops.every(row=>row.previewOnly===true&&row.canAlertAsInventory===false&&row.eligibleForDelivery===false));
 await assert.rejects(()=>buildNewEnglandIssuedSourceProof({state,bible,inputs:[input,input]}),/Three distinct/);
 // These are deliberately fabricated schema-only run IDs. No fixture is qualifying workflow proof.
 const inputs=Array.from({length:3},(_,i)=>({...input,report:{...report,metadata:{...report.metadata,origin:{...report.metadata.origin,workflowRunId:String(999010+i)}}},provenance:{...provenance,workflowRunId:String(999010+i)}}));
 const proof=await buildNewEnglandIssuedSourceProof({state,bible,inputs});assert.equal(proof.sourceRuns.length,3);assert.equal(proof.allSourceRunsComplete,true);
 const receipt=report.metadata.receipts[0];await import('node:fs/promises').then(fs=>fs.writeFile(path.join(reportDirectory,receipt.artifactPath),'changed'));await assert.rejects(()=>prepareNewEnglandCanary(input),/hash\/length/);
 }assert.equal(total,13);
});
test('NE denied native headers are durable before parent abort and hold later attempts without HTTP',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'ne-denial-'));t.after(()=>rm(dir,{recursive:true,force:true}));const controller=new AbortController();let calls=0;
 await assert.rejects(()=>collectNewEnglandResearchReport(newEnglandResearchSourceForState('MA'),bible,{env,signal:controller.signal,reportDirectory:path.join(dir,'report'),incidentDir:dir,fetchText:async(url,opts)=>{calls++;try{await opts.onResponse({status:403,retryAfterSeconds:172800});}finally{controller.abort(Error('cancelled'));}throw Error('unreachable');}}));
 const journal=JSON.parse(await readFile(path.join(dir,'MA.json'),'utf8'));assert.equal(Object.values(journal.hosts)[0].httpStatus,403);assert.ok(Date.parse(Object.values(journal.hosts)[0].nextAllowedAt)-Date.parse(Object.values(journal.hosts)[0].lastAttemptAt)>=172800000);
 const result=await collectNewEnglandResearchReport(newEnglandResearchSourceForState('MA'),bible,{env,reportDirectory:path.join(dir,'again'),incidentDir:dir,fetchText:async()=>{calls++;return{ok:false,status:500,url:'https://invalid',text:''};}});assert.equal(result.metadata.complete,false);assert.ok(calls<=2,'held host never retried; independent sibling may receive its one request');
});
