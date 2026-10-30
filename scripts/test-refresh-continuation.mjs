import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {REPOSITORY,REFRESH,PATHS,ENVIRONMENTS,DEFAULT_INPUTS,productionDecision,smokeDecision,dispatchOnce,snapshot,validateWait,readSmallZip,receiptArtifact,githubClient,produceSmoke,main} from './refresh-continuation.mjs';
const digest=value=>createHash('sha256').update(value).digest('hex'),SHA='a'.repeat(40),now=Date.parse('2026-10-29T20:00:00Z');
const run=(overrides={})=>({id:42,workflow_id:REFRESH.id,path:REFRESH.path,head_branch:'main',head_sha:SHA,
 repository:{full_name:REPOSITORY},head_repository:{full_name:REPOSITORY},run_attempt:1,status:'completed',conclusion:'success',
 event:'schedule',created_at:'2026-10-29T19:30:00Z',updated_at:'2026-10-29T19:40:00Z',...overrides});
const state=(overrides={})=>({repository:REPOSITORY,branch:'main',attempt:1,enabled:'1',maintenance:'0',mode:'production',currentSha:SHA,relaySha:SHA,
 relay:{id:99,path:PATHS.production,state:'active'},target:{...REFRESH,state:'active'},source:run(),eventName:'workflow_run',inputs:{},
 environmentName:ENVIRONMENTS.production,environment:{name:ENVIRONMENTS.production,protection_rules:[{type:'wait_timer',wait_timer:15}]},
 waitMinutes:15,activeRuns:[],recentRuns:[run()],nowMs:now,...overrides});

test('only trusted successful current-main default producer can continue, always with constant adaptive inputs',()=>{
 const plan=productionDecision(state());assert.equal(plan.continue,true);assert.deepEqual(plan.inputs,DEFAULT_INPUTS);
 assert.deepEqual(plan.inputs,{force_all_states:'false',states:'',sources:'',va_required_store_id:'',recovery_attempt:'0'});
 assert.equal(productionDecision(state({source:run({event:'workflow_dispatch'}),verifiedLineage:false})).reason,'unknown_or_targeted_scope');
 assert.equal(productionDecision(state({source:run({event:'workflow_dispatch'}),verifiedLineage:true})).continue,true);
});
for(const [name,change] of Object.entries({
 off:{enabled:'0'},missing_flag:{enabled:undefined},maintenance:{maintenance:'1'},missing_maintenance:{maintenance:undefined},
 fork:{repository:'untrusted/fork'},ref:{branch:'research'},rerun:{attempt:2},stale_relay:{relaySha:'b'.repeat(40)},
 relay_disabled:{relay:{id:99,path:PATHS.production,state:'disabled_manually'}},target_disabled:{target:{...REFRESH,state:'disabled_manually'}},
 missing_environment:{environment:null},wrong_timer:{environment:{name:ENVIRONMENTS.production,protection_rules:[{type:'wait_timer',wait_timer:0}]}},
 wrong_environment:{environment:{name:'Production',protection_rules:[{type:'wait_timer',wait_timer:15}]}},
 failed:{source:run({conclusion:'failure'})},cancelled:{source:run({conclusion:'cancelled'})},timed_out:{source:run({conclusion:'timed_out'})},
 unknown_event:{eventName:'pull_request'},unknown_source_event:{source:run({event:'push'})},
 wrong_workflow:{source:run({workflow_id:1})},wrong_path:{source:run({path:'.github/workflows/forged.yml'})},
 foreign_head:{source:run({head_repository:{full_name:'fork/repo'}})},foreign_repo:{source:run({repository:{full_name:'fork/repo'}})},
 branch:{source:run({head_branch:'research'})},producer_rerun:{source:run({run_attempt:2})},
 wrong_source_sha:{source:run({head_sha:'b'.repeat(40)})},unbounded_history:{historyTruncated:true},
 stale_clock:{source:run({updated_at:'2026-10-28T19:30:00Z'})},unknown_clock:{source:run({updated_at:null})},future_clock:{source:run({updated_at:'2026-10-29T20:01:00Z'})},
 queued:{activeRuns:[run({status:'queued'})]},waiting:{activeRuns:[run({status:'waiting'})]},active:{activeRuns:[run({status:'in_progress'})]},
 newer:{recentRuns:[run(),run({id:43,created_at:'2026-10-29T19:31:00Z'})]}
}))test('production rejects '+name,()=>assert.equal(productionDecision(state(change)).continue,false));

