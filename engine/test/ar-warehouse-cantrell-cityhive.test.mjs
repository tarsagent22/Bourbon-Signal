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

const warehouseFixture=JSON.parse(await readFile(new URL('./fixtures/ar-cityhive/warehouse-cantrell-barrel-proof.json',import.meta.url),'utf8'));
const riverpointeFixture=JSON.parse(await readFile(new URL('./fixtures/ar-cityhive/riverpointe-fort-smith-rare-breed.json',import.meta.url),'utf8'));
const crossoverFixture=JSON.parse(await readFile(new URL('./fixtures/ar-cityhive/crossover-fayetteville-elijah-craig.json',import.meta.url),'utf8'));
const source=ARKANSAS_CITYHIVE_RESEARCH_SOURCES.find(row=>row.merchantId==='66b0f6cbfafb100f08637872');
const riverpointeSource=ARKANSAS_CITYHIVE_RESEARCH_SOURCES.find(row=>row.merchantId==='6009ef4967fa8c268106ede9');
const crossoverSource=ARKANSAS_CITYHIVE_RESEARCH_SOURCES.find(row=>row.merchantId==='5e73e18f355a61249a9dd7c0');
const bible=new BourbonBible(integrateLibraryCatalog([...riverpointeFixture.legacyRecords,crossoverFixture.bibleRecord],
  {records:[...warehouseFixture.libraryCatalog.records,...riverpointeFixture.libraryCatalog.records]}));
const wrap=payload=>`<script>JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(payload))}"))</script>`;
const captureHtml=(payloads)=>payloads.map(wrap).join('');

test('Warehouse Cantrell current capture yields only exact allocated AR pickup reports in research mode',()=>{
  assert.equal(warehouseFixture.libraryCatalog.recordCount,1176);
  assert.equal(warehouseFixture.libraryCatalog.digest,'d599a3b86a9e78c5706a16df17f578276297ec5b419ef4198d085048438d6734');
  const config=cityHiveResearchSourceForState('AR');
  assert.ok(source);assert.ok(config);assert.equal(config.active,false);assert.equal(config.cadence,'shadow-only');
  assert.equal(config.sources.some(row=>row.url===source.categoryUrl),true);
  assert.equal(CENTRAL_CITYHIVE_STATE_IDS.has('AR'),false);
  const lifecycle=cityHiveResearchLifecycleEntries().AR;
  assert.equal(lifecycle.publicStatus,'research_only');assert.equal(lifecycle.inventoryAlertable,false);assert.equal(lifecycle.watchAlertable,false);
  const mainConfig=warehouseFixture.storeConfigs.find(row=>row.id==='68263ec02aaba94989284476');
  assert.equal(mainConfig.pickup,false);
  assert.equal(ARKANSAS_CITYHIVE_RESEARCH_SOURCES.some(row=>row.merchantId===mainConfig.id),false,
    'Main St has a separate merchant config but its false pickup setting provides no source entry');
  const mainSource={...source,id:`warehouse-liquor-market-ar-main:${mainConfig.id}`,merchantId:mainConfig.id,
    storeId:`warehouse-liquor-market-ar-main:${mainConfig.id}`,address:mainConfig.address.full_address,
    lat:mainConfig.address.location.coordinates[1],lng:mainConfig.address.location.coordinates[0],
    categoryUrl:`https://warehouseliquorlr.com/shop/?merchant-id=${mainConfig.id}`};
  assert.deepEqual(parseCityHiveProducts(captureHtml(warehouseFixture.payloads),mainSource,{sources:[source,mainSource],isAllowedOption:centralCityHiveBottleFormat}),[],
    'the held response has no exact product option bound to the non-pickup Main St merchant');

  const rows=parseCentralCityHiveInventory(captureHtml(warehouseFixture.payloads),source,bible,{observedAt:warehouseFixture.capture.capturedAt});
  assert.ok(warehouseFixture.payloads[0].products.some(row=>row.name==='Elijah Craig Barrel Proof Store Pick 2023'));
  assert.ok(warehouseFixture.payloads[0].products.some(row=>row.name==='Larceny Barrel Proof Brourbon'));
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
    const payloads=structuredClone(warehouseFixture.payloads);mutate(payloads[0]);
    return parseCentralCityHiveInventory(captureHtml(payloads),source,bible,{observedAt:warehouseFixture.capture.capturedAt});
  };
  const only1792=rows=>assert.deepEqual(rows.map(row=>row.canonicalName),['1792 Full Proof']);
  only1792(mutateAndParse(payload=>payload.products[0].merchants[0].offer_types=['shipping']));
  only1792(mutateAndParse(payload=>payload.products[0].merchants[0].full_address='1007 S Main St, Little Rock, AR 72202, USA'));
  only1792(mutateAndParse(payload=>payload.products[0].merchants[0].product_options[0].quantity=0));
  only1792(mutateAndParse(payload=>payload.products[0].merchants[0].product_options[0].option_id='unreviewed-option'));
  only1792(mutateAndParse(payload=>payload.products[0].merchants[0].product_options[0].option_display_data.size.quantity='50'));
});

