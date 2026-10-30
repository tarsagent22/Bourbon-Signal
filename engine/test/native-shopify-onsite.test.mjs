import test from 'node:test';import assert from 'node:assert/strict';import {readFile}from'node:fs/promises';
import {BourbonBible}from'../src/core/bible.mjs';
import {NATIVE_PICKUP_PREPARATION_SOURCES}from'../src/native-shopify-preparation-policy.mjs';
import {isNativeShopifyOnSiteSignal}from'../src/native-shopify-onsite-policy.mjs';
import {collectClosedNativePickupObservation,collectNativeShopifyOnSite,nativeShopifyProductionAllowed}from'../src/collectors/native-shopify-onsite.mjs';
import {syntheticNativeAdmission,nativeFixtureFetch}from'./helpers/synthetic-native-shopify.mjs';
import {mkdtemp,rm,writeFile}from'node:fs/promises';import{tmpdir}from'node:os';import path from'node:path';
import {persistCityHiveIncidentJournal}from'../src/collectors/central-cityhive-transport.mjs';
import {collectState}from'../src/collectors/generic-state.mjs';
const records=JSON.parse(await readFile(new URL('./fixtures/native-shopify-preparation/bible.json',import.meta.url),'utf8')).records;
async function setup(t){const dir=await mkdtemp(path.join(tmpdir(),'native-shopify-fixture-'));assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));t.after(()=>rm(dir,{recursive:true,force:true}));return{...syntheticNativeAdmission('mi:wine-palace-livonia'),cacheDir:path.join(dir,'stock'),incidentDir:path.join(dir,'incidents')};}
for(const source of NATIVE_PICKUP_PREPARATION_SOURCES)test(source.key+' exact original native captures produce only on-site rows without invented counts',async()=>{
 const bodies=new Map(await Promise.all(source.receipts.map(async receipt=>[receipt.url,await readFile(new URL('./fixtures/'+source.base+receipt.artifactPath,import.meta.url),'utf8')])));
 let requests=0;const result=await collectClosedNativePickupObservation(source.definition.runtimeId,new BourbonBible(records),{observedAt:source.clock,fetchText:async url=>{requests++;assert.ok(bodies.has(url));return{ok:true,status:200,url,text:bodies.get(url)};}});
 assert.equal(requests,2);assert.equal(result.signals.length,1);const row=result.signals[0];assert.equal(row.quantity,0);assert.equal(row.quantityIsExact,false);assert.equal(row.observedAt,source.clock);assert.equal(row.previewOnly,undefined);
 assert.equal(isNativeShopifyOnSiteSignal(row,{nowMs:Date.parse(source.clock)+30000}),true);assert.equal(isNativeShopifyOnSiteSignal(row,{nowMs:Date.parse(source.clock)+3600001}),false);
 for(const mutation of [{storeId:'neighbor'},{variantId:'wrong'},{quantity:1},{canAlertAsInventory:true},{canAlertAsWatch:true},{eligibleForDelivery:true},{quarantined:true},{raw:{...row.raw,staleFallback:true}}])assert.equal(isNativeShopifyOnSiteSignal({...row,...mutation},{nowMs:Date.parse(source.clock)+30000}),false);
 const disabled=new BourbonBible(records.map(record=>({...record,libraryAlertEligible:false})));
 const suppressed=await collectClosedNativePickupObservation(source.definition.runtimeId,disabled,{observedAt:source.clock,fetchText:async url=>({ok:true,status:200,url,text:bodies.get(url)})});assert.equal(suppressed.signals.length,0);
});
test('state activation alone or old CityHive authority cannot start either native leaf or inspect transport/storage',async()=>{
 let calls=0;const config={activeStates:['MI','TX'],states:{MI:{publicStatus:'active',promotionStage:'active',inventoryAlertable:false,watchAlertable:false},TX:{publicStatus:'active'}}};
 const options={config};for(const key of ['fetchText','cacheDir','incidentDir'])Object.defineProperty(options,key,{get(){calls++;throw Error('Inactive leaf touched '+key);}});
 for(const source of NATIVE_PICKUP_PREPARATION_SOURCES){assert.equal(nativeShopifyProductionAllowed(source.definition.runtimeId,{config}),false);assert.equal((await collectNativeShopifyOnSite(source.definition.runtimeId,new BourbonBible(records),options)).metadata.requestCount,0);}
 assert.equal(nativeShopifyProductionAllowed('mi:wine-palace-livonia',{config,authority:{enabled:true,sourceId:'mi:nj-mi-cityhive'}}),false);assert.equal(calls,0);
 await assert.rejects(()=>collectNativeShopifyOnSite('www.usawinenj.com',new BourbonBible(records),options),/Unknown closed/);
  const report=await collectState({id:'MI',label:'Michigan'},new BourbonBible(records),{lifecycleConfig:config,fetcher:()=>{calls++;throw Error('Held CityHive fallback called');}});assert.equal(report.status,'not_promoted');assert.equal(calls,0);
});