test('manual bootstrap is an explicit owner full-fleet acceptance attestation, never inferred from a targeted title',()=>{
 const seed=state({eventName:'workflow_dispatch',sender:'tarsagent22',source:run({event:'workflow_dispatch'}),inputs:{accepted_run_id:'42',accepted_full_fleet_snapshot:'true',states:'VA',sources:'forged',force_all_states:'true'}});
 assert.equal(productionDecision(seed).continue,true);assert.deepEqual(productionDecision(seed).inputs,DEFAULT_INPUTS);
 for(const change of [{sender:'github-actions[bot]'},{inputs:{accepted_run_id:'42',accepted_full_fleet_snapshot:'false'}},{inputs:{accepted_run_id:'43',accepted_full_fleet_snapshot:'true'}}])assert.equal(productionDecision({...seed,...change}).continue,false);
});

const smokeState=(pacing='immediate',cycle=1)=>state({mode:'smoke',relay:{id:98,path:PATHS.smoke,state:'active'},target:{id:77,path:PATHS.producer,state:'active'},
 source:run({workflow_id:77,path:PATHS.producer,event:'workflow_dispatch'}),environmentName:ENVIRONMENTS[pacing],
 environment:{name:ENVIRONMENTS[pacing],protection_rules:pacing==='paced'?[{type:'wait_timer',wait_timer:15}]:[]},waitMinutes:pacing==='paced'?15:0,
 marker:{schemaVersion:1,kind:'no_retailer_smoke',sourceRunId:42,mainSha:SHA,pacing,cycle,chainId:'c'.repeat(32)}});
test('harmless smoke models five mixed producer→relay→dispatch cycles and terminates; paced smoke has one15min hop',()=>{
 for(let cycle=1;cycle<=5;cycle++){
  const plan=smokeDecision(smokeState('immediate',cycle));assert.equal(plan.continue,cycle<5);if(cycle<5){assert.equal(plan.targetId,77);assert.equal(plan.waitMinutes,0);assert.equal(plan.cycle,cycle+1);}
 }
 assert.equal(smokeDecision(smokeState('immediate',5)).reason,'bounded_smoke_completed');
 assert.equal(smokeDecision(smokeState('paced',1)).waitMinutes,15);assert.equal(smokeDecision(smokeState('paced',2)).continue,false);
 assert.equal(smokeDecision({...smokeState(),target:{...REFRESH,state:'active'}}).continue,false);
});

test('wait proof requires exact source/main/environment and actual elapsed wall time, with bounded stale replay',()=>{
 const decision=productionDecision(state()),plan={schemaVersion:1,...decision,relayRunId:99,plannedAt:new Date(now-900001).toISOString()};
 assert.equal(validateWait(plan,decision,99,now),900001);
 for(const change of [{plannedAt:new Date(now-899999).toISOString()},{plannedAt:new Date(now-7200001).toISOString()},{plannedAt:'bad'},
  {mainSha:'b'.repeat(40)},{sourceRunId:1},{relayRunId:1},{environment:'Production'},{waitMinutes:0},{mode:'smoke'}])assert.throws(()=>validateWait({...plan,...change},decision,99,now),/unverified_or_unelapsed_wait/);
});

test('default-off snapshot does no GitHub calls; fork/ref/path/rerun contexts fail before provider access',async()=>{
 const trap={get:()=>{throw Error('Forbidden API');}},env={GITHUB_REPOSITORY:REPOSITORY,GITHUB_REF:'refs/heads/main',GITHUB_RUN_ATTEMPT:'1',GITHUB_WORKFLOW_REF:`${REPOSITORY}/${PATHS.production}@refs/heads/main`};
 const off=await snapshot({api:trap,event:{},eventName:'workflow_run',env,mode:'production'});assert.equal(productionDecision(off).continue,false);
 for(const change of [{GITHUB_REPOSITORY:'fork/repo'},{GITHUB_REF:'refs/heads/research'},{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_WORKFLOW_REF:`${REPOSITORY}/${PATHS.smoke}@refs/heads/main`}])
  await assert.rejects(()=>snapshot({api:trap,event:{},eventName:'workflow_run',env:{...env,CONTINUATION_ENABLED:'1',CONTINUATION_MAINTENANCE:'0',...change},mode:'production'}),/untrusted_relay_context/);
});

