import {collectMetroRetailerSource} from '../src/collectors/precision-probes.mjs';
import {METRO_RETAILER_SOURCES,parseMetroCityHiveHtml} from '../src/collectors/metro-retailer-surfaces.mjs';
import {isMetroRetailerInventory} from '../src/metro-retailer-policy.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {BourbonBible} from '../src/core/bible.mjs';
import {integrateLibraryCatalog, normalizeLibraryCatalog, isLibraryDetectionTarget} from '../src/core/library-catalog.mjs';
import {librarySearchPool,buildLibrarySourceSearchPlan,isExactLibraryTarget,LIBRARY_SEARCH_LANES} from '../src/library-query-plan.mjs';
import {librarySourceSearchPlan,librarySourceSearchTerms,withLibrarySearchAudit,recordLibrarySearchResponse,rotateLibraryProductCandidates} from '../src/library-search-runtime.mjs';
import {discoverArizonaSmartFinalProducts,parseArizonaSmartFinalInventory,smartFinalProductUrl} from '../src/collectors/arizona-smart-final.mjs';
import {isArizonaRetailerInventory} from '../src/arizona-retailer-policy.mjs';
import {canonicalizeSignal} from '../src/operational-report.mjs';
import {bibleLookup,buildDrops,publicSignal} from '../src/export-site-contract.mjs';
import {isPublicDropFeedEligible} from '../../src/lib/public-drop-evidence.ts';
import {arizonaXapiRequestPlan} from '../src/collectors/arizona-xapi.mjs';
const bottle=(id,canonicalName,extra={})=>({id,canonicalName,aliases:[canonicalName],nationalTier:'allocated',stateOverrides:[],...extra});
const entries=[bottle('rare','Example Whiskey 12 Year'),bottle('rye','Another Rye Barrel Proof'),bottle('finish','Distant Spirit Finished in Port Casks')];
const bible=new BourbonBible(integrateLibraryCatalog([],{records:entries}));

test('every scarce identity participates in the shared search pool and arbitrary additional bottles need no source whitelist',async()=>{
 const full=await BourbonBible.load();
 const catalog=normalizeLibraryCatalog(JSON.parse(await readFile(new URL('../../src/data/drop-feed-classification.generated.json',import.meta.url))));
 const pool=librarySearchPool(full);
 for(const row of catalog.filter(isLibraryDetectionTarget))assert(pool.includes(row.canonicalName),row.canonicalName);
 assert(librarySearchPool(bible).includes('Another Rye Barrel Proof'));
 assert.equal(isExactLibraryTarget('Another Rye Barrel Proof',bible),true);
 assert.equal(isExactLibraryTarget('Another Rye',bible),false);
 assert.equal(isExactLibraryTarget('Example Whiskey 15 Year',bible),false);
 assert.equal(isExactLibraryTarget('Example Whiskey 12 Year Gift Set',bible),false);
});

test('bounded source rotation covers every pool entry with broad searches preserved and no clock-based starvation',()=>{
 const seen=new Set();let cursor=0;
 for(let i=0;i<10;i++){
  const p=buildLibrarySourceSearchPlan(bible,{sourceKey:'test',budget:4,broadTerms:['bourbon','rye'],cursor});
  assert.equal(p.terms.length,4);assert.deepEqual(p.terms.slice(0,2),['bourbon','rye']);
  p.rotatingTerms.forEach(q=>seen.add(q));cursor=p.nextCursor;
 }
 for(const term of librarySearchPool(bible))assert(seen.has(term),term);
 assert.throws(()=>buildLibrarySourceSearchPlan(bible,{sourceKey:'test',budget:1,broadTerms:['bourbon']}),/rotation needs/);
 assert.equal(Object.keys(LIBRARY_SEARCH_LANES).length,9);
});

test('cursor survives a real process restart and independent source cursors do not consume each other',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'library-cursor-'));
 try{
  const first=await librarySourceSearchPlan(bible,{sourceKey:'test:a',budget:2,cursorDir:dir});
  const moduleUrl=new URL('../src/library-search-runtime.mjs',import.meta.url).href;
  const code=`import {librarySourceSearchPlan} from ${JSON.stringify(moduleUrl)};console.log(JSON.stringify(await librarySourceSearchPlan(${JSON.stringify(bible)},{sourceKey:'test:a',budget:2,cursorDir:${JSON.stringify(dir)}})));`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',windowsHide:true});
  assert.equal(child.status,0,child.stderr);const next=JSON.parse(child.stdout);
  assert.equal(next.invocation,1);assert.notDeepEqual(next.terms,first.terms);
  const independent=await librarySourceSearchPlan(bible,{sourceKey:'test:b',budget:2,cursorDir:dir});assert.deepEqual(independent.terms,first.terms);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('planned terms and failed HTTP requests cannot be reported as successful searches',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'library-audit-'));
 try{
  const result=await withLibrarySearchAudit(async()=>{
   const terms=await librarySourceSearchTerms(bible,{sourceKey:'test',budget:2,cursorDir:dir});
   recordLibrarySearchResponse(`https://example.test/search?q=${encodeURIComponent(terms[0])}`,{},{ok:false,status:403});
   return{signals:[],metadata:{retained:true}};
  });
  assert.equal(result.metadata.retained,true);assert.equal(result.metadata.librarySearch.plans.length,1);
  assert.equal(result.metadata.librarySearch.requests.length,1);assert.equal(result.metadata.librarySearch.requests[0].ok,false);
 }finally{await rm(dir,{recursive:true,force:true});}
});

