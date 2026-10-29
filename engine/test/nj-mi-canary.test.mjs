import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {BourbonBible} from '../src/core/bible.mjs';
import {collectNjMiResearchReport,njMiResearchSourceForState} from '../src/nj-mi-research-runtime.mjs';
import {prepareNjMiCanary} from '../src/prepare-nj-mi-canary.mjs';
import {validateNjMiShadowOrigin} from '../../scripts/download-njmi-shadow.mjs';
const bible=await BourbonBible.load(new URL('../out/bourbon-bible.json',import.meta.url));
const fixture=JSON.parse(await readFile(new URL('./fixtures/additional-cityhive-expansion/MI.json',import.meta.url),'utf8'));

test('candidate-only MI canary reparses raw captures and rejects incomplete, stale, foreign and changed-clock proof',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'bs-nj-mi-canary-'));
  assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir())+path.sep));t.after(()=>rm(root,{recursive:true,force:true}));
  const env={BOURBON_SIGNAL_SHADOW_MODE:'1',GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'tarsagent22/Bourbon-Signal',GITHUB_RUN_ID:'10001',GITHUB_SHA:'a'.repeat(40)};
  const report=await collectNjMiResearchReport(njMiResearchSourceForState('MI'),bible,{env,reportDirectory:root,journalFile:path.join(root,'incidents.json'),
    fetchText:async url=>({url,ok:true,status:200,text:`<script type="application/json">${JSON.stringify(fixture)}</script>`})});
  assert.equal(report.metadata.complete,true);assert.equal(report.metadata.receipts.length,1);
  const provenance={status:'verified_github_shadow_artifact',state:'MI',repository:env.GITHUB_REPOSITORY,workflowRunId:env.GITHUB_RUN_ID,
    headSha:env.GITHUB_SHA,currentHead:env.GITHUB_SHA,artifactId:'10002',artifactDigest:'b'.repeat(64)};
  const input={state:'MI',report,reportDirectory:root,bible,provenance};
  const good=await prepareNjMiCanary(input);assert.equal(good.locations.length,1);assert.equal(good.drops.length,1);
  assert.ok(good.drops.every(row=>row.observedAt===report.metadata.receipts[0].observedAt&&row.quantity===0&&row.quantityIsExact===false&&row.eligibleForDelivery===false));
  const poisoned=structuredClone(report);poisoned.signals=[];
  assert.equal((await prepareNjMiCanary({...input,report:poisoned})).drops.length,1,'mutable report rows are never authority');
  for(const mutate of [r=>r.metadata.complete=false,r=>r.metadata.scope='old_discovery_scope',r=>r.metadata.receipts=[],
    r=>r.metadata.receipts[0].sha256='0'.repeat(64),r=>r.metadata.receipts[0].url='https://foreign.example/',
    r=>r.metadata.receipts[0].artifactPath='../outside.txt',r=>r.metadata.receipts[0].observedAt=new Date(Date.now()-3*60*60_000).toISOString()]){
    const bad=structuredClone(report);mutate(bad);await assert.rejects(prepareNjMiCanary({...input,report:bad}));
  }
});

test('NJ/MI downloader requires exact implementation head and its dedicated GitHub archive',()=>{
  const run={id:1001,conclusion:'success',status:'completed',repository:{full_name:'tarsagent22/Bourbon-Signal'},path:'.github/workflows/state-expansion-shadow.yml',head_sha:'a'.repeat(40)};
  const artifact={id:1002,name:'nj-mi-research-1001',digest:'sha256:'+'b'.repeat(64),size_in_bytes:100};
  assert.equal(validateNjMiShadowOrigin({state:'NJ',run,artifact,currentHead:run.head_sha}).status,'verified_github_shadow_artifact');
  assert.throws(()=>validateNjMiShadowOrigin({state:'NJ',run,artifact,currentHead:'c'.repeat(40)}),/changed/);
  assert.throws(()=>validateNjMiShadowOrigin({state:'NJ',run,artifact:{...artifact,name:'unrelated'},currentHead:run.head_sha}),/Unbound/);
});