test('only one POST occurs after local intent; scopes cannot be copied and unknown outcomes never retry',async()=>{
 let posts=0;const saved=[],plan=productionDecision(state());
 const receipt=await dispatchOnce({api:{post:async(path,body)=>{posts++;assert.ok(path.endsWith('/311991230/dispatches'));assert.deepEqual(body,{ref:'main',inputs:{...DEFAULT_INPUTS,incident_key:'continuation-v1-99-42'}});return{workflow_run_id:100};}},plan,relayRunId:99,persist:async value=>{saved.push(structuredClone(value));}});
 assert.equal(posts,1);assert.equal(saved[0].status,'dispatch_intent');assert.equal(receipt.status,'dispatched');assert.equal(receipt.targetRunId,100);
 for(const outcome of ['throw','no_run_id']){
  posts=0;const saved=[];
  await assert.rejects(()=>dispatchOnce({api:{post:async()=>{posts++;if(outcome==='throw')throw Error('Unknown socket outcome');return{};}},plan,relayRunId:99,persist:async value=>saved.push(structuredClone(value))}));
  assert.equal(posts,1);assert.equal(saved.at(-1).status,'dispatch_outcome_unknown');
 }
 posts=0;await assert.rejects(()=>dispatchOnce({api:{post:async()=>{posts++;}},plan,relayRunId:99,persist:async()=>{throw Error('Disk EIO');}}));assert.equal(posts,0);
 await assert.rejects(()=>dispatchOnce({api:{post:async()=>{posts++;}},plan:{...smokeDecision(smokeState()),targetId:REFRESH.id},relayRunId:99,persist:async()=>{}}),/unreviewed_dispatch_target/);assert.equal(posts,0);
});

function zip(value,name='continuation-receipt.json'){
 const body=Buffer.from(JSON.stringify(value)),filename=Buffer.from(name),local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22);
 local.writeUInt32LE(0x04034b50);local.writeUInt32LE(body.length,18);local.writeUInt32LE(body.length,22);local.writeUInt16LE(filename.length,26);
 central.writeUInt32LE(0x02014b50);central.writeUInt32LE(body.length,20);central.writeUInt32LE(body.length,24);central.writeUInt16LE(filename.length,28);
 const offset=local.length+filename.length+body.length;end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+filename.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([local,filename,body,central,filename,end]);
}
test('receipt ZIPs are small, exact-file, origin/hash verified data; corruption/fork/replacement cannot authorize a hop',async()=>{
 const data={schemaVersion:1,status:'dispatched'},bytes=zip(data),artifact={id:1,name:'receipt',expired:false,size_in_bytes:bytes.length,digest:'sha256:'+digest(bytes),workflow_run:{id:42,head_sha:SHA}};
 const api={get:async()=>({total_count:1,artifacts:[artifact]}),download:async()=>bytes};assert.deepEqual(await receiptArtifact(api,run(),'receipt','continuation-receipt.json'),data);
 for(const change of [{digest:'sha256:'+'0'.repeat(64)},{expired:true},{workflow_run:{id:43,head_sha:SHA}},{workflow_run:{id:42,head_sha:'b'.repeat(40)}}]){
  await assert.rejects(()=>receiptArtifact({...api,get:async()=>({total_count:1,artifacts:[{...artifact,...change}]})},run(),'receipt','continuation-receipt.json'));
 }
 assert.throws(()=>readSmallZip(zip(data,'../continuation-receipt.json'),'continuation-receipt.json'));assert.throws(()=>readSmallZip(Buffer.alloc(262145),'continuation-receipt.json'));
});

