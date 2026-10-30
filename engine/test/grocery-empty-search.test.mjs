import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BourbonBible} from '../src/core/bible.mjs';
import {isGroceryExpansionEmptySearch,parseGroceryExpansionInventory,collectGroceryExpansion} from '../src/collectors/grocery-xapi-expansion.mjs';
import {WESTERN_GROCERY_EXPANSION_SOURCES} from '../src/collectors/western-grocery-premises.mjs';
const captured=JSON.parse(await readFile(new URL('./fixtures/grocery-empty-search.json',import.meta.url)));
const source=WESTERN_GROCERY_EXPANSION_SOURCES.find(row=>row.stateCode==='WA'&&row.merchantId==='1494');
const term="Pappy Van Winkle's Family Reserve 20Y";
const catalogBytes=await readFile(new URL('./fixtures/grocery-wa-catalog-empty.json',import.meta.url));
const catalogEmpty=JSON.parse(catalogBytes),unbound=JSON.parse(await readFile(new URL('./fixtures/grocery-la-unbound-empty.json',import.meta.url)));
const timeout=JSON.parse(await readFile(new URL('./fixtures/grocery-wa-backend-timeout.json',import.meta.url)));
const catalogSource=WESTERN_GROCERY_EXPANSION_SOURCES.find(row=>row.stateCode==='WA'&&row.merchantId==='1299');
const catalogTerm='Rock Hill Farms Single Barrel';
test('captured store-bound GR204 empty search is healthy zero and cannot create inventory',()=>{
 assert.equal(isGroceryExpansionEmptySearch(captured,source,term),true);
 assert.deepEqual(parseGroceryExpansionInventory(captured,source,{}, {observedAt:new Date().toISOString()}),[]);
});

test('actual WA catalog204 with empty docs proves only the exact echoed store/query zero',()=>{
 assert.equal(createHash('sha256').update(catalogBytes).digest('hex'),'6ec02e974304aec0e22f75cb88f35049f98b0922e906af0763c23edbe7be1d26');
 assert.equal(isGroceryExpansionEmptySearch(catalogEmpty,catalogSource,catalogTerm,{httpStatus:200}),true);
 for(const httpStatus of [undefined,0,206,403,429])assert.equal(isGroceryExpansionEmptySearch(catalogEmpty,catalogSource,catalogTerm,{httpStatus}),false);
 assert.deepEqual(parseGroceryExpansionInventory(catalogEmpty,catalogSource,{}, {observedAt:new Date().toISOString()}),[]);
 const mutations=[p=>p.appCode='GR204',p=>p.appCode='GR200 :: A-CT: 408',p=>delete p.appCode,
  p=>p.appMsg='timeout',p=>p.response.numFound=1,p=>p.response.numFound='0',p=>p.response.start=1,
  p=>delete p.response.docs,p=>p.response.docs=[{}],p=>p.response.isExactMatch=false,
  p=>p.response.miscInfo.query='other',p=>p.response.miscInfo.filter=p.response.miscInfo.filter.replaceAll('1299','1494'),
  p=>p.response.miscInfo.filter+=' OR (inventory(1494, price) >0)',p=>p.response.miscInfo.filter='(inventory(1299, price) >0)',
  p=>delete p.offersError,p=>p.offersError.code='OG500',p=>p.offersError.error='backend timeout',
  p=>p.offersError.partial=true,p=>p.partial=true,p=>p.response.partial=true];
 for(const mutate of mutations){const p=structuredClone(catalogEmpty);mutate(p);assert.equal(isGroceryExpansionEmptySearch(p,catalogSource,catalogTerm,{httpStatus:200}),false);}
 assert.equal(isGroceryExpansionEmptySearch(catalogEmpty,{...catalogSource},catalogTerm),false);
 assert.equal(isGroceryExpansionEmptySearch(unbound,catalogSource,catalogTerm),false,'Bare GR204 cannot prove a selected-store negative');
 assert.equal(isGroceryExpansionEmptySearch(timeout,catalogSource,catalogTerm),false);
});

test('injected collector accepts bound zero, but backend408 and missing-store products remain incomplete',async t=>{
 const fixture=JSON.parse(await readFile(new URL('./fixtures/washington-xapi-expansion/identity.json',import.meta.url)));
 const bible=new BourbonBible(fixture.records),store={locationId:catalogSource.merchantId,polarisBannerName:catalogSource.banner,domainName:catalogSource.resolverDomainName||catalogSource.banner,
  address:{line1:catalogSource.address.split(',')[0],city:catalogSource.city,state:'WA',country:'US',zipcode:catalogSource.zip}};
 const run=async transform=>{const cursorDir=await mkdtemp(path.join(tmpdir(),'synthetic-native-empty-'));t.after(()=>rm(cursorDir,{recursive:true,force:true}));
  return collectGroceryExpansion({id:'WA'},bible,{cursorDir,sleep:async()=>{},fetchText:async value=>{const url=new URL(value);let p;
   if(url.pathname.includes('storeresolver'))p={instore:{stores:[store]}};
   else{p=structuredClone(catalogEmpty);p.response.miscInfo.query=url.searchParams.get('q');p=transform(p);}
   return{ok:true,status:200,text:JSON.stringify(p)};}});};
 const healthy=await run(p=>p);assert.equal(healthy.metadata.sourceAttempts[catalogSource.id].status,'success');assert.equal(healthy.signals.length,0);
 const products=fixture.products.map(p=>({...p,storeId:catalogSource.merchantId}));
 const positive=await run(()=>({response:{docs:products}}));assert.equal(positive.metadata.sourceAttempts[catalogSource.id].status,'success');assert.ok(positive.signals.length>0);
 for(const transform of [()=>unbound,()=>timeout,()=>({appCode:'GR200 :: A-CT: 408'}),
  p=>({...p,appCode:'GR200 :: A-CT: 408'}),()=>({appCode:'GR200 :: A-CT: 408',response:{docs:products}}),
  ()=>({response:{docs:products.map(({storeId,...p})=>p)}})]){
  const result=await run(transform);assert.equal(result.metadata.sourceAttempts[catalogSource.id].status,'incomplete');assert.equal(result.metadata.complete,false);assert.deepEqual(result.signals,[]);
 }
 assert.deepEqual(parseGroceryExpansionInventory({appCode:'GR200 :: A-CT: 408',response:{docs:products}},catalogSource,bible,{observedAt:new Date().toISOString()}),[]);
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
