import {collectIllinoisGrocerySource,illinoisGroceryCohortKey} from '../src/collectors/illinois-grocery-runtime-source.mjs';
import {verifyIllinoisGrocery} from '../src/verify-il-grocery.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BourbonBible} from '../src/core/bible.mjs';
import {ILLINOIS_GROCERY_SOURCES as sources} from '../src/collectors/illinois-grocery-premises.mjs';
import {collectGroceryExpansion,parseGroceryExpansionInventory,isGroceryExpansionEmptySearch,ILLINOIS_GROCERY_PRIORITY_TERMS} from '../src/collectors/grocery-xapi-expansion.mjs';
import {isGroceryExpansionInventory} from '../src/grocery-xapi-policy.mjs';
import {canonicalizeSignal} from '../src/operational-report.mjs';
import {bibleLookup,buildDrops,dropHasPositiveAlertInventory} from '../src/export-site-contract.mjs';
import {isPublicDropFeedEligible} from '../../src/lib/public-drop-evidence.ts';
import {arizonaXapiIncidents} from '../src/collectors/arizona-xapi-incidents.mjs';
import {PHOENIX_METRO_RETAILERS,parseMetroWooProduct,isMetroRetailerProof,metroLibraryTier} from '../src/collectors/arizona-metro-retailers.mjs';
const fixture=JSON.parse(await readFile(new URL('./fixtures/illinois-grocery/identity.json',import.meta.url)));
const virginia=JSON.parse(await readFile(new URL('./fixtures/virginia-market-phoenix/identity.json',import.meta.url)));
const bible=new BourbonBible(fixture.records),source=sources.find(row=>row.merchantId===String(fixture.store.locationId));
const resolveStores=sources.map(row=>({locationId:row.merchantId,polarisBannerName:row.banner,domainName:row.resolverDomainName,
  address:{line1:row.address.slice(0,row.address.indexOf(', ')),city:row.city,state:'IL',country:'US',zipcode:row.zip}}));
const empty=(id,term)=>({appCode:'GR204',response:{numFound:0,start:0,miscInfo:{query:term,
  filter:`(inventory(${id}, price) >0) AND (inventory(${id},attributes.custom_type_2) = 1)`}}});

test('all 180 closed Illinois premises receive the core searches and bounded pagination without duplicate stock',async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.parse(fixture.capturedAt)+60000});
  const urls=[];let active=0,maximum=0;
  const result=await collectGroceryExpansion({id:'IL'},bible,{sleep:async()=>{},observedAt:fixture.capturedAt,
    fetchText:async url=>{
      urls.push(url);active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setImmediate(resolve));active--;
      const u=new URL(url);if(u.pathname.includes('storeresolver'))return {ok:true,status:206,text:JSON.stringify({instore:{stores:resolveStores}})};
      const id=u.searchParams.get('storeid'),term=u.searchParams.get('q'),start=Number(u.searchParams.get('start'));
      return {ok:true,status:200,text:JSON.stringify(id===source.merchantId
        ?{response:{start,docs:fixture.products,miscInfo:{query:term,nextPageToken:'more'}}}:empty(id,term))};
    }});
  assert.equal(result.metadata.complete,true);
  assert.equal(result.metadata.verifiedPremises.length,180);
  assert.ok(maximum<=2);assert.ok(maximum>1);
  assert.ok(urls.length<=2700);
  assert.equal(result.signals.length,6);
  for(const row of sources)for(const term of ILLINOIS_GROCERY_PRIORITY_TERMS){
    assert.equal(urls.filter(url=>{const u=new URL(url);return u.searchParams.get('storeid')===row.merchantId&&u.searchParams.get('q')===term;}).length,1);
  }
  assert.equal(result.metadata.exhaustiveRetrievalVerified,false);
  const op=result.signals.map(row=>canonicalizeSignal(row,bible));
  const drops=buildDrops(op,bibleLookup(bible.records),op);
  const input={state:{state:'IL',status:'useful',stale:false,startedAt:fixture.capturedAt,finishedAt:new Date().toISOString(),signals:result.signals,precisionMetadata:{grocery:result.metadata}},
    drops,minimumStores:1,minimumRows:6,minimumAllocatedStores:1};
  assert.equal(verifyIllinoisGrocery(input).freshPublicStores,1);
  assert.throws(()=>verifyIllinoisGrocery({...input,minimumStores:150}),/floor/);
  const missing=structuredClone(input);missing.state.precisionMetadata.grocery.requests=missing.state.precisionMetadata.grocery.requests.filter(row=>!(row.merchantId===sources[0].merchantId&&row.term==='weller'));
  assert.throws(()=>verifyIllinoisGrocery(missing),/eight core/);
  const copied=structuredClone(input);copied.drops.push(structuredClone(copied.drops[0]));
  assert.throws(()=>verifyIllinoisGrocery(copied),/Duplicate/);
  const recovered=structuredClone(input);const original=recovered.state.precisionMetadata.grocery.requests.find(row=>row.kind==='inventory');
  recovered.state.precisionMetadata.grocery.requests.unshift({...original,ok:false,status:503});
  assert.equal(verifyIllinoisGrocery(recovered).status,'ok');
  recovered.state.precisionMetadata.grocery.requests[0].status=429;
  assert.throws(()=>verifyIllinoisGrocery(recovered),/recovered/);

  assert.deepEqual(urls.filter(url=>{const u=new URL(url);return u.searchParams.get('storeid')===source.merchantId&&u.searchParams.get('q')==='bourbon';}).map(url=>new URL(url).searchParams.get('start')),['0','100','200']);
});

