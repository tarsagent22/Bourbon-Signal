import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BourbonBible} from '../engine/src/core/bible.mjs';
import {collectTexasShopifyPickup,TEXAS_SHOPIFY_PICKUP_SOURCE as source} from '../engine/src/collectors/texas-shopify-pickup.mjs';
import {canonicalizeSignal} from '../engine/src/operational-report.mjs';
import {bibleLookup,buildDrops} from '../engine/src/export-site-contract.mjs';
import * as harness from '../apps/mobile/src/astra-test-harness.ts';
import * as coreModule from '../src/lib/sighting-store-directory-core.ts';
import * as contractModule from '../src/lib/site-engine-contract.ts';
import * as coverageModule from '../src/lib/coverage-model.ts';
import * as knownModule from '../src/lib/coverage-known-stores.ts';
import * as evidenceModule from '../src/lib/public-drop-evidence.ts';
import * as classificationModule from '../src/lib/drop-classification.ts';
import * as receiptModule from '../src/lib/nationwide-pilot-receipt.ts';
import * as matcherModule from '../src/lib/monitoring-scope-matcher.ts';
import * as scopeModule from '../src/lib/monitoring-scopes.ts';
import * as deliveryModule from '../src/lib/alert-delivery.ts';
import * as emailModule from '../src/lib/email-alerts.ts';
const interop=<T>(value:T):T=>(value as {default?:T}).default||value;
const {loadWithMocks}=interop(harness),{sightingStoreAddressKey,searchSightingStoreDirectory}=interop(coreModule);
const {normalizeDropForSite,normalizeStoreForSite}=interop(contractModule);
const store=source.stores[0],at=new Date().toISOString();
const fixtureRoot=new URL('../engine/test/fixtures/independent-shopify-pickup/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',fixtureRoot),'utf8'));
const captures=new Map(await Promise.all(manifest.captures.filter((row:any)=>row.sourceId===source.id).map(async(row:any)=>[row.requestedUrl,await readFile(new URL(row.file,fixtureRoot),'utf8')])));
const temp=await mkdtemp(path.join(tmpdir(),'bs-tx-customer-'));
assert.ok(path.resolve(temp).startsWith(path.resolve(tmpdir())+path.sep));
try {
  // Frozen first-party bodies exercise customer paths, not a live coverage claim.
  const bible=await BourbonBible.load('engine/out/bourbon-bible.json');
  const result=await collectTexasShopifyPickup({id:'TX'},bible,{cacheFile:path.join(temp,'cache.json'),observedAt:at,
    fetchText:async(url:string)=>({ok:true,status:200,url,text:captures.get(url)})});
  assert.equal(result.signals.length,2);
  const operational=result.signals.map((row:any)=>canonicalizeSignal(row,bible));
  const drops=buildDrops(operational,bibleLookup(bible.records),operational).map(normalizeDropForSite);
  assert.equal(drops.length,2);
  const runtime={id:store.id,state:'TX',name:store.name,address:store.address,city:store.city,zip:store.zip,county:store.county,
    source:source.sourceLabel,sourceStoreId:store.id,locationType:'store',precision:'store',searchable:true};
  const unknown={...runtime,id:'unknown-tx',name:'Unknown',address:'999999 Unknown Street'};
  const closed={...runtime,id:'closed-tx',name:'Closed',address:'999998 Closed Street',status:'closed'};
  const directoryModule=loadWithMocks('src/lib/sighting-store-directory.ts',{
    'next/cache':{unstable_cache:(fn:Function)=>fn},
    './site-engine-contract':{readSiteExportResults:async()=>[{payload:{stores:[runtime,unknown,closed]}}],readBundledSiteExport:()=>null},
    './approved-catalog-service':{listApprovedLocations:async()=>[]},
  });
  const directory=await directoryModule.readSightingStoreDirectory();
  const selected=directory.filter((row:any)=>row.id===store.id);
  assert.equal(selected.length,1,'the known TABC and current pickup premise must have one selectable identity');
  assert.equal(selected[0].county,'Travis');
  assert.equal(sightingStoreAddressKey(selected[0]),sightingStoreAddressKey(runtime));
  assert.ok(selected[0].aliases.includes('hot-spot-austin:78701'));
  assert.ok(searchSightingStoreDirectory(directory,'Hot Spot Austin','TX').some((row:any)=>row.id===store.id));
  assert.ok(!directory.some((row:any)=>row.id===unknown.id||row.id===closed.id));
  const storesRoute=loadWithMocks('src/app/api/stores/route.ts',{
    '@/lib/sighting-store-directory':{readSightingStoreDirectory:async()=>directory,SIGHTING_STORE_DIRECTORY_VERSION:'fixture'},
    '@/lib/site-engine-contract':{readSiteExport:async()=>({generatedAt:at}),siteExportHeaders:()=>({}),listStates:()=>['TX'],normalizeStoreForSite},
  });
  // The actual stores route pages the complete Texas directory; prove the exact
  // reviewed store remains selectable even when it falls outside page one.
  let found=false;
  for(let offset=0;offset<directory.length;offset+=1000){
    const response=await storesRoute.GET(new Request(`https://example.test/api/stores?state=TX&offset=${offset}&limit=1000`));
    assert.equal(response.status,200);const payload=await response.json();
    if(payload.stores.some((row:any)=>row.id===store.id)){found=true;break;}
    if(!payload.hasMore)break;
  }
  assert.ok(found);
  const locationsRoute=loadWithMocks('src/app/api/locations/route.ts',{
    '@/lib/site-engine-contract':{readSiteExport:async(name:string)=>name==='drops'?{drops}:{stores:[runtime],generatedAt:at},readBundledSiteExport:()=>null,
      siteExportHeaders:()=>({}),listStates:()=>['TX'],normalizeStoreForSite,normalizeDropForSite},
  });
  const locations=await(await locationsRoute.GET(new Request('https://example.test/api/locations?state=TX'))).json();
  assert.ok(locations.stores.some((row:any)=>row.id===store.id&&row.county==='Travis'));
  const lifecycle=JSON.parse(await readFile('src/config/state-lifecycle.json','utf8'));
  const classification=JSON.parse(await readFile('src/data/drop-feed-classification.generated.json','utf8'));
  const coverage=loadWithMocks('src/lib/coverage-server.ts',{
    'server-only':{},'@/config/stateLifecycle':{STATE_LIFECYCLE_CONFIG:lifecycle},'@/config/mississippi-known-stores.json':{stores:[]},
    '@/lib/coverage-model':interop(coverageModule),'@/lib/coverage-known-stores':interop(knownModule),
    '@/lib/retailer-signal-feed':{retailerSubmissionToFeedCard:()=>null},'@/lib/retailer-public-submissions':{readCachedPublicRetailerSubmissions:async()=>[]},
    '@/lib/public-drop-evidence':interop(evidenceModule),'@/lib/drop-classification':interop(classificationModule),
    '@/data/drop-feed-classification.generated.json':classification,'./nationwide-pilot-receipt':interop(receiptModule),
    '@/lib/source-lane-runtime':{readRuntimeSourceDropOverlay:async(rows:unknown[])=>({drops:rows,version:'fixture'})},
    '@/lib/site-engine-contract':{normalizeDropForSite,readSiteExportResults:async(names:string[])=>names.map(name=>({source:'remote-snapshot',snapshotId:'fixture',payload:
      name==='drops'?{drops}:name==='stats'?{generatedAt:at,stateCoverage:{states:[]}}:name==='stores'?{stores:[runtime]}:{locations:[runtime]}}))},
  });
  const coverageRoute=loadWithMocks('src/app/api/coverage/route.ts',{
    'next/server':{NextResponse:Response},'@/lib/coverage-server':coverage,'@/lib/nationwide-pilot-receipt':interop(receiptModule),
  });
  for(const query of ['Hot Spot Austin','411 Brazos','Austin']){
    const response=await coverageRoute.POST(new Request('https://example.test/api/coverage',{method:'POST',body:JSON.stringify({state:'TX',query})}));
    assert.equal(response.status,200);const payload=await response.json();
    assert.ok(payload.results.some((row:any)=>row.kind==='store'&&row.storeId===store.id&&row.status==='actively-monitored'),query);
  }
  const publicCoverage=await(await coverageRoute.GET(new Request('https://example.test/api/coverage'))).json();
  assert.equal(publicCoverage.states.find((row:any)=>row.code==='TX').freshness.currentInventoryStores,1);
  const {monitoringScopesFromPreferences}=interop(scopeModule),{candidateMatchesMonitoringScopes}=interop(matcherModule);
  const {normalizeAreaPrefs,candidateMatchesArea}=interop(deliveryModule),{matchDropToPreferences}=interop(emailModule);
  for(const [type,id,label] of [['store',`store:TX:${store.id}`,store.name],['county','county:48453','Travis County'],['city','city:legacy:TX:austin','Austin']]){
    const scopes=monitoringScopesFromPreferences({states:['TX'],monitoringScopes:[{type,id,state:'TX',label}]});
    assert.equal(scopes.length,1);
    const prefs=normalizeAreaPrefs({states:['TX'],monitoringScopes:scopes});
    for(const row of result.signals){assert.ok(candidateMatchesMonitoringScopes(row,scopes));assert.ok(candidateMatchesArea(row as never,prefs));}
    assert.ok(matchDropToPreferences(drops[0] as never,prefs as never).matched);
    const elsewhere={...result.signals[0],storeId:'other',county:'Harris',city:'Houston'};
    assert.equal(candidateMatchesMonitoringScopes(elsewhere,scopes),false);
  }
  console.log('Texas known TABC identity reconciled to exact pickup premise; real selectable stores, locations, public Coverage/POST, store/city/Travis County preferences pass; unknown/closed stores excluded.');
}finally{await rm(temp,{recursive:true,force:true});}