const fixture=JSON.parse(await readFile(new URL('./fixtures/library-search/smart-final.json',import.meta.url)));
const fullBible=await BourbonBible.load();
const page=fixture.searches.bourbon;
const store=page.stores.activeStoreDetails;
const searchUrl='https://www.smartandfinal.com/sm/pickup/rsid/730/results?q=bourbon';
const discover=(p=page)=>discoverArizonaSmartFinalProducts(p,store,fullBible,{sourceUrl:searchUrl,query:'bourbon'});
const candidate=discover().find(p=>p.name==='Weller Full Proof');

test('captured Smart & Final search discovers a new allocated expression and verifies independent positive store stock through public export',t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse(fixture.capturedAt)+60_000});
 assert(candidate);const sourceUrl=smartFinalProductUrl(store,candidate);
 const parsed=parseArizonaSmartFinalInventory(fixture.detail,store,fullBible,{observedAt:fixture.capturedAt,sourceUrl,candidate});
 assert.equal(parsed.length,1);assert.equal(parsed[0].canonicalName,'Weller Full Proof');
 assert.equal(parsed[0].sourceProductBinding.schemaVersion,2);assert(isArizonaRetailerInventory(parsed[0]));
 const canon=canonicalizeSignal(parsed[0],fullBible);assert(canon);
 const drops=buildDrops([canon],bibleLookup(fullBible.records),[canon]);assert.equal(drops.length,1);assert(isPublicDropFeedEligible(drops[0]));
});

test('search cards, wrong store, changed SKU/name/size, unavailable stock and omitted stock status remain excluded',()=>{
 for(const mutate of [p=>p.stores.activeStoreDetails.id='wrong',p=>p.stores.activeStoreDetails.addressLine1='999 Elsewhere',p=>p.search.pagination.searchResults.searchQuery='other',p=>p.shoppingModes.selectedShoppingMode.displayName='delivery']){
  const p=structuredClone(page);mutate(p);assert.deepEqual(discover(p),[]);
 }
 const sourceUrl=smartFinalProductUrl(store,candidate);
 for(const mutate of [p=>p.product.available=false,p=>delete p.product.attributes.StockStatus,p=>p.product.attributes.StockStatus='out',p=>p.product.sku='other',p=>p.product.name='Weller Special Reserve',p=>p.product.unitOfSize.size=1750,p=>p.stores.activeStoreDetails.id='wrong']){
  const p=structuredClone(fixture.detail);mutate(p);assert.deepEqual(parseArizonaSmartFinalInventory(p,store,fullBible,{observedAt:fixture.capturedAt,sourceUrl,candidate}),[]);
 }
 assert.deepEqual(parseArizonaSmartFinalInventory(fixture.detail,store,fullBible,{observedAt:fixture.capturedAt,sourceUrl,candidate:{...candidate,storeUuid:'wrong'}}),[]);
});

