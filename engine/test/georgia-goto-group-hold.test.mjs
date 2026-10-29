import test from 'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';
import {GEORGIA_GOTO_GROUP_HOLD_POLICY as policy,georgiaGoToGroupHold,retainGeorgiaGoToHoldRows} from '../src/collectors/georgia-goto-group-policy.mjs';
import {GEORGIA_GOTOLIQUOR_STORES,GEORGIA_CITYHIVE_SOURCES} from '../src/collectors/georgia-retailer-surfaces.mjs';
import {collectGeorgiaGoToLiquorStore} from '../src/collectors/precision-probes.mjs';

test('the group hold binds the actual two native403 observations without claiming twelve skipped sources were denied',async()=>{
 const bytes=await readFile(new URL('../data/source-evidence/georgia-goto-group-hold-20261029/GA.json',import.meta.url));assert.equal(bytes.length,policy.report.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),policy.report.sha256);
 const report=JSON.parse(bytes),failure=report.roadblocks.find(row=>row.status===403&&row.sourceRuntimeId==='precision:ga'),source=report.sourceResults.find(row=>row.sourceId==='precision:ga');
 assert.deepEqual(policy.observedUrls,failure.evidence.attemptedUrls);assert.deepEqual(policy.observedSources,failure.evidence.attemptedSources);
 assert.equal(policy.attemptedProbeCount,2);assert.equal(policy.skippedProbeCount,12);assert.equal(policy.configuredProbeCount,14);assert.equal(policy.evidenceLimits.skippedSourcesProvenDenied,false);
 assert.equal(policy.report.sourceWindowStartedAt,source.startedAt);assert.equal(policy.report.sourceWindowFinishedAt,source.finishedAt);
 assert.ok(Date.parse(policy.minimumReviewAt)-Date.parse(source.finishedAt)>=86400000);assert.equal(policy.automaticExpiryAllowed,false);
 for(const key of ['individualResponseClocksRetained','headersRetained','responseBodiesRetained','finalResponseOriginsRetained','retryAfterRetained'])assert.equal(policy.evidenceLimits[key],false);
});

test('forced direct GoTo collection stops before any fetch/cache property and the hold does not expire automatically',async t=>{
 const prior=globalThis.fetch;let calls=0;globalThis.fetch=()=>{calls++;throw Error('Known held group attempted HTTP');};
 try{for(const now of[Date.now(),Date.parse('2035-01-01T00:00:00Z')]){
  t.mock.method(Date,'now',()=>now);const result=await collectGeorgiaGoToLiquorStore({id:'GA'},null,new Date().toISOString(),{
    get fetchText(){throw Error('Held lane must not read its transport');},get existingSignals(){throw Error('Held lane must not reuse cached stock');},forceLive:true});
  assert.deepEqual(result.signals,[]);assert.equal(result.requestCount,0);assert.equal(result.roadblocks[0].status,'source_policy_disabled');assert.equal(result.roadblocks[0].historicalHttpStatus,403);assert.equal(result.roadblocks[0].attemptCount,0);assert.equal(result.roadblocks[0].reviewRequired,true);
 }assert.equal(calls,0);}finally{globalThis.fetch=prior;}
 assert.equal(georgiaGoToGroupHold('CA'),null);assert.equal(georgiaGoToGroupHold('SC'),null);
 await assert.rejects(()=>collectGeorgiaGoToLiquorStore({id:'CA'},null,new Date().toISOString()),/cannot be reclassified/);
});

test('source substitutions fail closed and independent CityHive hosts are absent from this lane hold',()=>{
 assert.equal(policy.closedGroup.length,14);assert.deepEqual(policy.closedGroup.map(row=>row.url),GEORGIA_GOTOLIQUOR_STORES.map(row=>row.categoryUrl));
 for(const source of GEORGIA_CITYHIVE_SOURCES)assert.ok(!policy.closedGroup.some(row=>row.hostname===new URL(source.baseUrl).hostname));
 const original=GEORGIA_GOTOLIQUOR_STORES[0].categoryUrl;try{GEORGIA_GOTOLIQUOR_STORES[0].categoryUrl='https://alternate.example/';assert.throws(()=>georgiaGoToGroupHold('GA'),/Changed GoTo/);}finally{GEORGIA_GOTOLIQUOR_STORES[0].categoryUrl=original;}
});

test('all held historical inventory retains clocks and loses current/delivery flags while healthy CityHive stays untouched',()=>{
 const old=GEORGIA_GOTOLIQUOR_STORES.map(store=>({id:store.id,state:'GA',eventType:'retailer_store_inventory_result',sourceChain:store.chain,sourceUrl:store.categoryUrl,observedAt:'2026-10-29T10:00:00Z',quantity:2,canAlertAsInventory:true,canAlertAsWatch:true,eligibleForDelivery:true,eligibleForEmail:true,eligibleForSms:true}));
 const healthy={id:'cityhive-healthy',state:'GA',sourceChain:'tower-wine-spirits',sourceUrl:'https://www.towerwinespirits.com/shop/',canAlertAsInventory:true};
 const result=retainGeorgiaGoToHoldRows({signals:[healthy],roadblocks:[]},old);assert.equal(result.signals.length,15);assert.equal(result.signals[0],healthy);
 for(const row of result.signals.slice(1)){assert.equal(row.observedAt,'2026-10-29T10:00:00Z');assert.equal(row.quantity,2);assert.equal(row.stale,true);assert.equal(row.sourceAvailabilityVerified,false);for(const key of['canAlertAsInventory','canAlertAsWatch','eligibleForOnSite','eligibleForDropFeed','eligibleForWatch','eligibleForDelivery','eligibleForEmail','eligibleForSms'])assert.equal(row[key],false);}
});
