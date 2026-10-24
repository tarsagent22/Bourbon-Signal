import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {transform} from 'esbuild';
import * as crypto from 'node:crypto';
type Row=Record<string,any>;
const now=Date.parse('2026-10-24T23:00:00.000Z'),commit='a'.repeat(40),key='fixture-only-receipt-key-1234567890123456789',secret='fixture-only-ops-secret';
const descriptor=(i:number,extra:Row={})=>({id:`ca:fixture-${i}`,state:'CA',kind:'shopify-variant-pickup',disabled:false,expiryHours:1,collectorVersion:'shopify-variant-pickup-v2-strict-premises',definition:{state:'CA',stores:[{id:`fixture:${i}`}],products:[{productId:String(100+i),variantId:String(200+i)}]},partitionBindings:[{storeId:`fixture:${i}`,productId:String(100+i),variantId:String(200+i)}],admission:{sourceId:`ca:fixture-${i}`,bindings:[{storeId:`fixture:${i}`,productId:String(100+i),variantId:String(200+i),canonicalBottleId:`bb_fixture_${i}`}]},...extra});
const receiptCode=(await transform(await readFile(new URL('../src/lib/nationwide-pilot-receipt.ts',import.meta.url),'utf8'),{loader:'ts',format:'cjs',target:'node24'})).code;
const captureCode=(await transform(await readFile(new URL('./lib/cohort-receipt-capture.mts',import.meta.url),'utf8'),{loader:'ts',format:'cjs',target:'node24'})).code;
function load(sources:Row[]=Array.from({length:5},(_,i)=>descriptor(i))){
  const receipt={exports:{}},capture={exports:{}};
  new Function('require','module','exports',receiptCode)((id:string)=>id==='node:crypto'?crypto:{SHOPIFY_PICKUP_SOURCES:sources},receipt,receipt.exports);
  new Function('require','module','exports',captureCode)((id:string)=>id==='node:crypto'?crypto:receipt.exports,capture,capture.exports);
  return {receipt:receipt.exports as Row,capture:capture.exports as Row,sources};
}
const iso=(ms:number)=>new Date(ms).toISOString(),body=(payload:Row)=>Buffer.from(JSON.stringify(payload));
function mockRead(mod:ReturnType<typeof load>,changes:Row={}){
  const calls:Row[]=[];let health=0;
  const read=async(url:string,headers:Row,limits:Row)=>{
    calls.push({url,headers,limits});const u=new URL(url);
    assert.ok(limits.maxBytes<=1024*1024&&limits.timeoutMs<=15000);
    if(u.pathname==='/api/ops/health'){health++;return {status:503,body:body({release:{status:'healthy',commit:changes.wrongCommit?'b'.repeat(40):commit,environment:changes.wrongEnvironment?'preview':'production'},engine:{snapshotId:changes.changedSnapshot&&health===2?'changed-snapshot':'snapshot'},privateExtra:'PRIVATE_CANARY'})};}
    if(u.pathname==='/api/ops/source-scheduler'){
      assert.equal(u.search,'?read=1&monitor=1');assert.equal(headers.authorization,`Bearer ${secret}`);
      return {status:200,body:body({enabled:true,healthy:true,privateExtra:'PRIVATE_CANARY',jobs:mod.sources.map(s=>({source_id:s.id,generation:1,disabled:s.disabled,failures:0,last_reason:'accepted',accepted_at:iso(now-1000),last_started_at:iso(now-2000),last_completed_at:iso(now-1000),next_due_at:iso(now+1800000),feedRows:1,candidates:0,projection:{PRIVATE_CANARY:true},lease_owner:'PRIVATE_CANARY'})),sourceHealth:mod.sources.map(s=>({source:s.id,status:'healthy',reason:'accepted',acceptedAt:iso(now-1000)})),traces:mod.sources.map(s=>({source_id:s.id,run_id:`run-${s.id}`,generation:changes.wrongGeneration?2:1,due_at:iso(now-3000),started_at:iso(changes.earlyRun?now-4000:now-2000),finished_at:iso(now-1000),status:'accepted',accounting:{trigger:changes.manual?'manual_or_rescue':'scheduled',manualDueReset:false,baseline:true,completeSnapshot:true,elapsedMs:1000,candidates:0,requestCount:2,bytes:100,private:'PRIVATE_CANARY'}})),pipeline:[]})};
    }
    assert.ok(['/api/drops','/api/coverage'].includes(u.pathname));
    assert.equal(mod.receipt.authorizePilotReceipt(u,headers[mod.receipt.PILOT_RECEIPT_HEADER],key,now),true);
    const source=mod.sources.find(s=>s.id===u.searchParams.get('source_receipt'));assert.ok(source);
    const b=source.admission.bindings[0];
    const identity={sourceId:source.id,runId:`run-${source.id}`,generation:1,state:source.state,storeId:b.storeId,productId:b.productId,variantId:b.variantId,canonicalBottleId:b.canonicalBottleId,observedAt:iso(changes.stale?now-3600001:now-1000)};
    const p={contractVersion:mod.receipt.PILOT_RECEIPT_CONTRACT,surface:u.pathname==='/api/drops'?'feed':'coverage',sourceId:source.id,snapshot:u.pathname==='/api/drops'?'snapshot:source:'+('1'.repeat(24))+':'+('2'.repeat(24)):'snapshot',receivedAt:iso(now),total:source.disabled?0:1,identities:source.disabled?[]:[identity],...(changes.privateReceipt?{private:'PRIVATE_CANARY'}:{})};
    if(changes.mismatch&&u.pathname==='/api/coverage')p.identities[0].generation=2;
    return {status:200,body:body(p)};
  };return {read,calls};
}
const options=(read:any)=>({expectedCommit:commit,producerCommit:commit,producerRunId:'12345',observationId:'cohort-s0',key,secret,read,now:()=>now});
test('five trusted sources produce exactly ten ordinary customer receipts,13reads, selected scheduler scalars only',async()=>{
  const mod=load(),m=mockRead(mod),r=await mod.capture.captureCohortReceipts(options(m.read));
  assert.equal(r.complete,true);assert.equal(r.allPairsMatch,true);assert.equal(r.receipts.length,10);assert.equal(m.calls.length,13);
  assert.equal(r.accounting.merchantRequests,0);assert.equal(r.acceptedNewStores,0);assert.equal(r.activated,false);assert.ok(!JSON.stringify(r).includes('PRIVATE_CANARY'));
  assert.ok(m.calls.every(c=>c.url.startsWith('https://www.bourbonsignal.com/')));
});
test('empty/unregistered authority or wrong producer fails before network; wrong live release stops after one read',async()=>{
  const empty=load([]);let calls=0;await assert.rejects(empty.capture.captureCohortReceipts(options(async()=>{calls++;})));assert.equal(calls,0);
  const mod=load(),m=mockRead(mod,{wrongCommit:true});const r=await mod.capture.captureCohortReceipts(options(m.read));assert.equal(r.complete,false);assert.equal(m.calls.length,1);
  const preview=mockRead(mod,{wrongEnvironment:true});assert.equal((await mod.capture.captureCohortReceipts(options(preview.read))).complete,false);assert.equal(preview.calls.length,1);
  await assert.rejects(mod.capture.captureCohortReceipts({...options(m.read),producerCommit:'b'.repeat(40)}));assert.equal(m.calls.length,1);
});
test('disabled, expired, mismatching or manually collected sources never become operational acceptance',async()=>{
  for(const change of [{stale:true},{mismatch:true},{manual:true},{earlyRun:true},{wrongGeneration:true}]){
    const mod=load(),m=mockRead(mod,change),r=await mod.capture.captureCohortReceipts(options(m.read));assert.equal(r.complete,true);assert.equal(r.allPairsMatch,false,JSON.stringify(change));assert.equal(m.calls.length,13);
  }
  const mod=load([descriptor(0,{disabled:true})]),m=mockRead(mod),r=await mod.capture.captureCohortReceipts(options(m.read));assert.equal(r.complete,true);assert.equal(r.allPairsMatch,false);
});
test('snapshot transition is captured as error, never silently rebound',async()=>{
  const mod=load(),m=mockRead(mod,{changedSnapshot:true}),r=await mod.capture.captureCohortReceipts(options(m.read));assert.equal(r.complete,false);assert.ok(r.errors.some((e:Row)=>e.reason==='snapshot_changed_during_capture'));
});
test('unexpected private receipt fields fail closed without persisting raw malformed body',async()=>{
  const mod=load(),m=mockRead(mod,{privateReceipt:true}),r=await mod.capture.captureCohortReceipts(options(m.read));assert.equal(r.complete,false);assert.equal(r.receipts.length,0);assert.ok(!JSON.stringify(r).includes('PRIVATE_CANARY'));assert.equal(m.calls.length,13);
});
test('byte limits and unknown failure do not retry or expose transport exception text',async()=>{
  const mod=load();let calls=0;
  const r=await mod.capture.captureCohortReceipts(options(async()=>{calls++;return {status:200,body:Buffer.alloc(256*1024+1)};}));assert.equal(r.complete,false);assert.equal(calls,1);
  const f=await mod.capture.captureCohortReceipts(options(async()=>{throw Error('PRIVATE_CANARY');}));assert.equal(f.complete,false);assert.ok(!JSON.stringify(f).includes('PRIVATE_CANARY'));assert.equal(f.accounting.failedRequests,1);
});
test('manual workflow is main-only/read-only; legacy capture and four-output path remain separate',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/shopify-cohort-receipts.yml',import.meta.url),'utf8');
  assert.match(workflow,/github.ref == 'refs\/heads\/main'/);assert.ok(!/schedule:|monitor-source-scheduler|runSourceScheduler|pollRuntimeSourceLanes/.test(workflow));assert.match(workflow,/persist-credentials: false/);
  const cli=await readFile(new URL('./capture-shopify-cohort-receipts.mts',import.meta.url),'utf8');assert.match(cli,/process.env.GITHUB_REF!=='refs\/heads\/main'/);assert.match(cli,/open\(reservation,'wx'/);assert.match(cli,/open\(output,'wx'/);
  const old=await readFile(new URL('./capture-nationwide-pilot.mjs',import.meta.url),'utf8');assert.match(old,/Object.entries\(PILOT_RECEIPT_SOURCES\)/);assert.match(old,/evidence.receipts.length===4/);
});

test('actual CLI rejects non-main before output and refuses an existing artifact without modifying bytes',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'bs-cohort-receipt-'));
  const runner=fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs',import.meta.url));
  const cli=fileURLToPath(new URL('./capture-shopify-cohort-receipts.mts',import.meta.url));
  const env={PATH:process.env.PATH||'',SystemRoot:process.env.SystemRoot||'',GITHUB_REF:'refs/heads/unreviewed',GITHUB_SHA:commit,COHORT_EXPECTED_COMMIT:commit};
  try{
    const rejected=spawnSync(process.execPath,[runner,cli],{cwd:directory,env,encoding:'utf8',timeout:15000});
    assert.equal(rejected.status,1);assert.match(rejected.stderr,/^Cohort capture failed closed;/);assert.doesNotMatch(rejected.stderr,/SyntaxError|does not provide an export/);await assert.rejects(stat(join(directory,'out')),{code:'ENOENT'});
    await mkdir(join(directory,'out'));await writeFile(join(directory,'out/shopify-cohort-capture.json'),'immutable-public-artifact');
    const duplicate=spawnSync(process.execPath,[runner,cli],{cwd:directory,env:{...env,GITHUB_REF:'refs/heads/main'},encoding:'utf8',timeout:15000});
    assert.equal(duplicate.status,1);assert.match(duplicate.stderr,/^Cohort capture failed closed;/);assert.doesNotMatch(duplicate.stderr,/SyntaxError|does not provide an export/);assert.equal(await readFile(join(directory,'out/shopify-cohort-capture.json'),'utf8'),'immutable-public-artifact');
    await assert.rejects(stat(join(directory,'out/shopify-cohort-capture.reservation.json')),{code:'ENOENT'});
  }finally{await rm(directory,{recursive:true,force:true});}
});

