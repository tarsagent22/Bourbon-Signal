import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,realpathSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {OPTIONAL_SOURCE_SUSPENSIONS as policy,optionalSuspensionSkip,optionalSuspendedFetch,optionalSuspendedConfiguredSourceSkip,retainSuspendedOptionalRows} from '../src/collectors/optional-source-suspensions.mjs';
import {GEORGIA_GOTOLIQUOR_STORES} from '../src/collectors/georgia-retailer-surfaces.mjs';

test('suspensions bind only original exact CO10 NC3 TN2 GA2 failures and immutable workflow archives',()=>{
  assert.equal(policy.routes.length,17);
  assert.deepEqual(Object.fromEntries(['CO','NC','TN','GA'].map(state=>[state,policy.routes.filter(row=>row.state===state).length])),{CO:10,NC:3,TN:2,GA:2});
  assert.deepEqual(policy.workflows.map(row=>[row.runId,row.artifactSha256]),[
    ['40846038572','8e136c46b5aa78564fab8aadd6a5300fc7034a349383c0fb04ebf6fd47c29af0'],
    ['40608817441','00556204e943e5ef39b850ccc4863c0db0948b8c5cdb0a069e715f41fc0f9274']]);
  const bytes=readFileSync(new URL('../data/source-evidence/optional-suspensions-20261029/co-denial-ledger.json',import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),policy.reports.find(row=>row.id==='CO-ledger').sha256);
  for(const route of policy.routes){
    const skip=optionalSuspensionSkip(route.state,route.sourceKey,route.url);
    assert.equal(skip.requestCount,0);assert.deepEqual(skip.signals,[]);
    const block=skip.roadblocks[0];assert.equal(block.status,'source_policy_disabled');assert.equal(block.historicalHttpStatus,route.httpStatus);
    assert.equal(block.checkedAt,route.attemptWindowFinishedAt);assert.equal(block.attemptCount,0);
    assert.ok(block.denialEvidence.workflow.artifactSha256);assert.ok(block.denialEvidence.report.sha256);
    for(const [state,key,url]of[['OTHER',route.sourceKey,route.url],[route.state,route.sourceKey+'-changed',route.url],
      [route.state,route.sourceKey,route.url+'?unreviewed=1'],[route.state,route.sourceKey,route.url.replace('https:','http:')],
      [route.state,route.sourceKey,route.url.replace(route.hostname,'unreviewed.example')]])assert.equal(optionalSuspensionSkip(state,key,url),null);
  }
  for(const store of GEORGIA_GOTOLIQUOR_STORES){
    const result=optionalSuspensionSkip('GA',store.id,store.categoryUrl);
    assert.equal(Boolean(result),['1071','1279'].includes(store.id));
  }
});

test('NC transport skips only three denied URLs; REST, other paths and sources remain independent',()=>{
  for(const route of policy.routes.filter(row=>row.state==='NC')){
    const result=optionalSuspendedFetch('NC',route.url);assert.equal(result.requestCount,0);assert.equal(result.status,'source_policy_disabled');
    assert.equal(result.historicalHttpStatus,403);assert.equal(result.checkedAt,route.attemptWindowFinishedAt);
    assert.equal(optionalSuspendedFetch('VA',route.url),null);
  }
  for(const url of ['https://www.newhanovercountyabc.com/','https://www.newhanovercountyabc.com/wp-json/wp/v2/posts?search=barrel&per_page=100','https://nh.abcgo.app/','https://wakeabc.com/search-our-inventory/'])assert.equal(optionalSuspendedFetch('NC',url),null);
});

test('configured skips bind exact state, runtime and URL while preserving original non-alerting history',()=>{
  for(const route of policy.routes.filter(row=>row.kind==='configured')){
    const source={url:route.url,label:route.label,kind:'html'};const old={id:'old',state:route.state,sourceRuntimeId:route.sourceRuntimeId,sourceUrl:route.url,observedAt:'2026-10-27T00:00:00.000Z',quantity:4,canAlertAsInventory:true};
    const result=optionalSuspendedConfiguredSourceSkip({id:route.state},source,route.sourceRuntimeId,{previous:{lastGoodAt:old.observedAt,value:{signals:[old]}}});
    assert.equal(result.sourceResult.attemptCount,0);assert.equal(result.sourceResult.checkedAt,route.attemptWindowFinishedAt);
    assert.equal(result.signals[0].observedAt,old.observedAt);assert.equal(result.signals[0].quantity,4);assert.equal(result.signals[0].canAlertAsInventory,false);
    assert.equal(result.sourceReport.reachabilityEligible,false);
    assert.equal(optionalSuspendedConfiguredSourceSkip({id:route.state},{...source,url:source.url+'other'},route.sourceRuntimeId),null);
    assert.equal(optionalSuspendedConfiguredSourceSkip({id:route.state},source,route.sourceRuntimeId+'-changed'),null);
  }
});