test('Illinois source proof survives real operational/public projections and rejects premise, product and stock changes',t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.parse(fixture.capturedAt)+60000});
  const rows=parseGroceryExpansionInventory({response:{docs:fixture.products}},source,bible,{observedAt:fixture.capturedAt});
  assert.equal(rows.length,6);assert.ok(rows.every(isGroceryExpansionInventory));
  const op=rows.map(row=>canonicalizeSignal(row,bible));assert.ok(op.every(row=>row.canAlertAsInventory));
  const drops=buildDrops(op,bibleLookup(bible.records),op);
  assert.equal(drops.length,6);assert.ok(drops.every(dropHasPositiveAlertInventory));
  assert.ok(drops.every(isPublicDropFeedEligible));
  assert.ok(drops.every(row=>row.quantity===0&&row.quantityIsExact===false));
  for(const change of [row=>row.storeAddress='Another address',row=>row.merchantId='9999',row=>row.sourceUrl='https://example.com/product',
    row=>row.sourceProductBinding.productSnapshot.storeId='9999',row=>row.sourceProductBinding.productSnapshot.channelInventory.instore='0',
    row=>row.sourceProductBinding.productSnapshot.dispItemSizeQty='50',row=>row.sourceProductBinding.productSnapshot.upc='1',
    row=>row.sourceProductBinding.productSnapshot.alcoholVolumePct=40,row=>row.raw={shadowOnly:true},row=>row.stale=true]){
    const row=structuredClone(drops.find(row=>row.rawName.includes('Eagle Rare')));change(row);assert.equal(dropHasPositiveAlertInventory(row),false,String(change));
    assert.equal(canonicalizeSignal(row,bible).canAlertAsInventory,false,String(change));
  }
});

test('concurrent grocery workers persist a denial and never start a queued request after it',async()=>{
  let denied=false,inventory=0,persisted=false;
  const result=await collectGroceryExpansion({id:'IL'},bible,{sleep:async()=>{},persistAttempts:async attempts=>{
    persisted=attempts['host:www.jewelosco.com']?.httpStatus===429;
  },fetchText:async url=>{
    if(url.includes('storeresolver'))return {ok:true,status:200,text:JSON.stringify({instore:{stores:resolveStores}})};
    assert.equal(denied,false,'a denied host must stop before queued I/O');inventory++;denied=true;
    return {ok:false,status:429,text:'{}'};
  }});
  assert.equal(inventory,1);assert.equal(persisted,true);assert.equal(result.metadata.complete,false);
});

test('Arizona denial journals survive a later run without changing source observation clocks',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'az-grocery-incident-'));
  try{
    const file=path.join(directory,'incidents.json');const first=await arizonaXapiIncidents({file});
    first.record('www.safeway.com',403);
    const second=await arizonaXapiIncidents({file});assert.equal(second.blocked.has('www.safeway.com'),true);
    assert.equal(second.blocked.has('www.albertsons.com'),false);
    const expired=await arizonaXapiIncidents({file,nowMs:Date.now()+86_400_001});assert.equal(expired.blocked.size,0);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('new Phoenix retailer preserves allocated expression identity, exact premise and binary stock',t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.parse(virginia.observedAt)+60000});
  const retailer=PHOENIX_METRO_RETAILERS.find(row=>row.id==='virginia-market-phoenix'),bible=new BourbonBible(virginia.records);
  const rows=virginia.products.map(product=>parseMetroWooProduct(product,retailer,bible,{observedAt:virginia.observedAt,
    premiseMapQuery:virginia.premiseMapQuery,productQueryUrl:retailer.baseUrl+'/wp-json/wc/store/v1/products?search=bourbon'})).filter(Boolean);
  assert.equal(rows.length,11);assert.ok(rows.every(isMetroRetailerProof));
  assert.ok(rows.every(row=>row.lat===33.4768522&&row.lng===-112.0648288));
  assert.ok(rows.some(row=>row.canonicalName==='E.H. Taylor Small Batch'&&metroLibraryTier(row,bible)==='allocated'));
  const op=rows.map(row=>canonicalizeSignal(row,bible));const drops=buildDrops(op,bibleLookup(bible.records),op);
  assert.ok(drops.length>=3);assert.ok(drops.every(isPublicDropFeedEligible));
  const bad=structuredClone(rows[0]);bad.sourceProductBinding.premiseMapQuery='Another store';assert.equal(isMetroRetailerProof(bad),false);
});