test('synthetic admitted MI actual state path caches original clocks and rechecks current library without enabling old CityHive',async t=>{
 const options=await setup(t),fetchText=await nativeFixtureFetch(options.source),bible=new BourbonBible(records);
 const report=await collectState({id:'MI',label:'Michigan'},bible,{lifecycleConfig:options.config,nativeShopifyOptions:{...options,fetchText}});
 assert.equal(report.signals.length,1);assert.equal(report.metadata.requestCount,2);assert.equal(report.signals[0].sourceRuntimeId,'mi:wine-palace-livonia');
 const cached=await collectNativeShopifyOnSite('mi:wine-palace-livonia',bible,{...options,nowMs:options.nowMs+60000,fetchText:()=>{throw Error('Cache must not fetch');}});
 assert.equal(cached.metadata.requestCount,0);assert.equal(cached.signals[0].observedAt,options.source.clock);
 const disabled=await collectNativeShopifyOnSite('mi:wine-palace-livonia',new BourbonBible(records.map(row=>({...row,libraryAlertEligible:false}))),{...options,fetchText:()=>{throw Error('Cache must not fetch');}});assert.equal(disabled.signals.length,0);
});
for(const status of [403,429])test(`native HTTP${status} headers survive parent cancellation and keep stock unchanged`,async t=>{
 const options=await setup(t),bible=new BourbonBible(records);await collectNativeShopifyOnSite('mi:wine-palace-livonia',bible,{...options,fetchText:await nativeFixtureFetch(options.source)});
 const stock=path.join(options.cacheDir,'mi-wine-palace-livonia.json'),before=await readFile(stock,'utf8'),controller=new AbortController();let calls=0;
 const previous=globalThis.fetch;globalThis.fetch=async url=>{calls++;controller.abort(Error('cancelled after headers'));return{ok:false,status,url:String(url),headers:new Headers({'retry-after':status===429?'259200':'0'}),body:{cancel:async()=>{}},text:()=>{throw Error('Denied response body must not be read');}}};t.after(()=>{globalThis.fetch=previous;});
 await assert.rejects(()=>collectNativeShopifyOnSite('mi:wine-palace-livonia',bible,{...options,forceLive:true,signal:controller.signal}),error=>error.status===status);
 assert.equal(await readFile(stock,'utf8'),before);const journal=JSON.parse(await readFile(path.join(options.incidentDir,'mi-wine-palace-livonia.json'),'utf8')),entry=journal.hosts['winepalacemi.com'];
 assert.equal(entry.httpStatus,status);assert.ok(Date.parse(entry.nextAllowedAt)-Date.parse(entry.lastAttemptAt)>=(status===429?3:1)*86400000);assert.ok(journal.inFlight);
 await assert.rejects(()=>collectNativeShopifyOnSite('mi:wine-palace-livonia',bible,{...options,cacheDir:path.join(options.cacheDir,'cold'),nowMs:options.nowMs+8*3600000}),/unresolved durable|denial remains held/);assert.equal(calls,1);
});
test('denial-write failure preserves durable unresolved latch and blocks a cold-cache retry; pre-HTTP persistence failure makes zero requests',async t=>{
 const options=await setup(t);let writes=0,calls=0;
 const persist=(file,value)=>{if(++writes===3)throw Object.assign(Error('denial destination unavailable'),{code:'EACCES'});return persistCityHiveIncidentJournal(file,value);};
 await assert.rejects(()=>collectNativeShopifyOnSite('mi:wine-palace-livonia',new BourbonBible(records),{...options,persistIncidentJournal:persist,fetchText:async(url,args)=>{calls++;await args.onResponse({ok:false,status:403,url});return{ok:false,status:403,url,text:''};}}),error=>error.status===403&&error.details.incidentWriteFailed===true);
 const journal=JSON.parse(await readFile(path.join(options.incidentDir,'mi-wine-palace-livonia.json'),'utf8'));assert.ok(journal.inFlight);
 await assert.rejects(()=>collectNativeShopifyOnSite('mi:wine-palace-livonia',new BourbonBible(records),{...options,fetchText:()=>{calls++;throw Error('Must stay held');}}),/unresolved durable/);assert.equal(calls,1);
 const other=await setup(t);await assert.rejects(()=>collectNativeShopifyOnSite('mi:wine-palace-livonia',new BourbonBible(records),{...other,persistIncidentJournal:()=>{throw Error('preflight refused');},fetchText:()=>{calls++;}}),/preflight refused/);assert.equal(calls,1);
});