for(const mode of ['newer_failed','global_disabled','job_disabled','missing_head','duplicate_head','wrong_head_generation','wrong_last_started','paused','leased','missing_source_health','unrelated_source_degraded','missing_reset_proof','missing_complete_snapshot','missing_elapsed','duplicate_receipt','mixed_receipt_generation','invalid_date','received_future','observation_outside_run','small_server_clock_skew'])test(`current selected source and receipt consistency: ${mode}`,async()=>{
  const mod=load();
  if(mode==='mixed_receipt_generation'){
    const s=mod.sources[0],binding={...s.admission.bindings[0],storeId:'fixture:extra'};
    s.definition.stores.push({id:'fixture:extra'});s.admission.bindings.push(binding);s.partitionBindings.push({...binding});
  }
  const base=mockRead(mod);
  const read=async(url:string,headers:Row,limits:Row)=>{
    const r=await base.read(url,headers,limits),u=new URL(url),p=JSON.parse(r.body.toString());
    if(u.pathname==='/api/ops/source-scheduler'){
      if(mode==='newer_failed'){p.jobs[0].generation=2;p.jobs[0].failures=1;p.jobs[0].last_reason='http_5xx';p.traces.unshift({...p.traces[0],run_id:'newer-failed',generation:2,started_at:iso(now-500),finished_at:iso(now-250),status:'http_5xx'});}
      if(mode==='global_disabled')p.enabled=false;
      if(mode==='job_disabled')p.jobs[0].disabled=true;
      if(mode==='missing_head')p.jobs.shift();
      if(mode==='duplicate_head')p.jobs.push({...p.jobs[0]});
      if(mode==='wrong_head_generation')p.jobs[0].generation=2;
      if(mode==='wrong_last_started')p.jobs[0].last_started_at=iso(now-1500);
      if(mode==='paused')p.jobs[0].paused_until=iso(now+1000);
      if(mode==='leased')p.jobs[0].lease_until=iso(now+1000);
      if(mode==='missing_source_health')p.sourceHealth.shift();
      if(mode==='unrelated_source_degraded'){p.healthy=false;p.sourceHealth.push({source:'oh:unrelated-probe',status:'degraded'});}
      if(mode==='missing_reset_proof')delete p.traces[0].accounting.manualDueReset;
      if(mode==='missing_complete_snapshot')delete p.traces[0].accounting.completeSnapshot;
      if(mode==='missing_elapsed')delete p.traces[0].accounting.elapsedMs;
    }
    if(['/api/drops','/api/coverage'].includes(u.pathname)&&u.searchParams.get('source_receipt')===mod.sources[0].id){
      if(mode==='duplicate_receipt'){p.identities.push({...p.identities[0]});p.total=2;}
      if(mode==='mixed_receipt_generation'){
        p.identities.push({...p.identities[0],storeId:'fixture:extra',runId:'older-run',generation:2});p.total=2;
      }
      if(mode==='invalid_date')p.identities[0].observedAt='2026-02-30T23:00:00.000Z';
      if(mode==='received_future')p.receivedAt=iso(now+3600000);
      if(mode==='observation_outside_run')p.identities[0].observedAt=iso(now-3500000);
      if(mode==='small_server_clock_skew')p.receivedAt=iso(now+4000);
    }
    return {status:r.status,body:body(p)};
  };
  const result=await mod.capture.captureCohortReceipts(options(read));
  assert.equal(result.allPairsMatch,['unrelated_source_degraded','small_server_clock_skew'].includes(mode));
  if(mode==='newer_failed'){assert.equal(result.complete,true);assert.equal(result.pairs[0].normalFeedCoverageMatch,true);assert.equal(result.scheduler.payload.jobs[0].reason,'http_5xx');assert.equal(result.pairs[0].currentSelectedHeadHealthy,false);}
  if(mode==='missing_reset_proof')assert.equal(result.scheduler.payload.traces[0].accounting.manualDueReset,null);
});

