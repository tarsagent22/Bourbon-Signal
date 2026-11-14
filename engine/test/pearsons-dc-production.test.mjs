import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {collectPearsonsDcProductionSource} from '../src/collectors/pearsons-dc-production.mjs';
import {PEARSONS_DC_SOURCE} from '../src/collectors/pearsons-dc-research.mjs';
import {centralCityHiveProductionCohortKey} from '../src/central-cityhive-production-config.mjs';
import {isPearsonsDcProductionOnSiteSignal} from '../src/central-cityhive-policy.mjs';
import {isPearsonsDcCanaryPreview} from '../src/pearsons-dc-production-policy.mjs';

const fixture=await readFile(new URL('./fixtures/pearsons-dc/product-page.html',import.meta.url),'utf8');
const bible={match:name=>name===PEARSONS_DC_SOURCE.canonicalName
  ?{confidence:1,record:{id:'blantons-original',canonical:PEARSONS_DC_SOURCE.canonicalName,tier:'allocated'}}:null};
const cohortSha256=centralCityHiveProductionCohortKey('DC');
async function temp(t){const dir=await mkdtemp(path.join(os.tmpdir(),'pearsons-dc-production-'));t.after(()=>rm(dir,{recursive:true,force:true}));return path.join(dir,'DC.json');}
function response(url,nowMs,text=fixture){return{ok:true,status:200,url,text,date:new Date(nowMs).toUTCString()};}

test('Pearson production source requires the shared gate, makes one exact request, persists the source clock and emits no quantity or delivery eligibility',async t=>{
  const journalFile=await temp(t),nowMs=Date.parse('2026-11-14T19:00:00.000Z'),calls=[];
  await assert.rejects(()=>collectPearsonsDcProductionSource({cohortSha256,bible,journalFile,nowMs,
    fetchText:async()=>{calls.push('unauthorized');return response(PEARSONS_DC_SOURCE.productUrl,nowMs);}}),/shared DC immutable admission gate/);
  assert.equal(calls.length,0);
  const result=await collectPearsonsDcProductionSource({admissionPassed:true,cohortSha256,bible,journalFile,nowMs,
    fetchText:async(url,options)=>{calls.push(url);assert.equal(options.isAllowedUrl(new URL(url)),true);
      assert.equal(options.isAllowedUrl(new URL('https://foreign.example/products/blantons-single-barrel-bourbon-750ml')),false);
      await options.onResponse({status:200,date:new Date(nowMs).toUTCString()});
      return response(url,nowMs);}});
  assert.equal(calls.length,1);assert.equal(calls[0],PEARSONS_DC_SOURCE.productUrl);
  assert.equal(result.metadata.complete,true);assert.equal(result.metadata.requestCount,1);
  const row=result.signals[0];assert.equal(row.sourceRuntimeId,'dc:pearsons-shopify');
  assert.equal(row.quantity,null);assert.equal(row.quantityIsExact,false);assert.equal(row.price,99.99);
  assert.equal(row.canAlertAsInventory,false);assert.equal(row.canAlertAsWatch,false);assert.equal(row.eligibleForDelivery,false);
  assert.equal(row.sourceProductBinding.productionCohortSha256,cohortSha256);
  assert.equal(isPearsonsDcProductionOnSiteSignal(row,{nowMs}),true);
  const preview={...row,sourceRuntimeId:'research:dc:pearsons-shopify',previewOnly:true,quantity:0,
    quantitySemantics:'no_exact_shelf_count',sourceProductBinding:{...row.sourceProductBinding,productionOnSiteOnly:undefined,productionCohortSha256:undefined}};
  assert.equal(isPearsonsDcCanaryPreview(preview,{nowMs}),true);
  for(const change of [{storeAddress:'1 Other St'},{variantId:'other'},{canAlertAsInventory:true},{eligibleForDelivery:true},
    {quantity:1},{observedAt:new Date(nowMs-3*60*60_000).toISOString()}])
    assert.equal(isPearsonsDcCanaryPreview({...preview,...change},{nowMs}),false,JSON.stringify(change));
  assert.equal(isPearsonsDcCanaryPreview({...preview,sourceProductBinding:{...preview.sourceProductBinding,productionOnSiteOnly:true}},{nowMs}),false);
  const journal=JSON.parse(await readFile(journalFile,'utf8'));assert.equal(journal.lastOutcome,'success');
  assert.equal(journal.lastGoodAt,row.observedAt);assert.equal(journal.lastSignal.variantId,PEARSONS_DC_SOURCE.variantId);
  const reused=await collectPearsonsDcProductionSource({admissionPassed:true,cohortSha256,bible,journalFile,nowMs:nowMs+60_000,
    fetchText:async()=>{calls.push('repeat');throw Error('Do not rerequest inside source cadence');}});
  assert.equal(calls.length,1);assert.equal(reused.metadata.cacheReused,true);assert.equal(reused.metadata.requestCount,0);
});

test('Pearson production denial is persisted before stop and suppresses a later request',async t=>{
  const journalFile=await temp(t),nowMs=Date.parse('2026-11-14T19:00:00.000Z');let calls=0;
  const fetchText=async(url,options)=>{calls++;await options.onResponse({status:403,retryAfterSeconds:0});return{ok:false,status:403,url,text:''};};
  await assert.rejects(()=>collectPearsonsDcProductionSource({admissionPassed:true,cohortSha256,bible,journalFile,nowMs,fetchText}),error=>error.status===403);
  assert.equal(calls,1);
  const journal=JSON.parse(await readFile(journalFile,'utf8'));
  assert.equal(journal.lastOutcome,'denied');assert.equal(journal.lastStatus,403);assert.equal(journal.inFlight,null);
  assert.equal(Date.parse(journal.nextAllowedAt)-Date.parse(journal.lastAttemptAt),24*60*60_000);
  await assert.rejects(()=>collectPearsonsDcProductionSource({admissionPassed:true,cohortSha256,bible,journalFile,nowMs:nowMs+1000,
    fetchText:async()=>{calls++;throw Error('Persisted denial must stop retry');}}),error=>error.code==='PEARSONS_COOLDOWN');
  assert.equal(calls,1);
});

test('foreign seller or malformed pickup page becomes a failed source observation with no positive signal',async t=>{
  const journalFile=await temp(t),nowMs=Date.parse('2026-11-14T19:00:00.000Z');
  const wrong=fixture.replace('https://pearsonswine.com/#store','https://foreign.example/#store');
  await assert.rejects(()=>collectPearsonsDcProductionSource({admissionPassed:true,cohortSha256,bible,journalFile,nowMs,
    fetchText:async (url,options)=>{await options.onResponse({status:200,date:new Date(nowMs).toUTCString()});return response(url,nowMs,wrong);}}),/exact retailer, product, variant, pickup/);
  const journal=JSON.parse(await readFile(journalFile,'utf8'));assert.equal(journal.lastOutcome,'failed');
  assert.equal(journal.lastSignal,undefined);assert.equal(journal.lastStatus,200);
});
