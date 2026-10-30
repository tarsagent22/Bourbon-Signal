// Tests only. All promotion identities below come from explicitly synthetic unit
// fixtures; no source observation, workflow issuance or activation is implied.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const own=fileURLToPath(import.meta.url),mode=process.argv.find(v=>v.startsWith('--registry-child='))?.split('=')[1];
const states=['MA','CT','RI'];
if(mode){
 const {mock}=await import('node:test');
 const original=await import('../src/state-lifecycle.mjs');
 const {syntheticNewEnglandPromotion}=await import('./helpers/synthetic-new-england-production.mjs');
 const {newEnglandProductionAllowed,collectNewEnglandProductionSource}=await import('../src/collectors/new-england-production.mjs');
 const lifecycle=structuredClone(original.STATE_LIFECYCLE_CONFIG),options=Object.fromEntries(states.map(state=>[state,syntheticNewEnglandPromotion(state)]));
 lifecycle.activeStates=lifecycle.activeStates.filter(state=>!states.includes(state));
 if(mode!=='inactive')for(const state of states){lifecycle.activeStates.push(state);lifecycle.states[state]=options[state].lifecycleConfig.states[state];}
 lifecycle.activeStates=[...new Set(lifecycle.activeStates)];
 // Source module is not modified or reimplemented. Only the lifecycle provider
 // boundary is replaced inside this isolated child process.
 mock.module(new URL('../src/state-lifecycle.mjs',import.meta.url),{namedExports:{...original,STATE_LIFECYCLE_CONFIG:lifecycle,STATE_LIFECYCLE:lifecycle.states,CUSTOMER_ACTIVE_STATE_IDS:new Set(lifecycle.activeStates)}});
 const registry=await import('../src/state-sources.mjs');
 const run=await readFile(new URL('../src/run.mjs',import.meta.url),'utf8');
 const begin=run.indexOf('  const selectedStateSources = REQUESTED_STATE_IDS.size\n'),end=run.indexOf('  const previousMetrics =',begin);
 assert.ok(begin>=0&&end>begin,'Actual run.mjs selector boundary changed; review this isolated execution');
 assert.equal(run.indexOf('  const selectedStateSources = REQUESTED_STATE_IDS.size\n',begin+1),-1);
 // Execute the actual production selector, including its unknown-ID rejection.
 // This is not a second implementation of its filter or a source-code mutation.
 const select=new Function('ALL_STATE_SOURCES','STATE_SOURCES','REQUESTED_STATE_IDS',run.slice(begin,end)+'\nreturn selectedStateSources;');
 const normal=select(registry.ALL_STATE_SOURCES,registry.STATE_SOURCES,new Set());
 assert.deepEqual(normal.filter(source=>states.includes(source.id)).map(source=>source.id),mode==='inactive'?[]:states);
 let requests=0;const fetchText=async()=>{requests++;throw Error('HTTP is forbidden in registry admission tests');};
 globalThis.fetch=fetchText;
 for(const state of states){
  const selected=select(registry.ALL_STATE_SOURCES,registry.STATE_SOURCES,new Set([state]));
  assert.equal(selected.length,1,state+': exact explicit target must be recognized by real run.mjs');
  assert.equal(selected[0].id,state);
  const opts=options[state],candidate=structuredClone(opts.lifecycleConfig);
  if(mode==='inactive'){candidate.activeStates=candidate.activeStates.filter(id=>id!==state);candidate.states[state].publicStatus='research_only';}
  if(mode==='missing_proof')delete candidate.states[state].promotionEvidence.immutableEvidence;
  if(mode==='two_shadows')candidate.states[state].promotionEvidence.shadowRuns=2;
  if(mode==='one_canary')candidate.states[state].promotionEvidence.canaryRuns=1;
  const env=mode==='quarantined'?{BOURBON_SIGNAL_QUARANTINED_STATES:state}:{};
  const permitted=newEnglandProductionAllowed(state,candidate,{manifest:opts.promotionManifest,env});
  assert.equal(permitted,mode==='admitted',state+': runtime authority differs from the explicit scenario');
  if(mode!=='admitted'){
   const blocked=await collectNewEnglandProductionSource(selected[0],{}, {...opts,lifecycleConfig:candidate,env,forceLive:true,fetchText,cacheDir:'NUL/forbidden',incidentDir:'NUL/forbidden'});
   assert.equal(blocked.metadata.blockedByPromotion,true);assert.equal(blocked.accounting.requestCount,0);
  }
 }
 // No global inactive-source override is introduced by the NE descriptor fix.
 const foreign={id:'FOREIGN',active:false};
 assert.throws(()=>select([...registry.ALL_STATE_SOURCES,foreign],registry.STATE_SOURCES,new Set(['FOREIGN'])),/Unknown requested state/);
 assert.throws(()=>select(registry.ALL_STATE_SOURCES,registry.STATE_SOURCES,new Set(['UNKNOWN'])),/Unknown requested state/);
 assert.equal(requests,0);
 console.log(JSON.stringify({scenario:mode,actualRegistry:true,actualRunSelector:true,retailerRequests:requests,syntheticAuthorityOnly:true}));
}else{
 for(const scenario of ['admitted','inactive','missing_proof','two_shadows','one_canary','quarantined'])test('NE actual registry and run selector: '+scenario,()=>{
  const result=spawnSync(process.execPath,['--experimental-test-module-mocks',own,'--registry-child='+scenario],{encoding:'utf8',timeout:20000,windowsHide:true});
  assert.equal(result.status,0,result.stderr+'\n'+result.stdout);
  const proof=JSON.parse(result.stdout.trim().split('\n').at(-1));assert.equal(proof.actualRegistry,true);assert.equal(proof.actualRunSelector,true);assert.equal(proof.retailerRequests,0);
 });
}