test('GitHub transport is host/path restricted, bounded, and treats204 dispatch response as unknown',async()=>{
 let calls=0;const client=githubClient('synthetic-not-a-credential',{fetchImpl:async()=>{calls++;return new Response(null,{status:204});}});
 await assert.rejects(()=>client.get('/repos/foreign/repo/actions/runs'),/foreign_github_api_path/);assert.equal(calls,0);
 await assert.rejects(()=>client.post(`/repos/${REPOSITORY}/actions/workflows/311991230/dispatches`,{}),/dispatch_outcome_unknown/);assert.equal(calls,1);
});

test('a production bot dispatch needs the exact current-main issuer ZIP, elapsed timer and immutable constant scope',async()=>{
 const source=run({event:'workflow_dispatch',display_title:'Inventory recovery continuation-v1-99-41',actor:{login:'github-actions[bot]'},triggering_actor:{login:'github-actions[bot]'}});
 const issuer=run({id:99,workflow_id:98,path:PATHS.production,event:'workflow_run'}),relay={id:98,path:PATHS.production,state:'active'};
 const env={GITHUB_REPOSITORY:REPOSITORY,GITHUB_REF:'refs/heads/main',GITHUB_RUN_ATTEMPT:'1',GITHUB_WORKFLOW_REF:`${REPOSITORY}/${PATHS.production}@refs/heads/main`,GITHUB_SHA:SHA,CONTINUATION_ENABLED:'1',CONTINUATION_MAINTENANCE:'0'};
 const receipt={schemaVersion:1,status:'dispatched',mode:'production',relayRunId:99,sourceRunId:41,targetRunId:42,mainSha:SHA,targetId:REFRESH.id,
  environment:ENVIRONMENTS.production,waitMinutes:15,elapsedWaitMs:900000,inputs:{...DEFAULT_INPUTS,incident_key:'continuation-v1-99-41'}};
 for(const mutation of [null,{mode:'smoke'},{targetRunId:43},{sourceRunId:40},{mainSha:'b'.repeat(40)},{elapsedWaitMs:899999},{inputs:{...receipt.inputs,states:'VA'}}]){
  const data={...receipt,...mutation},bytes=zip(data);
  const api={download:async()=>bytes,get:async path=>{
   if(path.endsWith('git/ref/heads/main'))return{object:{sha:SHA}};
   if(path.endsWith('actions/workflows/refresh-continuation.yml'))return relay;
   if(path.endsWith('actions/workflows/311991230'))return{...REFRESH,state:'active'};
   if(path.endsWith('actions/runs/42'))return source;if(path.endsWith('actions/runs/99'))return issuer;
   if(path.includes('/artifacts?'))return{total_count:1,artifacts:[{id:7,name:'refresh-continuation-receipt-99',expired:false,digest:'sha256:'+digest(bytes),size_in_bytes:bytes.length,workflow_run:{id:99,head_sha:SHA}}]};
   if(path.includes('/environments/'))return{name:ENVIRONMENTS.production,protection_rules:[{type:'wait_timer',wait_timer:15}]};
   if(path.includes('&status='))return{total_count:0,workflow_runs:[]};
   if(path.includes('/runs?'))return{workflow_runs:[source]};throw Error('Unexpected synthetic API path');
  }};
  const s=await snapshot({api,event:{action:'completed',repository:{full_name:REPOSITORY},workflow_run:{id:42,workflow_id:REFRESH.id}},eventName:'workflow_run',env,mode:'production',nowMs:now});
  assert.equal(productionDecision(s).continue,mutation===null,JSON.stringify(mutation));
 }
});