test('Riverpointe Fort Smith exact 750 mL Rare Breed option matches the eligible limited identity',()=>{
  assert.ok(riverpointeSource);
  assert.equal(riverpointeSource.address,'6207 Grand Ave, Fort Smith, AR 72904, USA');
  assert.equal(riverpointeSource.merchantId,'6009ef4967fa8c268106ede9');
  assert.equal(riverpointeFixture.capture.sha256,'3b73ba139397fb9c8ee08c3b34f935fce28cd63a2ba0d236d8902d51aa0a683b');
  assert.equal(riverpointeFixture.libraryCatalog.recordCount,1176);
  assert.equal(riverpointeFixture.libraryCatalog.digest,warehouseFixture.libraryCatalog.digest);
  const capturedAt=Date.parse(riverpointeFixture.capture.capturedAt);
  const uploadedAt=Date.parse(riverpointeFixture.capture.inventoryUpdatedAt);
  assert.ok(capturedAt-uploadedAt<24*60*60*1000,'the source inventory upload is less than 24 hours old at capture');
  const exact=riverpointeFixture.libraryCatalog.records.find(row=>row.id==='bb_22604f9ddde2b6ba');
  assert.equal(exact.canonicalName,'Wild Turkey Rare Breed Straight Bourbon');
  assert.equal(exact.nationalTier,'limited');assert.equal(exact.isAlertEligible,true);
  assert.equal(bible.match('Wild Turkey Rare Breed Bourbon')?.record?.id,'bb_22604f9ddde2b6ba');

  const rows=parseCentralCityHiveInventory(captureHtml(riverpointeFixture.payloads),riverpointeSource,bible,{observedAt:riverpointeFixture.capture.capturedAt});
  assert.deepEqual(rows.map(row=>row.canonicalName),['Wild Turkey Rare Breed Straight Bourbon'],
    'the same response also contains a separate Rare Breed Rye row, which fails the exact limited identity match');
  const row=rows[0];
  assert.equal(row.productId,'56553d8e69702d2923120000');
  assert.equal(row.optionId,'b56a6adeb1ad500184602447d60e35e0600270238ba5ee3cc53632f7a2ff4a3c');
  assert.equal(row.price,56.97);assert.equal(row.tier,'limited');assert.equal(row.sourceProductBinding.reportedQuantity,4);
  assert.equal(row.sourceProductBinding.pickupOfferVerified,true);assert.equal(centralCityHiveLibraryTier(row,bible),'limited');
  assert.equal(row.quantity,0);assert.equal(row.quantityIsExact,false);
});

