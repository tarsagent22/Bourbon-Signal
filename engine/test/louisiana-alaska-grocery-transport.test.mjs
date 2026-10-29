import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BourbonBible} from '../src/core/bible.mjs';
import {ALL_STATE_SOURCES} from '../src/state-sources.mjs';
import {collectLouisianaAlaskaGroceryProductionSource} from '../src/collectors/louisiana-alaska-grocery-production.mjs';
import {fetchReviewedLouisianaAlaskaText,louisianaAlaskaRequestIdentity,validateLouisianaAlaskaIncidentJournal} from '../src/collectors/louisiana-alaska-grocery-transport.mjs';
import {LOUISIANA_ALASKA_GROCERY_SOURCES} from '../src/collectors/louisiana-alaska-grocery-premises.mjs';
import {fixture,syntheticPromotedGroceryConfig,syntheticPromotionManifest} from './helpers/synthetic-louisiana-alaska-promotion.mjs';
const resolver='https://www.safeway.com/abs/pub/xapi/storeresolver/v2/all?zipcode=99503&radius=50&size=100';
const source=LOUISIANA_ALASKA_GROCERY_SOURCES.find(row=>row.stateCode==='AK');
const base=`https://${source.host}`,params=new URLSearchParams({'request-id':'1',url:base,pageurl:base,pagename:'search',rows:'100',start:'0','search-type':'keyword',storeid:source.merchantId,featured:'true','search-uid':'',q:'bourbon',channel:'instore',banner:source.banner});
const inventory=base+'/abs/pub/xapi/search/substitute?'+params;
const config=ALL_STATE_SOURCES.find(row=>row.id==='AK'),bible=new BourbonBible(fixture.records);
const options=directory=>{const lifecycleConfig=syntheticPromotedGroceryConfig();return{cacheDir:path.join(directory,'cache'),incidentDir:path.join(directory,'incidents'),lifecycleConfig,promotionManifest:syntheticPromotionManifest('AK',lifecycleConfig)};};

test('native transport admits only closed HTTPS store/channel/ZIP tuples before fetch',async t=>{
  let calls=0;const captured=[];t.mock.method(globalThis,'fetch',async(url,options)=>{calls++;captured.push(options);return new Response('{}',{status:200,headers:{'content-type':'application/json'}});});
  assert.equal(louisianaAlaskaRequestIdentity(resolver),'resolver');assert.equal(louisianaAlaskaRequestIdentity(inventory),'inventory');
  for(const bad of [resolver.replace('https:','http:'),resolver.replace('www.safeway.com','example.com'),resolver.replace('99503','10001'),resolver+'&unreviewed=true',
    inventory.replace('channel=instore','channel=delivery'),inventory.replace('storeid='+source.merchantId,'storeid=unreviewed'),inventory.replace('rows=100','rows=999'),inventory.replace('banner='+source.banner,'banner=unreviewed'),inventory+'#unreviewed']){
    await assert.rejects(()=>fetchReviewedLouisianaAlaskaText(bad));
  }
  assert.equal(calls,0);
  assert.equal((await fetchReviewedLouisianaAlaskaText(resolver,{headers:{authorization:'forbidden','user-agent':'forbidden'}})).text,'{}');
  await fetchReviewedLouisianaAlaskaText(inventory);
  assert.equal(calls,2);assert.ok(captured.every(row=>row.redirect==='error'));
  assert.ok(captured.every(row=>Object.keys(row.headers).sort().join(',')==='accept,ocp-apim-subscription-key'));
  assert.ok(captured.every(row=>row.signal instanceof AbortSignal));
});