test('smoke producer is bounded and cannot emit stock or invoke a production POST',async()=>{
 let posts=0;const api={post:async()=>{posts++;throw Error('Forbidden production POST');},get:async path=>path.endsWith('git/ref/heads/main')?{object:{sha:SHA}}:{id:77,path:PATHS.producer,state:'active'}};
 const env={GITHUB_REPOSITORY:REPOSITORY,GITHUB_REF:'refs/heads/main',GITHUB_RUN_ATTEMPT:'1',GITHUB_WORKFLOW_REF:`${REPOSITORY}/${PATHS.producer}@refs/heads/main`,GITHUB_SHA:SHA,GITHUB_RUN_ID:'42',CONTINUATION_SMOKE_ENABLED:'1',CONTINUATION_MAINTENANCE:'0'};
 const event={sender:{login:'tarsagent22'},inputs:{chain_id:'c'.repeat(32),cycle:'1',pacing:'immediate',confirm_smoke_only:'true',relay_run_id:''}};
 const marker=await produceSmoke({api,event,env});assert.equal(marker.kind,'no_retailer_smoke');assert.equal(marker.cycle,1);assert.equal(posts,0);
 for(const inputs of [{...event.inputs,cycle:'6'},{...event.inputs,cycle:'3',pacing:'paced'},{...event.inputs,confirm_smoke_only:'false'},{...event.inputs,chain_id:'../evil'}])await assert.rejects(()=>produceSmoke({api,event:{...event,inputs},env}));
 assert.equal(posts,0);
});

test('a refresh arriving during the wait is rechecked by actual dispatch handler and causes zero POST',async()=>{
 let queued=false,posts=0;
 const env={GITHUB_REPOSITORY:REPOSITORY,GITHUB_REF:'refs/heads/main',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'99',GITHUB_WORKFLOW_REF:`${REPOSITORY}/${PATHS.production}@refs/heads/main`,GITHUB_SHA:SHA,GITHUB_EVENT_NAME:'workflow_run',CONTINUATION_ENABLED:'1',CONTINUATION_MAINTENANCE:'0'};
 const event={action:'completed',repository:{full_name:REPOSITORY},workflow_run:{id:42,workflow_id:REFRESH.id}};
 const api={post:async()=>{posts++;throw Error('Forbidden duplicate POST');},get:async path=>{
  if(path.endsWith('git/ref/heads/main'))return{object:{sha:SHA}};
  if(path.endsWith('actions/workflows/refresh-continuation.yml'))return{id:98,path:PATHS.production,state:'active'};
  if(path.endsWith('actions/workflows/311991230'))return{...REFRESH,state:'active'};
  if(path.endsWith('actions/runs/42'))return run({created_at:new Date(Date.now()-1200000).toISOString(),updated_at:new Date(Date.now()-1000000).toISOString()});
  if(path.includes('/environments/'))return{name:ENVIRONMENTS.production,protection_rules:[{type:'wait_timer',wait_timer:15}]};
  if(path.includes('&status='))return{total_count:queued?1:0,workflow_runs:queued?[run({id:43,status:'queued'})]:[]};
  if(path.includes('/runs?'))return{workflow_runs:[run()]};throw Error('Unexpected synthetic API path');
 }};
 assert.equal(productionDecision(await snapshot({api,event,eventName:'workflow_run',env,mode:'production'})).continue,true);
 queued=true;
 await main({env,event,api,args:['--mode=production','--phase=dispatch']});assert.equal(posts,0);
});

test('workflow/CI hooks stay off by default, smoke has no production runner or source credentials, and source/root package are not edited',async()=>{
 const [production,relay,producer,ci,ops]=await Promise.all([PATHS.production,PATHS.smoke,PATHS.producer,'.github/workflows/ci.yml','scripts/verify-ops-workflow.mjs'].map(path=>readFile(path,'utf8')));
 for(const workflow of [production,relay,producer]){
  assert.ok(workflow.includes("CONTINUATION_MAINTENANCE || '1'"));assert.ok(workflow.includes("ENABLED || '0'"));assert.ok(workflow.includes('persist-credentials: false'));
  assert.ok(workflow.includes('include-hidden-files: true'),'explicit small JSON paths under .operator must actually upload');
  assert.doesNotMatch(workflow,/BLOB_READ_WRITE_TOKEN|ENGINE_SNAPSHOT_ENCRYPTION_KEY|npm ci|refresh-feed\.yml|secrets\./);
 }
 assert.ok(production.includes('all currently admitted customer-active states'));assert.ok(!production.includes('33 admitted states'));
 assert.ok(production.includes('workflows: [Refresh production inventory feed]'));assert.ok(relay.includes('workflows: [Refresh continuation harmless smoke]'));
 assert.ok(ci.includes('node --test scripts/test-refresh-continuation.mjs'));assert.ok(ops.includes('test-refresh-continuation.mjs'));
});
