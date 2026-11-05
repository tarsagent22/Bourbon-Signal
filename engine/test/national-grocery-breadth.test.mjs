import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BourbonBible} from '../src/core/bible.mjs';
import {parseBoundGroceryXapiInventory} from '../src/collectors/grocery-xapi-identity.mjs';
import {groceryExpansionPremiseMatches,collectGroceryExpansion,GROCERY_EXPANSION_REQUEST_LIMITS} from '../src/collectors/grocery-xapi-expansion.mjs';
import {nevadaXapiPremiseMatches,NEVADA_XAPI_RESOLVER_ZIPS} from '../src/collectors/nevada-xapi-runtime.mjs';
import {CALIFORNIA_REVIEWED_BREADTH_SOURCES,NEVADA_REVIEWED_BREADTH_SOURCES} from '../src/collectors/national-grocery-reviewed-premises.mjs';
import {CALIFORNIA_GROCERY_SOURCES} from '../src/collectors/california-grocery-premises.mjs';
import {WESTERN_GROCERY_RESOLVER_ZIPS} from '../src/collectors/western-grocery-premises.mjs';
const fixture=JSON.parse(await readFile(new URL('./fixtures/national-grocery-breadth-20261105/identity.json',import.meta.url)));
const bible=new BourbonBible(fixture.records);
const normalized=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');

test('reviewed breadth contains at most100 unique exact premises with frozen live product and coordinate proof',()=>{
  const additions=[...CALIFORNIA_REVIEWED_BREADTH_SOURCES,...NEVADA_REVIEWED_BREADTH_SOURCES];
  assert.ok(additions.length>0&&additions.length<=100);
  assert.equal(fixture.stores.length,additions.length);
  assert.equal(new Set(additions.map(s=>s.storeId||s.store.id)).size,additions.length);
  for(const captured of fixture.stores){
    const source=additions.find(s=>s.id===captured.sourceId),store=source.store||source;
    assert.ok(source,captured.sourceId);assert.equal(captured.premiseProof.status,200);
    assert.equal(captured.premiseProof.addressVerified,true);assert.equal(captured.premiseProof.coordinatesVerified,true);
    assert.match(captured.premiseProof.sha256,/^[a-f0-9]{64}$/);
    assert.ok(store.lat>32&&store.lat<43&&store.lng> -125&&store.lng< -114);
    assert.equal(store.lat,captured.latitude);assert.equal(store.lng,captured.longitude);
    assert.equal(captured.historicalAbsenceProven,false);
    assert.equal(normalized(captured.premiseProof.street),normalized(captured.resolver.address.line1));
    assert.equal(captured.premiseProof.state,captured.state);assert.equal(captured.premiseProof.zip,captured.resolver.address.zipcode);
    const matches=source.store?nevadaXapiPremiseMatches:groceryExpansionPremiseMatches;
    assert.equal(matches(source,captured.resolver),true);
    for(const mutation of [{locationId:'999999'},{address:{...captured.resolver.address,line1:'999 Different Premise'}},
      {address:{...captured.resolver.address,state:'XX'}},{domainName:'Unreviewed retailer'}])assert.equal(matches(source,{...captured.resolver,...mutation}),false);
    const parsed=parseBoundGroceryXapiInventory({response:{docs:captured.products}},source,bible);
    assert.deepEqual(parsed.map(row=>({productId:row.productId,canonicalBottleId:row.record.id,canonicalName:row.record.canonical,price:row.price})),captured.expected);
    const product=captured.products[0];assert.ok(product);
    for(const mutation of [{storeId:'999999'},{pid:'999999'},{containsAlcohol:false},{dispItemPackageQty:2},
      {channelEligibility:{inStore:false,shipping:true}},{channelInventory:{instore:'0',shipping:'1'}},
      {channelInventory:{instore:'1',instoreItemQty:0}}])assert.deepEqual(parseBoundGroceryXapiInventory({response:{docs:[{...product,...mutation}]}},source,bible),[]);
  }
});

test('expanded California retrieval stays inside request budget and two workers with a shared500ms request gate',async()=>{
  const cursorDir=await mkdtemp(path.join(tmpdir(),'national-breadth-'));
  const premises=CALIFORNIA_GROCERY_SOURCES.map(s=>({locationId:s.merchantId,polarisBannerName:s.banner,domainName:s.resolverDomainName||s.banner,
    address:{line1:s.address.slice(0,-`, ${s.city}, CA ${s.zip}`.length),city:s.city,state:'CA',country:'US',zipcode:s.zip}}));
  const sleeps=[];let inFlight=0,peak=0;
  try{
    const result=await collectGroceryExpansion({id:'CA'},bible,{cursorDir,sleep:async ms=>{sleeps.push(ms);},fetchText:async url=>{
      inFlight++;peak=Math.max(peak,inFlight);await new Promise(resolve=>setImmediate(resolve));inFlight--;
      return{ok:true,status:200,text:JSON.stringify(url.includes('storeresolver')?{instore:{stores:premises}}:{response:{docs:[]}})};
    }});
    assert.equal(result.metadata.complete,true);assert.equal(result.metadata.storeConcurrency,2);assert.equal(peak,2);
    assert.equal(result.metadata.verifiedPremises.length,CALIFORNIA_GROCERY_SOURCES.length);
    assert.ok(result.metadata.requests.length+8<=GROCERY_EXPANSION_REQUEST_LIMITS.CA);
    assert.equal(result.metadata.maxTransientRetries,8);assert.equal(result.metadata.broadPageLimit,1);
    assert.ok(sleeps.every(ms=>ms===500));assert.equal(sleeps.length,result.metadata.requests.length-1);
    assert.equal(new Set(WESTERN_GROCERY_RESOLVER_ZIPS.CA).size,WESTERN_GROCERY_RESOLVER_ZIPS.CA.length);
    assert.ok(NEVADA_XAPI_RESOLVER_ZIPS.includes('89801'));assert.ok(NEVADA_XAPI_RESOLVER_ZIPS.includes('89406'));
  }finally{await rm(cursorDir,{recursive:true,force:true});}
});
