import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {BourbonBible} from '../src/core/bible.mjs';
import {NEW_MEXICO_GROCERY_SOURCES} from '../src/collectors/new-mexico-grocery-premises.mjs';
import {groceryResearchSourceForState,collectGroceryResearchReport} from '../src/research-grocery-runtime.mjs';
import {prepareGroceryCanary} from '../src/prepare-grocery-canary.mjs';

const fixture=JSON.parse(await readFile(new URL('./fixtures/new-mexico-grocery-expansion/identity.json',import.meta.url)));
const bible=new BourbonBible(fixture.records);

test('raw replay preserves source clocks, ignores report rows and rejects stale/tampered/local evidence',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'grocery-canary-test-'));
  try{
    // Synthetic mocks exercise validation only. They are never workflow receipts.
    const env={BOURBON_SIGNAL_SHADOW_MODE:'1',GITHUB_ACTIONS:'true',GITHUB_RUN_ID:'123',
      GITHUB_SHA:'a'.repeat(40),GITHUB_REPOSITORY:'tarsagent22/Bourbon-Signal'};
    const stores=NEW_MEXICO_GROCERY_SOURCES.map(source=>({locationId:source.merchantId,
      polarisBannerName:source.banner,domainName:source.resolverDomainName,
      address:{line1:source.address.split(',')[0],city:source.city,state:'NM',country:'US',zipcode:source.zip}}));
    const report=await collectGroceryResearchReport(groceryResearchSourceForState('NM'),bible,{env,
      reportDirectory:directory,attemptsFile:path.join(directory,'attempts.json'),cursorDir:path.join(directory,'cursor'),sleep:async()=>{},
      fetchText:async url=>({ok:true,status:200,url,text:JSON.stringify(url.includes('storeresolver')
        ?{instore:{stores}}:{response:{docs:fixture.products.map(product=>({...product,storeId:new URL(url).searchParams.get('storeid')}))}})})});
    const provenance={status:'verified_github_shadow_artifact',state:'NM',repository:env.GITHUB_REPOSITORY,
      workflowRunId:'123',headSha:env.GITHUB_SHA};
    const options={state:'NM',report:{...report,signals:[{id:'fabricated-report-row'}]},reportDirectory:directory,bible,provenance};
    const result=await prepareGroceryCanary(options);
    assert.ok(result.drops.length>0);assert.ok(result.drops.every(row=>row.id!=='fabricated-report-row'));
    assert.equal(result.generatedAt,report.finishedAt);
    assert.ok(result.drops.every(row=>result.sourceReceipts.some(receipt=>receipt.observedAt===row.observedAt)));
    assert.ok(result.drops.every(row=>row.previewOnly&&!row.canAlertAsInventory&&!row.eligibleForDelivery));
    await assert.rejects(()=>prepareGroceryCanary({...options,nowMs:Date.now()+121*60_000}),/stale/);
    await assert.rejects(()=>prepareGroceryCanary({...options,provenance:{...provenance,workflowRunId:'124'}}),/provenance/);
    const changed=structuredClone(report);changed.metadata.origin={kind:'local_shadow_not_workflow_issued'};
    await assert.rejects(()=>prepareGroceryCanary({...options,report:changed}),/provenance/);
    const tampered=structuredClone(report);tampered.metadata.receipts[0].sha256='0'.repeat(64);
    await assert.rejects(()=>prepareGroceryCanary({...options,report:tampered}),/immutable receipt/);
    const escaped=structuredClone(report);escaped.metadata.receipts[0].artifactPath='../outside.json';
    await assert.rejects(()=>prepareGroceryCanary({...options,report:escaped}),/portable and bounded/);
    const incomplete=structuredClone(report);incomplete.metadata.receipts=incomplete.metadata.receipts.filter(receipt=>new URL(receipt.url).searchParams.get('q')!=='whiskey');
    await assert.rejects(()=>prepareGroceryCanary({...options,report:incomplete}),/complete broad inventory/);
  }finally{await rm(directory,{recursive:true,force:true});}
});