test('historical rows lose every current/delivery flag without changing source clocks or healthy siblings',()=>{
  const old=policy.routes.map((route,i)=>({id:String(i),state:route.state,sourceRuntimeId:route.sourceRuntimeId,sourceUrl:route.url,
    sourceChain:route.rowSourceChains[0],observedAt:'2026-10-27T00:00:00.000Z',quantity:3,canAlertAsInventory:true,canAlertAsWatch:true,eligibleForEmail:true}));
  const healthy={id:'healthy',state:'GA',sourceChain:'abc-augusta',sourceUrl:'https://www.abcaugusta.com/product',canAlertAsInventory:true};
  const result=retainSuspendedOptionalRows({signals:[healthy],roadblocks:[]},old);assert.equal(result.signals.length,18);assert.equal(result.signals.find(row=>row.id==='healthy'),healthy);
  for(const row of result.signals.filter(row=>row!==healthy)){assert.equal(row.observedAt,'2026-10-27T00:00:00.000Z');assert.equal(row.quantity,3);assert.equal(row.stale,true);
    for(const flag of ['canAlertAsInventory','canAlertAsWatch','eligibleForDelivery','eligibleForEmail','eligibleForSms'])assert.equal(row[flag],false);}
});

for(const state of ['CO','NC','TN','GA'])test(`actual forced cold-cache ${state} collector skips suspended bindings and retains healthy sibling HTTP`,t=>{
  const temporaryRoot=realpathSync(tmpdir()),directory=mkdtempSync(path.join(temporaryRoot,'bs-source-suspension-'));assert.ok(realpathSync(directory).startsWith(temporaryRoot+path.sep));t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const url=relative=>new URL(relative,import.meta.url).href;
  const program=`
    import child from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
    const calls=[];child.execFile=(command,args,options,callback)=>{calls.push(args.at(-1));queueMicrotask(()=>callback(Object.assign(new Error('fixture transport'),{code:'ENOENT'})));};syncBuiltinESMExports();
    const originalTimeout=globalThis.setTimeout;globalThis.setTimeout=(fn,ms,...args)=>originalTimeout(fn,ms<=10000?0:ms,...args);
    globalThis.fetch=async input=>{calls.push(String(input));return new Response('{}',{status:200,headers:{'content-type':'application/json'}});};
    const {collectState}=await import(${JSON.stringify(url('../src/collectors/generic-state.mjs'))});const {STATE_SOURCES}=await import(${JSON.stringify(url('../src/state-sources.mjs'))});
    const {BourbonBible}=await import(${JSON.stringify(url('../src/core/bible.mjs'))});const bible=new BourbonBible([]);
    const result=await collectState(STATE_SOURCES.find(row=>row.id===${JSON.stringify(state)}),bible,{fetcher:async input=>{calls.push(String(input));return{ok:true,status:200,url:String(input),text:'{}',contentType:'application/json'};},sourceRunnerOptions:{schedule:false,maxAttempts:1}});
    console.log(JSON.stringify({calls,parked:result.roadblocks.filter(row=>row.policyId===${JSON.stringify(policy.id)})}));`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',program],{cwd:directory,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:4*1024*1024,
    env:{...process.env,PATH:'',Path:'',BOURBON_SIGNAL_FORCE_SOURCE_RUN:'1',BOURBON_SIGNAL_CO_FORCE_METRO_LIVE:'1',BOURBON_SIGNAL_REFRESH_SOURCES:''}});
  assert.equal(child.status,0,child.stderr||child.error?.message);const output=JSON.parse(child.stdout.trim().split(/\r?\n/).at(-1));
  for(const route of policy.routes.filter(row=>row.state===state))assert.ok(!output.calls.includes(route.url),`suspended ${route.sourceKey} was requested`);
  assert.equal(output.parked.length,state==='GA'?0:policy.routes.filter(row=>row.state===state).length);
  if(state==='GA'){
    assert.ok(output.calls.some(value=>String(value).startsWith('https://www.towerwinespirits.com/')),'independent CityHive sibling remains eligible');
    for(const store of GEORGIA_GOTOLIQUOR_STORES)assert.ok(!output.calls.includes(store.categoryUrl),'the reviewed group hold also prevents trying skipped GoTo siblings');
  }
  if(state==='NC')assert.ok(output.calls.some(value=>String(value).startsWith('https://abc2.nc.gov/')),'healthy statewide source continues');
  if(state==='TN')assert.ok(output.calls.some(value=>String(value).includes('frugalmacdoogal.com')),'healthy retailer sibling continues');
});
