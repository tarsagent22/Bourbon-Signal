import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {SC_CITYHIVE_API_HOLD_POLICY as policy,southCarolinaCityHiveApiRouteHold,southCarolinaCityHiveSourceHold} from '../src/collectors/south-carolina-cityhive-api-policy.mjs';
import {fetchSouthCarolinaCityHivePublicApi,collectSouthCarolinaCityHive,SC_CITYHIVE_SOURCES,
  resolveSouthCarolinaCityHiveProbePayload,shouldAttemptSouthCarolinaCityHiveStorefrontFallback,
  cachedSouthCarolinaCityHiveSignals,mergeSouthCarolinaCityHiveSignals} from '../src/collectors/precision-probes.mjs';
import {BourbonBible} from '../src/core/bible.mjs';
const heldSources=SC_CITYHIVE_SOURCES.filter(source=>southCarolinaCityHiveSourceHold(source));
const healthy=SC_CITYHIVE_SOURCES.find(source=>source.id==='surf-beverage');
const rowFor=source=>{const merchantId=source.merchantIds[0],id='test-product',option='test-option';return{
  id:source.id,state:'SC',stateCode:'SC',sourceChain:source.id,sourceLabel:source.sourceLabel,sourceUrl:source.baseUrl+'/shop/',
  merchantId,storeId:source.id+':'+merchantId,productId:id,optionId:option,eventType:'cityhive_store_inventory_result',
  sourceAvailabilityVerified:true,quantityIsExact:true,quantity:3,observedAt:'2026-10-29T18:00:00.000Z',
  canAlertAsInventory:true,canAlertAsWatch:true,eligibleForDelivery:true,eligibleForEmail:true,eligibleForSms:true,
  raw:{chain:source.id,option:{merchant_id:merchantId,product_id:id,option_id:option}}};};

test('SC hold binds the actual failed artifact/report and only its aggregated source window',async t=>{
  const bytes=await readFile(new URL('../data/source-evidence/sc-cityhive-api-hold-20261029/SC.json',import.meta.url));
  assert.equal(bytes.length,policy.report.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),policy.report.sha256);
  const report=JSON.parse(bytes),result=report.sourceResults.find(row=>row.sourceId==='precision:sc');
  assert.equal(result.startedAt,policy.report.attemptWindowStartedAt);assert.equal(result.finishedAt,policy.report.attemptWindowFinishedAt);
  const failure=report.roadblocks.find(row=>row.status===429);
  assert.deepEqual(failure.evidence.attemptedUrls,[policy.requestedRoute.url]);
  assert.deepEqual(failure.evidence.attemptedSources,policy.affectedSources.map(row=>row.label));
  assert.equal(policy.attemptedProbeCount,2);assert.equal(policy.skippedProbeCount,17);
  assert.equal(policy.workflow.runId,'40944514001');
  assert.ok(Date.parse(policy.minimumReviewAt)-Date.parse(result.finishedAt)>=86_400_000);
  assert.equal(policy.automaticExpiryAllowed,false);assert.equal(policy.reviewRequired,true);
  t.mock.method(Date,'now',()=>Date.parse('2035-01-01T00:00:00Z'));
  assert.equal(southCarolinaCityHiveApiRouteHold().status,'source_policy_disabled','passing the review floor cannot automatically grant access');
  for(const key of ['individualResponseTimestampRetained','perRequestMerchantIdRetained','responseHeadersRetained','responseBodyRetained','finalResponseOriginRetained','retryAfterRetained'])assert.equal(policy.evidenceLimits[key],false);
});