test('unconfigured actual CLI reaches its prerequisite fence through the real Node24 tsx loader',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'bs-cohort-cli-loader-'));
  const loader=new URL('../node_modules/tsx/dist/loader.mjs',import.meta.url).href;
  const cli=fileURLToPath(new URL('./capture-shopify-cohort-receipts.mts',import.meta.url));
  // No inherited credentials/configuration and no bundling or mocked module exports.
  const env={PATH:process.env.PATH||'',SystemRoot:process.env.SystemRoot||''};
  const denyNetwork='data:text/javascript,'+encodeURIComponent("globalThis.fetch=()=>{console.error('UNEXPECTED_NETWORK_ATTEMPT');throw Error('network forbidden in startup test')}");
  try{
    const child=spawnSync(process.execPath,['--import',loader,'--import',denyNetwork,cli],{cwd:directory,env,encoding:'utf8',timeout:15000,maxBuffer:64*1024,windowsHide:true});
    assert.equal(child.error,undefined);assert.equal(child.signal,null);assert.equal(child.status,1);
    assert.equal(child.stdout,'');
    assert.equal(child.stderr.trim(),'Cohort capture failed closed; no source collection, rescue, activation or existing artifact overwrite.');
    assert.doesNotMatch(child.stderr,/SyntaxError|does not provide an export|UNEXPECTED_NETWORK_ATTEMPT/);
    await assert.rejects(stat(join(directory,'out')),{code:'ENOENT'});
  }finally{await rm(directory,{recursive:true,force:true});}
});