test('captured Illinois minimal GR204 and terminal pages are healthy zero and never stock evidence',()=>{
  const minimal={appCode:'GR204',appMsg:'GR : Google Retail returned empty response..'};
  assert.equal(isGroceryExpansionEmptySearch(minimal,source,'bourbon',{start:100}),true);
  assert.equal(parseGroceryExpansionInventory(minimal,source,bible,{observedAt:fixture.capturedAt}).length,0);
  for(const payload of [{...minimal,appCode:'AUTH401'},{...minimal,appMsg:'Access denied'},{...minimal,error:'unavailable'},{}]){
    assert.equal(isGroceryExpansionEmptySearch(payload,source,'bourbon'),false);
  }
  assert.equal(isGroceryExpansionEmptySearch(minimal,source,'weller',{start:100}),false);
  assert.equal(isGroceryExpansionEmptySearch(minimal,{...source},'bourbon'),false);
  const terminal=empty(source.merchantId,'bourbon');terminal.response.start=200;
  assert.equal(isGroceryExpansionEmptySearch(terminal,source,'bourbon',{start:200}),true);
});

test('Illinois cache preserves original observations and a subsequent denial prevents cache reactivation',async()=>{
  const cacheDir=await mkdtemp(path.join(tmpdir(),'il-cache-'));
  const now=Date.now(),observedAt=new Date(now-60000).toISOString();
  const signals=parseGroceryExpansionInventory({response:{docs:fixture.products}},source,bible,{observedAt});
  try{
    await writeFile(path.join(cacheDir,'IL-grocery-xapi-cache.json'),JSON.stringify({schemaVersion:1,cohortKey:illinoisGroceryCohortKey(),generatedAt:observedAt,signals,metadata:{complete:true}}));
    const cached=await collectIllinoisGrocerySource({id:'IL'},bible,{cacheDir,nowMs:now,forceLive:false,fetchText:async()=>{throw Error('Unexpected network');}});
    assert.equal(cached.accounting.requestCount,0);assert.equal(cached.signals[0].observedAt,observedAt);
    let calls=0;
    const failed=await collectIllinoisGrocerySource({id:'IL'},bible,{cacheDir,nowMs:now,forceLive:true,sleep:async()=>{},fetchText:async()=>{calls++;return {ok:false,status:403,text:''};}});
    assert.equal(failed.signals.length,0);assert.equal(calls,1);
    const after=await collectIllinoisGrocerySource({id:'IL'},bible,{cacheDir,nowMs:now,forceLive:false,sleep:async()=>{},fetchText:async()=>{throw Error('Denied source must not be requested');}});
    assert.equal(after.signals.length,0);assert.equal(after.accounting.requestCount,0);
    assert.equal(JSON.parse(await readFile(path.join(cacheDir,'IL-grocery-xapi-cache.json'),'utf8')).signals[0].observedAt,observedAt);
  }finally{await rm(cacheDir,{recursive:true,force:true});}
});

test('Illinois permits only bounded recovered transport failures while completing the full cohort',async()=>{
  let failed=false;
  const result=await collectGroceryExpansion({id:'IL'},bible,{sleep:async()=>{},fetchText:async url=>{
    const u=new URL(url);if(u.pathname.includes('storeresolver'))return {ok:true,status:206,text:JSON.stringify({instore:{stores:resolveStores}})};
    if(!failed){failed=true;return {ok:false,status:503,text:''};}
    return {ok:true,status:200,text:JSON.stringify(empty(u.searchParams.get('storeid'),u.searchParams.get('q')))};
  }});
  assert.equal(result.metadata.complete,true);assert.equal(result.metadata.transientRetries,1);
  assert.equal(result.metadata.maxTransientRetries,8);assert.ok(result.metadata.requests.length<=2700);
});
