import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {OPTIONAL_SOURCE_DENIAL_POLICY as policy,optionalDeniedSourceSkip,retainParkedOptionalSourceRows} from '../src/collectors/optional-source-denial-policy.mjs';
import {FLORIDA_SHIPMENT_SHOPIFY_SOURCES,collectFloridaShipmentShopifySource} from '../src/collectors/florida-15-20-expansion.mjs';

test('only the14 reviewed state/source/host bindings are parked with captured clocks',()=>{
  assert.equal(policy.routes.length,14);
  assert.equal(policy.routes.filter(row=>row.state==='AZ').length,1);
  assert.equal(policy.routes.filter(row=>row.state==='FL').length,13);
  assert.deepEqual(policy.reports.map(row=>[row.state,row.sha256]),[
    ['AZ','46572417c441332d3a30b9c64b500e62055a5e5ae6a2f93c9c4009aa6ce63512'],
    ['FL','1003684552abd4caa11c31cd47175007b04c5d084d35a0a362bde29aeb94a798'],
  ]);
  for(const route of policy.routes){
    const report=policy.reports.find(row=>row.state===route.state);
    assert.ok(Date.parse(route.attemptWindowStartedAt)>=Date.parse(report.startedAt));
    assert.ok(Date.parse(route.attemptWindowFinishedAt)<=Date.parse(report.finishedAt));
    const result=optionalDeniedSourceSkip(route.state,route.sourceKey,`https://${route.hostname}${route.requestPath}`);
    assert.equal(result.requestCount,0);assert.deepEqual(result.signals,[]);
    const block=result.roadblocks[0];assert.equal(block.status,'source_policy_disabled');assert.equal(block.attemptCount,0);
    assert.equal(block.historicalHttpStatus,route.httpStatus);assert.equal(block.checkedAt,route.attemptWindowFinishedAt);
    assert.match(block.denialEvidence.clockSemantics,/window_upper_bound_not_individual_response_time/);
    assert.equal(block.denialEvidence.workflow.runId,'40852615120');
    assert.equal(optionalDeniedSourceSkip('TX',route.sourceKey,`https://${route.hostname}`),null);
    assert.equal(optionalDeniedSourceSkip(route.state,route.sourceKey,'https://healthy.example'),null);
  }
  assert.equal(optionalDeniedSourceSkip('FL','abc','https://abc.irishtitan.cloud'),null);
  assert.equal(optionalDeniedSourceSkip('AZ','safeway','https://www.safeway.com'),null);
  assert.equal(optionalDeniedSourceSkip('FL','healthy-new-cityhive-source','https://healthy.example'),null);
});

test('historical parked rows keep source clocks and lose every current/delivery eligibility',()=>{
  const rows=policy.routes.map((route,index)=>({id:String(index),state:route.state,sourceChain:route.rowSourceChain,
    sourceUrl:`https://${route.rowHosts.at(-1)}/product`,observedAt:'2026-10-28T00:00:00.000Z',
    canAlertAsInventory:true,canAlertAsWatch:true,eligibleForEmail:true,quantity:3}));
  const healthy={id:'healthy',state:'FL',sourceChain:'abc',sourceUrl:'https://abcfws.com/product',canAlertAsInventory:true};
  const result=retainParkedOptionalSourceRows({signals:[rows[0],healthy],roadblocks:[]},rows);
  assert.equal(result.signals.length,15);assert.equal(result.signals.find(row=>row.id==='healthy'),healthy);
  for(const row of result.signals.filter(row=>row!==healthy)){
    assert.equal(row.observedAt,'2026-10-28T00:00:00.000Z');assert.equal(row.quantity,3);
    assert.equal(row.stale,true);assert.equal(row.canAlertAsInventory,false);assert.equal(row.canAlertAsWatch,false);
    assert.equal(row.eligibleForEmail,false);assert.equal(row.eligibleForSms,false);assert.equal(row.eligibleForDelivery,false);
  }
});

