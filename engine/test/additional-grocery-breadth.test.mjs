import test from'node:test';
import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import{BourbonBible}from'../src/core/bible.mjs';
import{parseBoundGroceryXapiInventory}from'../src/collectors/grocery-xapi-identity.mjs';
import{groceryExpansionPremiseMatches,GROCERY_EXPANSION_REQUEST_LIMITS}from'../src/collectors/grocery-xapi-expansion.mjs';
import{ADDITIONAL_CALIFORNIA_GROCERY_SOURCES,ADDITIONAL_ILLINOIS_GROCERY_SOURCES}from'../src/collectors/additional-grocery-reviewed-premises.mjs';
import{CALIFORNIA_REVIEWED_BREADTH_SOURCES,NEVADA_REVIEWED_BREADTH_SOURCES}from'../src/collectors/national-grocery-reviewed-premises.mjs';
import{CALIFORNIA_GROCERY_SOURCES}from'../src/collectors/california-grocery-premises.mjs';
import{ILLINOIS_GROCERY_SOURCES,ILLINOIS_GROCERY_RESOLVER_ZIPS}from'../src/collectors/illinois-grocery-premises.mjs';
import{WESTERN_GROCERY_RESOLVER_ZIPS}from'../src/collectors/western-grocery-premises.mjs';
const fixture=JSON.parse(await readFile(new URL('./fixtures/additional-grocery-breadth-20261105/identity.json',import.meta.url))),bible=new BourbonBible(fixture.records);
const sources=[...ADDITIONAL_CALIFORNIA_GROCERY_SOURCES,...ADDITIONAL_ILLINOIS_GROCERY_SOURCES],prior=[...CALIFORNIA_REVIEWED_BREADTH_SOURCES,...NEVADA_REVIEWED_BREADTH_SOURCES];

test('49 additional California and Illinois premises retain exact store, positive product, coordinate and prior-cohort separation',()=>{
 assert.equal(ADDITIONAL_CALIFORNIA_GROCERY_SOURCES.length,47);assert.equal(ADDITIONAL_ILLINOIS_GROCERY_SOURCES.length,2);assert.equal(fixture.stores.length,49);
 assert.equal(fixture.historicalAbsenceProven,false);assert.equal(fixture.productionAdditions,0);
 for(const capture of fixture.stores){const source=sources.find(s=>s.id===capture.sourceId);assert.ok(source);
  assert.equal(prior.some(p=>(p.storeId||p.store.id)===source.storeId),false);assert.equal(capture.priorPreparedOverlap,false);assert.equal(capture.absentFromRetainedInventory,true);
  assert.equal(source.lat,capture.latitude);assert.equal(source.lng,capture.longitude);assert.equal(capture.premiseProof.addressVerified,true);assert.equal(capture.premiseProof.coordinatesVerified,true);
  assert.match(capture.premiseProof.sha256,/^[a-f0-9]{64}$/);assert.equal(groceryExpansionPremiseMatches(source,capture.resolver),true);
  for(const mutation of[{locationId:'999999'},{address:{...capture.resolver.address,line1:'999 Another Premise'}},{address:{...capture.resolver.address,state:'XX'}},{domainName:'Wrong merchant'}])assert.equal(groceryExpansionPremiseMatches(source,{...capture.resolver,...mutation}),false);
  const parse=products=>parseBoundGroceryXapiInventory({response:{docs:products}},source,bible);
  assert.deepEqual(parse(capture.products).map(row=>({productId:row.productId,canonicalBottleId:row.record.id,canonicalName:row.record.canonical,price:row.price})),capture.expected);
  const product=capture.products[0];for(const mutation of[{storeId:'999999'},{pid:'999999'},{containsAlcohol:false},{dispItemPackageQty:2},{channelEligibility:{inStore:false,shipping:true}},{channelInventory:{instore:'0',shipping:'1'}},{channelInventory:{instore:'1',instoreItemQty:0}}])assert.deepEqual(parse([{...product,...mutation}]),[]);
 }
});

test('California and Illinois reviewed premises fit the frozen two-worker retrieval ceilings',()=>{
 assert.equal(CALIFORNIA_GROCERY_SOURCES.length,567);assert.equal(ILLINOIS_GROCERY_SOURCES.length,182);
 assert.equal(new Set(CALIFORNIA_GROCERY_SOURCES.map(s=>s.storeId)).size,567);assert.equal(new Set(ILLINOIS_GROCERY_SOURCES.map(s=>s.storeId)).size,182);
 assert.ok(GROCERY_EXPANSION_REQUEST_LIMITS.CA>=WESTERN_GROCERY_RESOLVER_ZIPS.CA.length+CALIFORNIA_GROCERY_SOURCES.length*2+8+8);
 assert.ok(GROCERY_EXPANSION_REQUEST_LIMITS.IL>=ILLINOIS_GROCERY_RESOLVER_ZIPS.length+182*14+48+8);
});