for(const mode of ['actual_route_shape','lane_off','unrelated_lane_unavailable','wrong_feed_base','wrong_coverage_base','bare_feed','unknown_lane','poll_off','poll_unavailable','extra_suffix','truncated_poll'])test('normal receipt broad/overlay snapshot binding: '+mode,async()=>{
  const mod=load(),base=mockRead(mod),lane='1'.repeat(24),poll='2'.repeat(24);
  const read=async(url:string,headers:Row,limits:Row)=>{
    const r=await base.read(url,headers,limits),u=new URL(url),p=JSON.parse(r.body.toString());
    if(u.pathname==='/api/drops'){
      const shapes:Row={actual_route_shape:'snapshot:source:'+lane+':'+poll,lane_off:'snapshot:source:off:'+poll,unrelated_lane_unavailable:'snapshot:source:unavailable:'+poll,
        wrong_feed_base:'other-snapshot:source:'+lane+':'+poll,bare_feed:'snapshot',unknown_lane:'snapshot:source:invented:'+poll,poll_off:'snapshot:source:'+lane+':off',
        poll_unavailable:'snapshot:source:'+lane+':poll-unavailable',extra_suffix:'snapshot:source:'+lane+':'+poll+':classification:other',truncated_poll:'snapshot:source:'+lane+':abc'};
      if(shapes[mode])p.snapshot=shapes[mode];
    }
    if(u.pathname==='/api/coverage'&&mode==='wrong_coverage_base')p.snapshot='other-snapshot';
    return {status:r.status,body:body(p)};
  };
  const result=await mod.capture.captureCohortReceipts(options(read));
  const positive=['actual_route_shape','lane_off','unrelated_lane_unavailable'].includes(mode);
  assert.equal(result.complete,true);assert.equal(result.allPairsMatch,positive);
  assert.equal(result.receipts[0].payload.snapshot,JSON.parse(result.receipts[0].body).snapshot);
  assert.equal(result.receipts[0].sha256,crypto.createHash('sha256').update(result.receipts[0].body).digest('hex'));
  assert.equal(result.receipts[1].payload.snapshot,mode==='wrong_coverage_base'?'other-snapshot':'snapshot');
  assert.equal(result.accounting.requests,13);assert.equal(result.acceptedNewStores,0);assert.equal(result.activated,false);
});
