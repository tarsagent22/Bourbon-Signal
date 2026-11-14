import test from 'node:test';
import assert from 'node:assert/strict';
import {centralCityHiveProductionCohortKey,CENTRAL_CITYHIVE_PRODUCTION_BUDGETS} from '../src/central-cityhive-production-config.mjs';
import {CENTRAL_CITYHIVE_PRODUCTION_COHORTS} from '../src/collectors/central-cityhive-premises.mjs';
import {collectCentralCityHiveProductionState,centralCityHiveProductionAllowed} from '../src/collectors/central-cityhive-production.mjs';
import {isDelawareEcwidProductionOnSiteSignal} from '../src/delaware-ecwid-production-policy.mjs';
import {verifyDelawareFirstPublication} from '../src/verify-de-first-publication.mjs';
import {ALL_STATE_SOURCES} from '../src/state-sources.mjs';
import {STATE_LIFECYCLE_CONFIG} from '../src/state-lifecycle.mjs';
import {parseDelawareEcwidCapture} from '../src/research-delaware-ecwid.mjs';
import {BourbonBible} from '../src/core/bible.mjs';
import sourceData from '../data/de-ecwid-research-source.json' with {type:'json'};
import {librarySourceSearchTerms} from '../src/library-search-runtime.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';

const nowMs=Date.parse('2026-11-14T20:23:18.081Z');

test('Delaware recurring cohort is pinned to both Kreston premises and Banks exact pickup identity',()=>{
  assert.equal(centralCityHiveProductionCohortKey('DE'),'2ff60687569747c6aa829f62cc371a894591b1fba53b4ff76e426650eed98e21');
  assert.equal(CENTRAL_CITYHIVE_PRODUCTION_COHORTS.DE,centralCityHiveProductionCohortKey('DE'));
  assert.deepEqual(CENTRAL_CITYHIVE_PRODUCTION_BUDGETS.DE,{sourceMs:40_000,stateMs:55_000,maxRequests:6,requestTimeoutMs:4_000});
});

test('Delaware remains default-deny before every source request and fails closed without promotion evidence',async()=>{
  const calls=[];const config=ALL_STATE_SOURCES.find(row=>row.id==='DE');
  const report=await collectCentralCityHiveProductionState(config,{records:[]},{fetchText:async url=>{calls.push(url);throw Error('network forbidden');}});
  assert.equal(report.status,'not_promoted');assert.equal(report.metadata.requestCount,0);assert.deepEqual(calls,[]);
  assert.equal(centralCityHiveProductionAllowed('DE',STATE_LIFECYCLE_CONFIG),false);
});

test('Delaware Banks visibility accepts only the reviewed exact, fresh, binary pickup binding',()=>{
  const cohort=centralCityHiveProductionCohortKey('DE'),observedAt=new Date(nowMs-30_000).toISOString();
  const row={state:'DE',stateCode:'DE',type:'retailer_store_inventory_result',sourceRuntimeId:'de:ecwid-pickup',
    sourceUrl:'https://bankswinesandspirits.com/products/old-forester-bws-single-barrel-bourbon-barrel-strength-750ml',
    productId:'813956453',storeId:'ecwid:de:130511528',storeAddress:'38014 Town Center Drive, Millville, DE 19967',city:'Millville',
    storeName:'Banks Wines & Spirits',sourceLabel:'Banks Wines & Spirits Millville first-party pickup',rawName:'OLD FORESTER BWS SINGLE BARREL BOURBON BARREL STRENGTH 750ML',
    locationPrecision:'store_level',canonicalBottleId:'old-forester-single-barrel-barrel-proof',canonicalName:'Old Forester Single Barrel Barrel Proof',
    tier:'allocated',observedAt,availabilityStatus:'in_stock',sourceAvailabilityVerified:true,price:85.99,quantity:0,quantityIsExact:false,
    quantitySemantics:'binary_retailer_orderable_no_exact_count',eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,
    canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false,
    raw:{productionOnSiteOnly:true},sourceProductBinding:{schemaVersion:1,source:'ecwid-first-party-pickup',merchantId:'130511528',
      storeId:'ecwid:de:130511528',storeAddress:'38014 Town Center Drive, Millville, DE 19967',productId:'813956453',sku:'081128002664',
      rawName:'OLD FORESTER BWS SINGLE BARREL BOURBON BARREL STRENGTH 750ML',
      canonicalId:'old-forester-single-barrel-barrel-proof',canonicalName:'Old Forester Single Barrel Barrel Proof',observedAt,
      premisesVerified:true,pickupOfferVerified:true,quantitySemantics:'binary_retailer_orderable_no_exact_count',reportedQuantity:22,price:85.99,
      productionOnSiteOnly:true,productionCohortSha256:cohort}};
  assert.equal(isDelawareEcwidProductionOnSiteSignal(row,{nowMs}),true);
  assert.equal(isDelawareEcwidProductionOnSiteSignal({...row,sourceProductBinding:{...row.sourceProductBinding,sku:'wrong'}},{nowMs}),false);
  assert.equal(isDelawareEcwidProductionOnSiteSignal({...row,eligibleForEmail:true},{nowMs}),false);
  assert.equal(isDelawareEcwidProductionOnSiteSignal({...row,observedAt:new Date(nowMs-3*60*60_000).toISOString()},{nowMs}),false);
});

