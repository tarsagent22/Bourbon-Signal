import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BourbonBible} from '../src/core/bible.mjs';
import {prepareCentralCityHiveCanary} from '../src/prepare-central-cityhive-canary.mjs';
import {collectCityHiveResearchReport,cityHiveResearchSourceForState} from '../src/research-cityhive-runtime.mjs';
import {CENTRAL_CITYHIVE_EXPANSION_SOURCES} from '../src/collectors/central-cityhive-expansion.mjs';
import {buildCurrentInventoryAlertsFromDrops} from '../src/export-site-contract.mjs';
const bible=await BourbonBible.load(new URL('../out/bourbon-bible.json',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const bodies=new Map(await Promise.all(CENTRAL_CITYHIVE_EXPANSION_SOURCES.map(async source=>[source.hostname,
  `<script type="application/json">${await readFile(new URL(`./fixtures/central-cityhive/${source.id}.json`,import.meta.url),'utf8')}</script>`])));

for(const state of ['WI','OK'])test(`${state} portable replay reparses raw merchant proof/current library and preserves clocks without delivery`,async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'central-canary-')),original=process.env.BOURBON_SIGNAL_SHADOW_MODE;
  assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));
  try{
    process.env.BOURBON_SIGNAL_SHADOW_MODE='1';
    // Synthetic workflow variables test validation only, never actual receipts.
    const env={BOURBON_SIGNAL_SHADOW_MODE:'1',GITHUB_ACTIONS:'true',GITHUB_RUN_ID:'123',GITHUB_REPOSITORY:'tarsagent22/Bourbon-Signal',GITHUB_SHA:'a'.repeat(40)};
    const report=await collectCityHiveResearchReport(cityHiveResearchSourceForState(state),bible,{env,reportDirectory:directory,
      cursorDir:path.join(directory,'cursor'),sleep:async()=>{},readAttempts:async()=>({}),writeAttempts:async()=>{},
      fetchText:async url=>({ok:true,status:200,url,text:bodies.get(new URL(url).hostname)})});
    assert.ok(report.metadata.receipts.every(receipt=>/^source-captures\/[A-Za-z0-9._-]+\.html$/.test(receipt.artifactPath)));
    const provenance={status:'verified_github_shadow_artifact',state,repository:env.GITHUB_REPOSITORY,workflowRunId:'123',
      headSha:env.GITHUB_SHA,artifactId:'456',artifactDigest:'b'.repeat(64)};
    const options={state,report:{...report,signals:[{id:'fabricated',price:1,tier:'unicorn'}]},reportDirectory:directory,bible,provenance};
    const result=await prepareCentralCityHiveCanary(options);
    assert.ok(result.drops.length>0);assert.ok(result.drops.every(row=>row.id!=='fabricated'));
    assert.equal(result.generatedAt,report.finishedAt);assert.equal(result.originalSourceClockPreserved,true);
    assert.equal(result.locations.length,state==='WI'?1:2);
    assert.ok(result.drops.every(row=>result.sourceReceipts.some(receipt=>receipt.observedAt===row.observedAt)));
    assert.ok(result.drops.every(row=>row.quantity===0&&row.quantityIsExact===false&&row.previewOnly&&row.eligibleForOnSite
      &&!row.canAlertAsInventory&&!row.canAlertAsWatch&&!row.eligibleForDelivery&&!row.eligibleForEmail&&!row.eligibleForSms));
    assert.equal(buildCurrentInventoryAlertsFromDrops(result.drops).length,0);
    await assert.rejects(()=>prepareCentralCityHiveCanary({...options,nowMs:Date.now()+121*60_000}),/stale/);
    for(const mutation of [{state:'TX'},{provenance:{...provenance,workflowRunId:'124'}},{provenance:{...provenance,artifactDigest:''}}]){
      await assert.rejects(()=>prepareCentralCityHiveCanary({...options,...mutation}));
    }
    for(const mutation of [
      receipt=>receipt.sha256='0'.repeat(64),receipt=>receipt.bytes=3*1024*1024,
      receipt=>receipt.artifactPath='../outside.html',receipt=>{delete receipt.artifactPath;receipt.file='/mutable/absolute.html';},
      receipt=>receipt.url='https://foreign.example/shop/',receipt=>receipt.finalUrl='https://foreign.example/shop/',
      receipt=>receipt.observedAt='2020-01-01T00:00:00Z',receipt=>receipt.observedAt=new Date(Date.now()+60_000).toISOString(),
    ]){
      const changed=structuredClone(report);mutation(changed.metadata.receipts[0]);
      await assert.rejects(()=>prepareCentralCityHiveCanary({...options,report:changed}));
    }
    const local=structuredClone(report);local.metadata.origin={kind:'local_shadow_not_workflow_issued'};
    await assert.rejects(()=>prepareCentralCityHiveCanary({...options,report:local}),/provenance/);
    const missing=structuredClone(report);missing.metadata.receipts=missing.metadata.receipts.filter(receipt=>new URL(receipt.url).searchParams.has('ch-query'));
    await assert.rejects(()=>prepareCentralCityHiveCanary({...options,report:missing}),/Partial state/);
    const duplicate=structuredClone(report);duplicate.metadata.receipts.push(duplicate.metadata.receipts[0]);
    await assert.rejects(()=>prepareCentralCityHiveCanary({...options,report:duplicate}));
    const disabled=new BourbonBible(structuredClone(bible.records).map(record=>({...record,libraryAlertEligible:false})));
    await assert.rejects(()=>prepareCentralCityHiveCanary({...options,bible:disabled}),/No qualified/);
    // Tampering the raw exact premise still fails even if a local actor updates
    // its receipt hash. The outer actual ZIP digest is independently verified.
    const wrong=structuredClone(report);
    for(const receipt of wrong.metadata.receipts){
      const source=CENTRAL_CITYHIVE_EXPANSION_SOURCES.find(source=>source.hostname===new URL(receipt.url).hostname);
      const body=Buffer.from(bodies.get(source.hostname).replaceAll(source.address,'999 Other Street'));
      receipt.sha256=sha(body);receipt.bytes=body.length;await writeFile(path.join(directory,receipt.artifactPath),body);
    }
    await assert.rejects(()=>prepareCentralCityHiveCanary({...options,report:wrong}),/exact registered premise/);
  }finally{if(original===undefined)delete process.env.BOURBON_SIGNAL_SHADOW_MODE;else process.env.BOURBON_SIGNAL_SHADOW_MODE=original;await rm(directory,{recursive:true,force:true});}
});
