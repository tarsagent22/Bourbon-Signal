import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isGroceryExpansionEmptySearch,parseGroceryExpansionInventory} from '../src/collectors/grocery-xapi-expansion.mjs';
import {WESTERN_GROCERY_EXPANSION_SOURCES} from '../src/collectors/western-grocery-premises.mjs';
const captured=JSON.parse(await readFile(new URL('./fixtures/grocery-empty-search.json',import.meta.url)));
const source=WESTERN_GROCERY_EXPANSION_SOURCES.find(row=>row.stateCode==='WA'&&row.merchantId==='1494');
const term="Pappy Van Winkle's Family Reserve 20Y";
test('captured store-bound GR204 empty search is healthy zero and cannot create inventory',()=>{
 assert.equal(isGroceryExpansionEmptySearch(captured,source,term),true);
 assert.deepEqual(parseGroceryExpansionInventory(captured,source,{}, {observedAt:new Date().toISOString()}),[]);
});
test('empty-search recognition rejects unbound, unknown and contradictory responses',()=>{
 const mutations=[
  row=>{row.appCode='ERROR';},row=>{row.response.numFound=1;},row=>{row.response.numFound='0';},
  row=>{row.response.start=100;},row=>{row.response.docs=[{}];},row=>{row.response.docs=[];},
  row=>{row.response.miscInfo.query='different';},row=>{row.response.miscInfo.filter=row.response.miscInfo.filter.replaceAll('1494','1242');},
  row=>{delete row.response.miscInfo.filter;},
 ];
 for(const change of mutations){const row=structuredClone(captured);change(row);assert.equal(isGroceryExpansionEmptySearch(row,source,term),false);}
 assert.equal(isGroceryExpansionEmptySearch(captured,{...source},term),false);
 assert.equal(isGroceryExpansionEmptySearch({},source,term),false);
});
