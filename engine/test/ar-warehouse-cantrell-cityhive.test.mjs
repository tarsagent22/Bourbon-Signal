import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BourbonBible } from '../src/core/bible.mjs';
import { integrateLibraryCatalog } from '../src/core/library-catalog.mjs';
import { ARKANSAS_CITYHIVE_RESEARCH_SOURCES } from '../src/collectors/central-cityhive-research-premises.mjs';
import { centralCityHiveBottleFormat, centralCityHiveLibraryTier, parseCentralCityHiveInventory } from '../src/collectors/central-cityhive-expansion.mjs';
import { parseCityHiveProducts } from '../src/collectors/cityhive-surfaces.mjs';
import { cityHiveResearchLifecycleEntries, cityHiveResearchSourceForState, collectCityHiveResearchReport } from '../src/research-cityhive-runtime.mjs';
import { CENTRAL_CITYHIVE_STATE_IDS } from '../src/central-cityhive-policy.mjs';

const fixture=JSON.parse(await readFile(new URL('./fixtures/ar-cityhive/warehouse-cantrell-barrel-proof.json',import.meta.url),'utf8'));
const source=ARKANSAS_CITYHIVE_RESEARCH_SOURCES.find(row=>row.merchantId==='66b0f6cbfafb100f08637872');
const bible=new BourbonBible(integrateLibraryCatalog([],{records:fixture.libraryCatalog.records}));
const wrap=payload=>`<script>JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(payload))}"))</script>`;
const captureHtml=(payloads=fixture.payloads)=>payloads.map(wrap).join('');

test('Warehouse Cantrell current capture yields only exact allocated AR pickup reports in research mode',()=>{
  assert.equal(fixture.libraryCatalog.recordCount,1176);
  assert.equal(fixture.libraryCatalog.digest,'d599a3b86a9e78c5706a16df17f578276297ec5b419ef4198d085048438d6734');
  const config=cityHiveResearchSourceForState('AR');
  assert.ok(source);assert.ok(config);assert.equal(config.active,false);assert.equal(config.cadence,'shadow-only');
  assert.equal(config.sources.some(row=>row.url===source.categoryUrl),true);
  assert.equal(CENTRAL_CITYHIVE_STATE_IDS.has('AR'),false);
  const lifecycle=cityHiveResearchLifecycleEntries().AR;
  assert.equal(lifecycle.publicStatus,'research_only');assert.equal(lifecycle.inventoryAlertable,false);assert.equal(lifecycle.watchAlertable,false);
  const mainConfig=fixture.storeConfigs.find(row=>row.id==='68263ec02aaba94989284476');
  assert.equal(mainConfig.pickup,false);
  assert.equal(ARKANSAS_CITYHIVE_RESEARCH_SOURCES.some(row=>row.merchantId===mainConfig.id),false,
    'Main St has a separate merchant config but its false pickup setting provides no source entry');
  const mainSource={...source,id:`warehouse-liquor-market-ar-main:${mainConfig.id}`,merchantId:mainConfig.id,
    storeId:`warehouse-liquor-market-ar-main:${mainConfig.id}`,address:mainConfig.address.full_address,
    lat:mainConfig.address.location.coordinates[1],lng:mainConfig.address.location.coordinates[0],
    categoryUrl:`https://warehouseliquorlr.com/shop/?merchant-id=${mainConfig.id}`};
  assert.deepEqual(parseCityHiveProducts(captureHtml(),mainSource,{sources:[source,mainSource],isAllowedOption:centralCityHiveBottleFormat}),[],
    'the held response has no exact product option bound to the non-pickup Main St merchant');

  const rows=parseCentralCityHiveInventory(captureHtml(),source,bible,{observedAt:fixture.capture.capturedAt});
  assert.ok(fixture.payloads[0].products.some(row=>row.name==='Elijah Craig Barrel Proof Store Pick 2023'));
  assert.ok(fixture.payloads[0].products.some(row=>row.name==='Larceny Barrel Proof Brourbon'));
  assert.deepEqual(rows.map(row=>row.canonicalName).sort(),['1792 Full Proof','Elijah Craig Barrel Proof']);
  const byName=Object.fromEntries(rows.map(row=>[row.canonicalName,row]));
  for(const [name,productId,optionId,price,reportedQuantity] of [
    ['Elijah Craig Barrel Proof','56c29217756275139dc70300','3d93b49724609c76372fde68ad932452f0fcf332837dd94d9741a69e46868371',85.99,5],
    ['1792 Full Proof','59653a92355d0935c14d7491','dd1e2a742de147bca497d8c273d0435ef77c126aca7a9d2ce21cdf50e2654a7a',64.99,21],
  ]){
    const row=byName[name];
    assert.equal(row.merchantId,source.merchantId);assert.equal(row.storeId,source.storeId);
    assert.equal(row.storeAddress,'19610 Cantrell Rd, Little Rock, AR 72223, USA');
    assert.equal(row.productId,productId);assert.equal(row.optionId,optionId);assert.equal(row.price,price);
    assert.equal(row.tier,'limited');assert.equal(row.availabilityStatus,'in_stock');
    assert.equal(row.sourceProductBinding.reportedQuantity,reportedQuantity);
    assert.equal(row.sourceProductBinding.pickupOfferVerified,true);
    assert.equal(centralCityHiveLibraryTier(row,bible),'limited');
    assert.equal(row.quantity,0);assert.equal(row.quantityIsExact,false,'keep the store-reported count in evidence only');
  }
});