test('Riverpointe Rare Breed evidence fails closed on shipping-only, address drift or changed option',()=>{
  const mutateAndParse=mutate=>{
    const payloads=structuredClone(riverpointeFixture.payloads);mutate(payloads[0]);
    return parseCentralCityHiveInventory(captureHtml(payloads),riverpointeSource,bible,{observedAt:riverpointeFixture.capture.capturedAt});
  };
  assert.deepEqual(mutateAndParse(payload=>payload.products[0].merchants[0].offer_types=['shipping']),[]);
  assert.deepEqual(mutateAndParse(payload=>payload.products[0].merchants[0].full_address='6207 Wrong Ave, Fort Smith, AR 72904, USA'),[]);
  assert.deepEqual(mutateAndParse(payload=>payload.products[0].merchants[0].product_options[0].option_id='unreviewed-option'),[]);
});

test('Crossover Fayetteville binds the 750 mL Elijah Craig rye option to its exact pickup address',()=>{
  assert.equal(crossoverFixture.capture.sha256,crossoverSource.evidenceCaptureSha256);
  const rows=parseCentralCityHiveInventory(captureHtml(crossoverFixture.payloads),crossoverSource,bible,
    {observedAt:crossoverFixture.capture.capturedAt});
  assert.equal(rows.length,1);
  const [row]=rows;
  assert.equal(row.storeAddress,'1890 N Crossover Rd, Fayetteville, AR 72701, USA');
  assert.equal(row.canonicalName,'Elijah Craig Straight Rye Whiskey');
  assert.equal(row.tier,'limited');
  assert.equal(row.sourceUrl,crossoverSource.evidenceUrl);
  assert.equal(row.sourceProductBinding.reportedQuantity,8);
  assert.equal(centralCityHiveLibraryTier(row,bible),'limited');
  const drifted=structuredClone(crossoverFixture.payloads);
  drifted[0].merchant_configs[0].merchant.address.location.coordinates[0]=-94;
  assert.deepEqual(parseCentralCityHiveInventory(captureHtml(drifted),crossoverSource,bible,
    {observedAt:crossoverFixture.capture.capturedAt}),[]);
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
        const payloads=merchantId===source.merchantId?warehouseFixture.payloads
          :merchantId===riverpointeSource.merchantId?riverpointeFixture.payloads
          :merchantId===crossoverSource.merchantId?crossoverFixture.payloads:sodie.payloads;
        return{ok:true,status:200,url,text:captureHtml(payloads)};
      }});
    assert.ok(calls.length>0);assert.equal(report.metadata.complete,true);assert.equal(report.metadata.shadowOnly,true);
    assert.equal(report.metadata.customerDeliveryAllowed,false);assert.equal(report.metadata.productionActivationAllowed,false);
    assert.deepEqual(report.signals.map(row=>row.canonicalName).sort(),['1792 Full Proof','Elijah Craig Barrel Proof','Elijah Craig Straight Rye Whiskey','Wild Turkey Rare Breed Straight Bourbon']);
    for(const row of report.signals){
      assert.equal(row.state,'AR');assert.ok([source.storeId,riverpointeSource.storeId,crossoverSource.storeId].includes(row.storeId));assert.equal(row.raw.shadowOnly,true);
      assert.equal(row.sourceProductBinding.shadowOnly,true);assert.equal(row.quantity,0);assert.equal(row.quantityIsExact,false);
      for(const flag of ['alertable','canAlertAsInventory','canAlertAsWatch','eligibleForOnSite','eligibleForDropFeed','eligibleForWatch','eligibleForDelivery','eligibleForEmail','eligibleForSms'])assert.equal(row[flag],false);
    }
  }finally{
    if(previousShadowMode===undefined)delete process.env.BOURBON_SIGNAL_SHADOW_MODE;else process.env.BOURBON_SIGNAL_SHADOW_MODE=previousShadowMode;
    await rm(dir,{recursive:true,force:true});
  }
});