test('the actual A1A reviewed configuration is parked even with no cache and a supplied transport',async()=>{
  const source=FLORIDA_SHIPMENT_SHOPIFY_SOURCES.find(row=>row.id==='a1a-liquor-naples');let calls=0;
  const result=await collectFloridaShipmentShopifySource({source,observedAt:new Date().toISOString(),matchBottle:()=>({}),
    fetchText:()=>{calls++;throw Error('parked A1A attempted HTTP');}});
  assert.equal(calls,0);assert.equal(result.requestCount,0);assert.equal(result.roadblocks[0].historicalHttpStatus,401);
});

for(const state of ['AZ','FL'])test(`cold-cache actual ${state} state configuration never requests a parked host, including force flags`,t=>{
  const temporaryRoot=realpathSync(tmpdir()),directory=mkdtempSync(path.join(temporaryRoot,'bs-optional-denials-'));
  assert.ok(realpathSync(directory).startsWith(temporaryRoot+path.sep));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const moduleUrl=relative=>new URL(relative,import.meta.url).href;
  const program=`
    import child from 'node:child_process';
    import {syncBuiltinESMExports} from 'node:module';
    const calls=[];
    child.execFile=(command,args,options,callback)=>{
      calls.push(args.at(-1));queueMicrotask(()=>callback(Object.assign(new Error('fixture curl unavailable'),{code:'ENOENT'})));
    };
    syncBuiltinESMExports();
    const originalTimeout=globalThis.setTimeout;
    globalThis.setTimeout=(fn,ms,...args)=>originalTimeout(fn,ms<=10000?0:ms,...args);
    globalThis.fetch=async url=>{calls.push(String(url));return new Response('{}',{status:200,headers:{'content-type':'application/json'}});};
    const {collectState}=await import(${JSON.stringify(moduleUrl('../src/collectors/generic-state.mjs'))});
    const {STATE_SOURCES}=await import(${JSON.stringify(moduleUrl('../src/state-sources.mjs'))});
    const {BourbonBible}=await import(${JSON.stringify(moduleUrl('../src/core/bible.mjs'))});
    const bible=await BourbonBible.load(new URL(${JSON.stringify(moduleUrl('../out/bourbon-bible.json'))}));
    const result=await collectState(STATE_SOURCES.find(row=>row.id===${JSON.stringify(state)}),bible,{
      fetcher:async url=>{calls.push(String(url));return{ok:true,status:200,url,text:'{}',contentType:'application/json'};},
      sourceRunnerOptions:{schedule:false,maxAttempts:1},
    });
    console.log(JSON.stringify({calls,parked:result.roadblocks.filter(row=>row.policyId===${JSON.stringify(policy.id)})}));
  `;
  const child=spawnSync(process.execPath,['--input-type=module','-e',program],{cwd:directory,encoding:'utf8',windowsHide:true,
    timeout:25000,maxBuffer:3*1024*1024,env:{...process.env,PATH:'',Path:'',BOURBON_SIGNAL_FORCE_SOURCE_RUN:'1',
      BOURBON_SIGNAL_AZ_FORCE_LIVE:'1',BOURBON_SIGNAL_AZ_FORCE_CITYHIVE_LIVE:'1',BOURBON_SIGNAL_REFRESH_SOURCES:''}});
  assert.equal(child.status,0,child.stderr||child.error?.message);
  const output=JSON.parse(child.stdout.trim().split(/\r?\n/).at(-1));
  const hosts=output.calls.filter(url=>/^https:/.test(url)).map(url=>new URL(url).hostname);
  for(const route of policy.routes.filter(row=>row.state===state))assert.ok(!hosts.includes(route.hostname),`parked ${route.sourceKey} requested ${route.hostname}`);
  assert.equal(output.parked.length,state==='AZ'?1:13);
  assert.ok(hosts.includes(state==='AZ'?'www.safeway.com':'abc.irishtitan.cloud'),'healthy grocery lane still receives its normal fixture request');
});