test('all merchant/query variants of the exact requested API are held before credentials or direct fetch',async()=>{
  const previous=globalThis.fetch;let calls=0;globalThis.fetch=()=>{calls++;throw Error('held request');};
  try{
    for(const merchant of ['different-merchant',...SC_CITYHIVE_SOURCES.flatMap(source=>source.merchantIds)]){
      const source={get apiKeyEnv(){throw Error('Credentials must not be read');}};
      const result=await fetchSouthCarolinaCityHivePublicApi(source,merchant,{searchText:'weller',forceLive:true});
      assert.equal(result.status,'source_policy_disabled');assert.equal(result.requestCount,0);assert.equal(result.attemptCount,0);
      assert.equal(result.historicalHttpStatus,429);assert.equal(result.reviewRequired,true);assert.equal(result.automaticExpiryAllowed,false);
      assert.equal(southCarolinaCityHiveApiRouteHold(policy.requestedRoute.url+'?merchant_id='+merchant+'&text=rye').status,'source_policy_disabled');
    }
    assert.equal(calls,0);
    for(const url of ['https://other.example/api/v1/products/search.json','https://api.cityhive.net/api/v1/products/other.json','http://api.cityhive.net/api/v1/products/search.json'])assert.equal(southCarolinaCityHiveApiRouteHold(url),null);
  }finally{globalThis.fetch=previous;}
});

test('the two affected registered sources stop before cache/API/page reads even when forced live',async()=>{
  assert.deepEqual(heldSources.map(source=>source.id),['odarbys-liquor-barn','palmetto-liquor']);
  const previous=process.env.BOURBON_SIGNAL_SC_FORCE_CITYHIVE_LIVE;process.env.BOURBON_SIGNAL_SC_FORCE_CITYHIVE_LIVE='1';
  let reads=0,requests=0;
  try{for(const sourceIds of [heldSources.map(source=>source.id),...heldSources.map(source=>[source.id])]){
    const result=await collectSouthCarolinaCityHive({id:'SC'},null,new Date().toISOString(),{sourceIds,
      readCache:()=>{reads++;throw Error('held cache read');},fetchText:()=>{requests++;throw Error('held page request');}});
    assert.deepEqual(result.signals,[]);assert.equal(result.metadata.requestCount,0);assert.equal(result.roadblocks.length,sourceIds.length);
    for(const block of result.roadblocks){assert.equal(block.status,'source_policy_disabled');assert.equal(block.reviewRequired,true);assert.equal(block.attemptCount,0);}
  }assert.equal(reads,0);assert.equal(requests,0);
  }finally{if(previous==null)delete process.env.BOURBON_SIGNAL_SC_FORCE_CITYHIVE_LIVE;else process.env.BOURBON_SIGNAL_SC_FORCE_CITYHIVE_LIVE=previous;}
});

test('held API and held source bindings cannot resolve forged API/page evidence or use fallback',()=>{
  const hold=southCarolinaCityHiveApiRouteHold();assert.equal(shouldAttemptSouthCarolinaCityHiveStorefrontFallback(hold),false);
  for(const source of heldSources){const resolved=resolveSouthCarolinaCityHiveProbePayload({source,
    apiAttempt:{ok:true,status:200,blobs:[{}]},apiEvidence:{authoritative:true},useApiEvidence:true,
    pageAttempt:{ok:true,status:200},pageBlobs:[{}],pageEvidence:{authoritative:true},pageUrl:source.baseUrl+'/shop/'});
    assert.equal(resolved.blobs,null);assert.equal(resolved.transportFailure.status,'source_policy_disabled');assert.equal(resolved.transportFailure.reviewRequired,true);
  }
  assert.equal(resolveSouthCarolinaCityHiveProbePayload({apiAttempt:hold,pageAttempt:{ok:true,status:200},pageBlobs:[{}],pageEvidence:{authoritative:true}}).transportFailure.status,'source_policy_disabled');
  assert.equal(shouldAttemptSouthCarolinaCityHiveStorefrontFallback(null),true);
  assert.equal(southCarolinaCityHiveSourceHold(healthy),null);
});

test('held cache/live rows keep original source clocks and lose every current or delivery eligibility',()=>{
  const held=heldSources.map(rowFor),other=rowFor(healthy),generatedAt='2026-10-29T19:00:00.000Z';
  const result=cachedSouthCarolinaCityHiveSignals({generatedAt,signals:[...held,other]},new Date().toISOString());
  assert.equal(result.length,3);
  for(const row of result.filter(row=>row.sourceChain!==healthy.id)){
    assert.equal(row.observedAt,'2026-10-29T18:00:00.000Z');assert.equal(row.quantity,3);assert.equal(row.stale,true);assert.equal(row.sourceAvailabilityVerified,false);
    for(const field of ['canAlertAsInventory','canAlertAsWatch','eligibleForOnSite','eligibleForDropFeed','eligibleForWatch','eligibleForDelivery','deliveryEligible','eligibleForEmail','eligibleForSms'])assert.equal(row[field],false,field);
  }
  assert.equal(result.find(row=>row.sourceChain===healthy.id).observedAt,generatedAt);
  const forged=mergeSouthCarolinaCityHiveSignals({liveSignals:held,observedAt:new Date().toISOString()});
  assert.equal(forged.length,2);assert.ok(forged.every(row=>row.stale&&row.canAlertAsInventory===false));
});