test('denied headers are persisted before an unread body abort and survive expired cooldowns',async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),'la-ak-native-denied-'));let reads=0,calls=0;
  try{
    t.mock.method(globalThis,'fetch',async()=>{calls++;return{status:429,ok:false,url:resolver,headers:new Headers({'retry-after':'172800'}),body:{cancel:async()=>{},getReader(){reads++;throw Error('Denied body must never be read');}}};});
    const opts=options(directory);
    await assert.rejects(()=>collectLouisianaAlaskaGroceryProductionSource(config,bible,{...opts,fetchText:fetchReviewedLouisianaAlaskaText}),error=>error.status===429);
    const file=path.join(opts.incidentDir,'AK-grocery-production-incidents.json'),journal=JSON.parse(await readFile(file,'utf8'));
    const denial=journal['host:www.safeway.com'];assert.equal(denial.reviewRequired,true);assert.equal(denial.httpStatus,429);
    assert.ok(Date.parse(denial.nextAllowedAt)-Date.parse(denial.lastAttemptAt)>=172800000);
    assert.equal(reads,0);assert.equal(calls,1);
    denial.lastAttemptAt='2020-01-01T00:00:00.000Z';denial.nextAllowedAt='2020-01-03T00:00:00.000Z';await writeFile(file,JSON.stringify(journal));
    await assert.rejects(()=>collectLouisianaAlaskaGroceryProductionSource(config,bible,{...opts,forceLive:true}),error=>error.status===429&&error.details.reviewRequired===true&&error.details.requestCount===0);
    assert.equal(calls,1,'Elapsed time cannot authorize retry of an unresolved denial');
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('redirected or mismatched denial headers never create a foreign-host journal entry',async t=>{
  let callbacks=0;t.mock.method(globalThis,'fetch',async()=>({status:403,ok:false,url:'https://example.com/challenge',headers:new Headers(),body:{cancel:async()=>{}}}));
  await assert.rejects(()=>fetchReviewedLouisianaAlaskaText(resolver,{onResponse:()=>{callbacks++;}}),/final URL changed/);assert.equal(callbacks,0);
  const directory=await mkdtemp(path.join(tmpdir(),'la-ak-foreign-response-'));
  try{
    const opts=options(directory);
    await assert.rejects(()=>collectLouisianaAlaskaGroceryProductionSource(config,bible,{...opts,fetchText:async(_url,{onResponse})=>{
      await onResponse({status:403,url:'https://example.com/challenge'});throw Error('Unreachable');
    }}),/exact first-party URL/);
    const journal=JSON.parse(await readFile(path.join(opts.incidentDir,'AK-grocery-production-incidents.json'),'utf8'));
    assert.deepEqual(Object.keys(journal),['host:www.safeway.com']);assert.equal(journal['host:www.safeway.com'].status,'in_flight');
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('native body budgets and redirects fail closed without expanding source access',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('12345',{status:200,headers:{'content-length':'5'}});});
  await assert.rejects(()=>fetchReviewedLouisianaAlaskaText(resolver,{maxBytes:4}),/exceeded 4 bytes/);assert.equal(calls,1);
  t.mock.method(globalThis,'fetch',async(_url,options)=>{assert.equal(options.redirect,'error');throw new TypeError('redirect not allowed');});
  await assert.rejects(()=>fetchReviewedLouisianaAlaskaText(resolver),/redirect not allowed/);
  assert.throws(()=>validateLouisianaAlaskaIncidentJournal({'host:example.com':{status:'access_denied',httpStatus:403,reviewRequired:true,lastAttemptAt:'2020-01-01',nextAllowedAt:'2020-01-02'}},'AK'),/invalid host/);
  assert.throws(()=>validateLouisianaAlaskaIncidentJournal({'host:www.safeway.com':{status:'access_denied',httpStatus:200,reviewRequired:true,lastAttemptAt:'2020-01-01',nextAllowedAt:'2020-01-02'}},'AK'),/invalid host/);
});


test('late native abort after denied headers still seals the actual denied status',async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),'la-ak-native-late-abort-')),controller=new AbortController();
  try{
    t.mock.method(globalThis,'fetch',async()=>{controller.abort(new Error('Late native cancellation'));return new Response('',{status:403});});
    const opts=options(directory);
    await assert.rejects(()=>collectLouisianaAlaskaGroceryProductionSource(config,bible,{...opts,signal:controller.signal}),error=>error.status===403);
    const journal=JSON.parse(await readFile(path.join(opts.incidentDir,'AK-grocery-production-incidents.json'),'utf8'));
    assert.equal(journal['host:www.safeway.com'].httpStatus,403);assert.equal(journal['host:www.safeway.com'].reviewRequired,true);
  }finally{await rm(directory,{recursive:true,force:true});}
});