test('Delaware production transform accepts the held exact pickup parser row without publishing its count',async()=>{
  const bible=await BourbonBible.load(new URL('../out/bourbon-bible.json',import.meta.url));
  const initialState=JSON.stringify(JSON.stringify({profile:{profile:{storeId:130511528,storeName:'Banks Wines & Spirits',siteUrl:sourceData.source.origin,countryCode:'US',storeClosed:false,storeSuspended:false}}}));
  const home=`<script>window.initialState = ${initialState};</script><div class="ins-tile__address">${sourceData.source.premise.address}</div><main>${sourceData.source.premise.pickupPolicy}</main>`;
  const item={'@context':'http://schema.org','@type':'Product',name:sourceData.product.title,sku:sourceData.product.sku,gtin12:sourceData.product.sku,
    image:[{'@type':'ImageObject',contentUrl:'https://d2j6dbq0eux0bg.cloudfront.net/images/130511528/products/813956453/5564781103.jpg'}],
    offers:{'@type':'Offer',priceCurrency:'USD',price:'89.0',url:sourceData.product.url,availability:'http://schema.org/InStock',seller:{'@type':'Organization',name:'Banks Wines & Spirits'}}};
  const product=`<script>window.initialState = ${initialState};</script><script type="application/ld+json">${JSON.stringify(item)}</script><meta itemprop="sku" content="${sourceData.product.sku}" /><div class="details-product-purchase__place">In stock: 22 available</div><button>Add to Bag</button><div class="ec-iconable-block__text">Pickup: today, 12:30 PM–09:30 PM</div>`;
  const observedAt=new Date(nowMs-20_000).toISOString(),row=parseDelawareEcwidCapture(home,product,bible,observedAt);
  const {shadowOnly:_shadowOnly,reportedQuantity:_reportedQuantity,...raw}=row.raw;
  const production={...row,sourceRuntimeId:'de:ecwid-pickup',raw:{...raw,productionOnSiteOnly:true},eligibleForOnSite:true,eligibleForDropFeed:true,
    sourceProductBinding:{...row.sourceProductBinding,productionOnSiteOnly:true,productionCohortSha256:centralCityHiveProductionCohortKey('DE')}};
  assert.equal(production.quantity,0);assert.equal(production.quantityIsExact,false);assert.equal(production.raw.reportedQuantity,undefined);
  assert.equal(isDelawareEcwidProductionOnSiteSignal(production,{nowMs}),true);
});

test('Delaware first-publication verifier rejects preview, stale, and incomplete source reports',()=>{
  assert.equal(verifyDelawareFirstPublication({report:{state:'DE',status:'not_promoted'},partition:{state:'DE',count:0,drops:[]},workflowRunId:'123'}).ok,false);
  assert.equal(verifyDelawareFirstPublication({report:{state:'DE',status:'useful',stale:false,metadata:{allDeliveryDisabled:true,requestCount:6,cityhive:{complete:true,cacheReused:true},ecwid:{complete:false}}},partition:{state:'DE',count:0,drops:[]},workflowRunId:'123'}).ok,false);
});

test('Delaware Kreston query plan retains the fixed priority and advances one allocated library term per run',async t=>{
  const cursorDir=await mkdtemp(path.join(tmpdir(),'de-query-rotation-'));t.after(()=>rm(cursorDir,{recursive:true,force:true}));
  const bible={records:['Eagle Rare 10 Year','Old Forester 1924','Weller Antique 107'].map((canonical,index)=>({canonical,libraryIdentities:[{
    id:`target-${index}`,canonicalName:canonical,nationalTier:'allocated',stateOverrides:[],isAlertEligible:true,
  }]}))};
  const options={sourceKey:'DE:kreston-wilmington',budget:2,priorityTerms:['barrel proof'],cursorDir};
  const first=await librarySourceSearchTerms(bible,options),second=await librarySourceSearchTerms(bible,options);
  assert.equal(first[0],'barrel proof');assert.equal(second[0],'barrel proof');
  assert.notEqual(first[1],second[1]);assert.ok(first[1]);assert.ok(second[1]);
});
