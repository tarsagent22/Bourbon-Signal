import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {BourbonBible} from '../src/core/bible.mjs';
import {NEW_MEXICO_GROCERY_SOURCES} from '../src/collectors/new-mexico-grocery-premises.mjs';
import {groceryResearchSourceForState,collectGroceryResearchReport} from '../src/research-grocery-runtime.mjs';
import {researchSourceForState,withResearchLifecycle} from '../src/research-state-registry.mjs';
import {buildShadowEvidence,selectShadowCandidates} from '../src/run-expansion-shadow.mjs';
const fixture=JSON.parse(await readFile(new URL('./fixtures/new-mexico-grocery-expansion/identity.json',import.meta.url)));
const bible=new BourbonBible(fixture.records);
const config=groceryResearchSourceForState('NM');
const env={BOURBON_SIGNAL_SHADOW_MODE:'1'};

test('grocery registration is shadow-only and its lifecycle overlay never activates WA/NM',async()=>{
  assert.equal(researchSourceForState('WA',{shadowMode:false}),null);
  assert.equal(researchSourceForState('NM',{shadowMode:true}),config);
  const production=JSON.parse(await readFile(new URL('../../src/config/state-lifecycle.json',import.meta.url)));
  // Exercise the inactive overlay contract independently of later real promotion.
  production.activeStates=production.activeStates.filter(state=>!['WA','NM'].includes(state));
  for(const state of ['WA','NM'])production.states[state]={...production.states[state],publicStatus:'research_only'};
  const before=JSON.stringify(production),overlay=withResearchLifecycle(production);
  assert.equal(JSON.stringify(production),before);assert.deepEqual(overlay.activeStates,production.activeStates);
  assert.equal(overlay.states.WA.refinementLevel,'store');assert.equal(overlay.states.WA.publicStatus,'research_only');
  assert.equal(overlay.states.NM.inventoryAlertable,false);
  assert.deepEqual(selectShadowCandidates(overlay,{states:['WA','NM'],limit:2}),['NM','WA']);
  await assert.rejects(()=>collectGroceryResearchReport(config,bible,{env:{}}),/isolated shadow/);
});

test('registered research produces portable raw receipts and explicit local origin without claiming workflow issuance',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'grocery-workflow-shadow-'));
  try{
    const stores=NEW_MEXICO_GROCERY_SOURCES.map(source=>({locationId:source.merchantId,
      polarisBannerName:source.banner,domainName:source.resolverDomainName,
      address:{line1:source.address.split(',')[0],city:source.city,state:'NM',country:'US',zipcode:source.zip}}));
    const report=await collectGroceryResearchReport(config,bible,{env,reportDirectory:directory,
      attemptsFile:path.join(directory,'attempts.json'),cursorDir:path.join(directory,'cursor'),sleep:async()=>{},
      fetchText:async url=>({ok:true,status:200,url,text:JSON.stringify(url.includes('storeresolver')
        ?{instore:{stores}}:{response:{docs:fixture.products.map(product=>({...product,storeId:new URL(url).searchParams.get('storeid')}))}})})});
    assert.equal(report.metadata.complete,true);assert.ok(report.metadata.receipts.length>=35&&report.metadata.receipts.length<=43);
    assert.equal(report.metadata.origin.kind,'local_shadow_not_workflow_issued');
    assert.equal(report.metadata.productionActivationAllowed,false);
    assert.ok(report.signals.every(row=>row.eligibleForDelivery===false&&row.eligibleForEmail===false&&row.sourceProductBinding.shadowOnly));
    assert.ok(report.metadata.receipts.every(receipt=>receipt.artifactPath.startsWith('source-captures/')&&!path.isAbsolute(receipt.artifactPath)));
    const evidence=buildShadowEvidence('NM',report);
    assert.equal(evidence.complete,true);assert.equal(evidence.publication.allowed,false);assert.equal(evidence.alerts.deliveryAttempted,false);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('denials persist before another invocation and final URL drift fails closed',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'grocery-shadow-denial-'));let calls=0;
  try{
    const options={env,reportDirectory:directory,attemptsFile:path.join(directory,'attempts.json'),sleep:async()=>{},
      fetchText:async url=>{calls++;return{ok:false,status:403,url,text:''}}};
    const first=await collectGroceryResearchReport(config,bible,options);
    assert.equal(calls,1);assert.equal(first.metadata.complete,false);
    const again=await collectGroceryResearchReport(config,bible,options);
    assert.equal(calls,1);assert.equal(again.metadata.receipts.length,0);
    await assert.rejects(()=>collectGroceryResearchReport(config,bible,{...options,attemptsFile:path.join(directory,'clean.json'),
      fetchText:async()=>({ok:true,status:200,url:'https://unreviewed.example/',text:'{}'})}),/final URL identity/);
  }finally{await rm(directory,{recursive:true,force:true});}
});