test('Warehouse Cantrell reports fail closed when pickup, address, quantity or exact option evidence changes',()=>{
  const mutateAndParse=mutate=>{
    const payloads=structuredClone(fixture.payloads);mutate(payloads[0]);
    return parseCentralCityHiveInventory(captureHtml(payloads),source,bible,{observedAt:fixture.capture.capturedAt});
  };
  const only1792=rows=>assert.deepEqual(rows.map(row=>row.canonicalName),['1792 Full Proof']);
  only1792(mutateAndParse(payload=>payload.products[0].merchants[0].offer_types=['shipping']));
  only1792(mutateAndParse(payload=>payload.products[0].merchants[0].full_address='1007 S Main St, Little Rock, AR 72202, USA'));
  only1792(mutateAndParse(payload=>payload.products[0].merchants[0].product_options[0].quantity=0));
  only1792(mutateAndParse(payload=>payload.products[0].merchants[0].product_options[0].option_id='unreviewed-option'));
  only1792(mutateAndParse(payload=>payload.products[0].merchants[0].product_options[0].option_display_data.size.quantity='50'));
});

test('Arkansas shadow adapter collects the held report offline and keeps every signal out of customer delivery',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'ar-cityhive-offline-shadow-'));
  const previousShadowMode=process.env.BOURBON_SIGNAL_SHADOW_MODE;
  try{
    process.env.BOURBON_SIGNAL_SHADOW_MODE='1';
    const sodie=JSON.parse(await readFile(new URL('./fixtures/ar-cityhive/sodies-little-book-chapter-10.json',import.meta.url),'utf8'));
    const config=cityHiveResearchSourceForState('AR'),calls=[];
    const report=await collectCityHiveResearchReport(config,bible,{env:{BOURBON_SIGNAL_SHADOW_MODE:'1'},reportDirectory:dir,captureRoot:null,
      cursorDir:path.join(dir,'cursor'),incidentFile:path.join(dir,'incidents.json'),sleep:async()=>{},
      readAttempts:async()=>({}),writeAttempts:async()=>{},persistIncidentJournal:async()=>{},
      fetchText:async url=>{
        calls.push(url);const merchantId=new URL(url).searchParams.get('merchant-id');
        const payloads=merchantId===source.merchantId?fixture.payloads:sodie.payloads;
        return{ok:true,status:200,url,text:captureHtml(payloads)};
      }});
    assert.ok(calls.length>0);assert.equal(report.metadata.complete,true);assert.equal(report.metadata.shadowOnly,true);
    assert.equal(report.metadata.customerDeliveryAllowed,false);assert.equal(report.metadata.productionActivationAllowed,false);
    assert.deepEqual(report.signals.map(row=>row.canonicalName).sort(),['1792 Full Proof','Elijah Craig Barrel Proof']);
    for(const row of report.signals){
      assert.equal(row.state,'AR');assert.equal(row.storeId,source.storeId);assert.equal(row.raw.shadowOnly,true);
      assert.equal(row.sourceProductBinding.shadowOnly,true);assert.equal(row.quantity,0);assert.equal(row.quantityIsExact,false);
      for(const flag of ['alertable','canAlertAsInventory','canAlertAsWatch','eligibleForOnSite','eligibleForDropFeed','eligibleForWatch','eligibleForDelivery','eligibleForEmail','eligibleForSms'])assert.equal(row[flag],false);
    }
  }finally{
    if(previousShadowMode===undefined)delete process.env.BOURBON_SIGNAL_SHADOW_MODE;else process.env.BOURBON_SIGNAL_SHADOW_MODE=previousShadowMode;
    await rm(dir,{recursive:true,force:true});
  }
});