test('mixed cache reuse preserves healthy siblings while held rows and old aggregate429 cannot become fresh',async()=>{
  const generatedAt=new Date().toISOString(),held=heldSources.map(rowFor),other=rowFor(healthy);let requests=0;
  const previous=process.env.BOURBON_SIGNAL_SC_FORCE_CITYHIVE_LIVE;delete process.env.BOURBON_SIGNAL_SC_FORCE_CITYHIVE_LIVE;
  try{const result=await collectSouthCarolinaCityHive({id:'SC'},null,generatedAt,{sourceIds:[...heldSources.map(source=>source.id),healthy.id],
    readCache:async()=>({generatedAt,signals:[...held,other],roadblocks:[{status:429,url:policy.requestedRoute.url,source:'old aggregate'}]}),
    fetchText:()=>{requests++;throw Error('cache reuse must not request source');}});
    assert.equal(requests,0);assert.equal(result.signals.length,3);
    assert.equal(result.signals.find(row=>row.sourceChain===healthy.id).canAlertAsInventory,true);
    for(const row of result.signals.filter(row=>row.sourceChain!==healthy.id)){assert.equal(row.observedAt,held[0].observedAt);assert.equal(row.stale,true);assert.equal(row.canAlertAsInventory,false);}
    assert.equal(result.roadblocks.length,2);assert.ok(result.roadblocks.every(row=>row.status==='source_policy_disabled'&&row.historicalHttpStatus===429&&row.reviewRequired===true));
  }finally{if(previous==null)delete process.env.BOURBON_SIGNAL_SC_FORCE_CITYHIVE_LIVE;else process.env.BOURBON_SIGNAL_SC_FORCE_CITYHIVE_LIVE=previous;}
});

test('an unaffected configured SC storefront still follows its own page path and preserves positive stock',async()=>{
  const bible=await BourbonBible.load(new URL('../out/bourbon-bible.json',import.meta.url)),merchantId=healthy.merchantIds[0];
  const merchant={id:merchantId,name:healthy.chainName,address:{full_address:'3140 US-17, Myrtle Beach, SC 29577, USA',city:'Myrtle Beach',state:'SC',zipcode:'29577'}};
  const option={merchant_id:merchantId,merchant_name:healthy.chainName,full_address:'3140 US-17, Myrtle Beach, SC 29577, USA',
    product_id:'fixture-product',option_id:'fixture-option',quantity:4,price:89.99,
    option_display_data:{name:'Elijah Craig Barrel Proof 750ml'},option_params:{size:{quantity:750,measure:'ml'}}};
  const payload={merchant_configs:[merchant],products:[{id:option.product_id,name:option.option_display_data.name,product_options:[option]}]};
  const html='JSON.parse(decodeURIComponent("'+encodeURIComponent(JSON.stringify(payload))+'"))';
  const calls=[];const previous=globalThis.fetch;globalThis.fetch=()=>{throw Error('native API must stay held');};
  try{const result=await collectSouthCarolinaCityHive({id:'SC'},bible,new Date().toISOString(),{sourceIds:[healthy.id],readCache:async()=>null,
    fetchText:async url=>{calls.push(url);return{ok:true,status:200,text:html};},sleepFn:async()=>{}});
    assert.equal(calls.length,3);assert.ok(calls.every(url=>new URL(url).hostname==='surfbeverages.com'));
    assert.ok(result.signals.some(row=>row.eventType==='cityhive_store_inventory_result'&&row.sourceChain===healthy.id&&row.quantity===4));
    assert.ok(result.roadblocks.every(row=>row.status!=='source_policy_disabled'));
  }finally{globalThis.fetch=previous;}
});
