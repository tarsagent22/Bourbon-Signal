import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {BourbonBible} from '../engine/src/core/bible.mjs';
import {runNewEnglandHostedPreflight} from './run-new-england-hosted-preflight.mjs';
const bible=await BourbonBible.load('engine/out/bourbon-bible.json');
const setup=async t=>{const dir=await mkdtemp(path.join(tmpdir(),'ne-hosted-preflight-'));assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));t.after(()=>rm(dir,{recursive:true,force:true}));return{env:{BOURBON_SIGNAL_SHADOW_MODE:'1'},incidentDir:path.join(dir,'incidents'),output:path.join(dir,'source')};};
test('once-per-host actual native403 is durable and cannot be retried by another invocation',async t=>{
  const opts=await setup(t),original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let requests=0;
  globalThis.fetch=async url=>{requests++;return{ok:false,status:403,url,headers:new Headers({'retry-after':'259200'}),body:{cancel:async()=>{}},text:async()=>{throw Error('Denied body must not be read');}};};
  const first=await runNewEnglandHostedPreflight(bible,opts);assert.equal(requests,6);assert.equal(first.requestCount,6);
  assert.equal(first.candidatePremises,7);assert.equal(first.uninspectedPremises.length,1);assert.equal(first.complete,false);assert.equal(first.signals.length,0);
  const second=await runNewEnglandHostedPreflight(bible,opts);assert.equal(requests,6);assert.equal(second.requestCount,0);assert.ok(second.reports.every(row=>row.heldForReview));
  const journal=JSON.parse(await readFile(path.join(opts.incidentDir,'MA.json'),'utf8'));assert.equal(journal.inFlight,null);
  assert.ok(Date.parse(journal.hosts['tableandvine.com'].nextAllowedAt)-Date.parse(journal.hosts['tableandvine.com'].lastAttemptAt)>=259200000);
});
test('native denied headers persist before parent abort/body cancellation; no stock capture is written',async t=>{
  const opts=await setup(t),original=globalThis.fetch,controller=new AbortController();t.after(()=>{globalThis.fetch=original;});let requests=0;
  globalThis.fetch=async url=>{requests++;controller.abort(Error('fixture parent abort after headers'));return{ok:false,status:429,url,headers:new Headers({'retry-after':'259200'}),body:{cancel:async()=>{
    const journal=JSON.parse(await readFile(path.join(opts.incidentDir,'MA.json'),'utf8'));assert.equal(journal.hosts['tableandvine.com'].httpStatus,429);
  }}};};
  const result=await runNewEnglandHostedPreflight(bible,{...opts,signal:controller.signal});assert.equal(requests,1);assert.equal(result.reports[0].status,429);assert.equal(result.signals.length,0);
  await assert.rejects(()=>readFile(path.join(opts.output,'source-captures')),{code:'ENOENT'});
});
test('unreadable or corrupt existing journal and failed denial writes fail closed with durable unresolved latches',async t=>{
  const opts=await setup(t);await mkdir(opts.incidentDir,{recursive:true});const file=path.join(opts.incidentDir,'MA.json');await writeFile(file,'corrupt');let requests=0;
  await assert.rejects(()=>runNewEnglandHostedPreflight(bible,{...opts,fetchText:()=>{requests++;}}));assert.equal(requests,0);assert.equal(await readFile(file,'utf8'),'corrupt');
});