test('product-detail slots rotate beyond the same few high-ranking bottles and survive catalog additions',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'library-products-'));
 try{
  const products=Array.from({length:17},(_,i)=>({sku:String(i).padStart(14,'0')}));const seen=new Set();
  for(let i=0;i<3;i++){const selected=await rotateLibraryProductCandidates(products,{sourceKey:'test:products',limit:6,cursorDir:dir});selected.forEach(p=>seen.add(p.sku));}
  assert.equal(seen.size,17);
  const expanded=[{sku:'new'},...products];const next=await rotateLibraryProductCandidates(expanded,{sourceKey:'test:products',limit:6,cursorDir:dir});assert.equal(next[0].sku,products[1].sku);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('production preserves search progress even when inventory publication fails',async()=>{
 const workflow=await readFile(new URL('../../.github/workflows/refresh-feed.yml',import.meta.url),'utf8');
 const restore=workflow.slice(workflow.indexOf('      - name: Restore library search progress'),workflow.indexOf('      - name: Restore North Carolina board intelligence'));
 assert(restore.includes('engine/out/cache/library-search'));assert(restore.includes('actions/cache/restore@v4'));
 const save=workflow.slice(workflow.indexOf('      - name: Save library search progress'),workflow.indexOf('      - name: Save browser source artifacts'));
 assert(save.includes('if: always()'));assert(save.includes('actions/cache/save@v4'));
});

test('Arizona supplemental store coverage advances on invocation even within the same wall-clock bucket',()=>{
 const stores=Array.from({length:134},(_,i)=>({locationId:String(10000+i),polarisBannerName:'safeway',domainName:'safeway',address:{line1:`${i+1} Main St`,city:'Phoenix',state:'AZ',zipcode:'85001'}}));
 const terms=Array.from({length:16},(_,i)=>`Example expression ${i}`);const visited=new Set();
 for(let invocation=0;invocation<9;invocation++){
  const plan=arizonaXapiRequestPlan(stores,{terms,nowMs:Date.parse('2026-10-25T12:00:00Z'),rotationIndex:invocation});
  assert.equal(plan.flatMap(row=>row.terms).length,150);
  const targets=plan.filter(row=>row.terms.length>1);assert.equal(new Set(targets.map(row=>row.terms[1])).size,16);
  targets.forEach(row=>visited.add(row.store.locationId));
 }
 assert.equal(visited.size,134);
});

test('allocated and unicorn targets lead the search rotation ahead of limited or explicitly alert-disabled expressions',()=>{
 const rows=[bottle('a-limited','Limited Example',{nationalTier:'limited'}),bottle('z-unicorn','Unicorn Example',{nationalTier:'unicorn'}),bottle('b-disabled','Disabled Example',{nationalTier:'unicorn',isAlertEligible:false})];
 const b=new BourbonBible(integrateLibraryCatalog([],{records:rows}));
 const plan=buildLibrarySourceSearchPlan(b,{sourceKey:'test:rarity',budget:1});
 assert.equal(plan.terms[0],'Unicorn Example');
});

test('an exact allocated rye survives actual metro collection, canonicalization, export and customer evidence while unknown rye and unsafe formats remain excluded',async t=>{
 const source=METRO_RETAILER_SOURCES.find(s=>s.id==='michaeltowne-wines');const store=source.stores[0];
 const observedAt=new Date().toISOString();
 const makePage=title=>`<html data-ch-merchant-id="${store.merchantId}"><script type="application/json">${JSON.stringify({merchant_configs:[{merchant:{id:store.merchantId,pickup:true,address:{full_address:store.address}}}]})}</script><script type="application/ld+json">${JSON.stringify({'@type':'ItemList',itemListElement:[{'@type':'Product',name:title,description:title,productID:'test-rye',url:`${source.baseUrl}/shop/product/whiskey/null?option-id=test-rye`,offers:{availability:'https://schema.org/InStock',price:'79.99'}}]})}</script></html>`;
 const options={isLibraryTarget:name=>isExactLibraryTarget(name,bible)};
 assert.equal(parseMetroCityHiveHtml(makePage('Another Rye Barrel Proof'),source,options).length,1);
 assert.equal(parseMetroCityHiveHtml(makePage('Unknown Rye Barrel Proof'),source,options).length,0);
 assert.equal(parseMetroCityHiveHtml(makePage('Another Rye Barrel Proof 50 ml'),source,options).length,0);
 assert.equal(parseMetroCityHiveHtml(makePage('Another Rye Barrel Proof Gift Set'),source,options).length,0);
 t.mock.method(globalThis,'fetch',async()=>new Response(makePage('Another Rye Barrel Proof'),{status:200,headers:{'content-type':'text/html'}}));
 const result=await collectMetroRetailerSource({id:'NY'},bible,source,observedAt);
 assert.equal(result.signals.length,1);const signal=result.signals[0];assert(isMetroRetailerInventory(signal));
 assert.equal(isMetroRetailerInventory({...signal,sourceProductBinding:null}),false);
 assert.equal(isMetroRetailerInventory({...signal,sourceProductBinding:{...signal.sourceProductBinding,productId:'wrong'}}),false);
 const canon=canonicalizeSignal(signal,bible);assert(isMetroRetailerInventory(canon),JSON.stringify(canon));const pub=publicSignal(canon,bibleLookup(bible.records));assert(isPublicDropFeedEligible(pub),JSON.stringify(pub));const drops=buildDrops([canon],bibleLookup(bible.records),[canon]);assert.equal(drops.length,1);assert(isPublicDropFeedEligible(drops[0]));
});

test('library additions and tier edits preserve the next source query instead of restarting the first few bottles',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'library-growth-'));
 try{
  const first=await librarySourceSearchPlan(bible,{sourceKey:'test:growth',budget:2,cursorDir:dir});
  const originalPool=librarySearchPool(bible);const expectedNext=originalPool[first.nextCursor];
  const updated=new BourbonBible(integrateLibraryCatalog([],{records:[...entries,bottle('a-new-unicorn','A New Unicorn',{nationalTier:'unicorn'})]}));
  const second=await librarySourceSearchPlan(updated,{sourceKey:'test:growth',budget:2,cursorDir:dir});
  assert.equal(second.terms[0],expectedNext);
  const seen=new Set([...first.terms,...second.terms]);
  for(let i=0;i<10;i++)(await librarySourceSearchTerms(updated,{sourceKey:'test:growth',budget:2,cursorDir:dir})).forEach(term=>seen.add(term));
  for(const term of librarySearchPool(updated))assert(seen.has(term),term);
 }finally{await rm(dir,{recursive:true,force:true});}
});
