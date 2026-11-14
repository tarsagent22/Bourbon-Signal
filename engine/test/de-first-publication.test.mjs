import test from 'node:test';
import assert from 'node:assert/strict';
import {CENTRAL_CITYHIVE_PRODUCTION_SOURCES} from '../src/collectors/central-cityhive-premises.mjs';
import {centralCityHiveProductionCohortKey} from '../src/central-cityhive-production-config.mjs';
import {verifyDelawareFirstPublication} from '../src/verify-de-first-publication.mjs';
import sourceData from '../data/de-ecwid-research-source.json' with {type:'json'};

function fixture(nowMs=Date.now()){
  const at=new Date(nowMs-60_000).toISOString(),start=new Date(nowMs-90_000).toISOString(),finish=new Date(nowMs-10_000).toISOString();
  const cohort=centralCityHiveProductionCohortKey('DE'),citySources=CENTRAL_CITYHIVE_PRODUCTION_SOURCES.filter(source=>source.state==='DE');
  const cityhive={complete:true,cacheReused:false,cohortKey:cohort,productionAlertDeliveryAllowed:false,
    selectedStores:citySources.map(source=>source.storeId),verifiedPremises:citySources.map(source=>source.storeId),sourceObservedAt:at,
    requests:citySources.flatMap(source=>[source.prioritySearchTerm||'barrel proof','eagle rare'].map(term=>({
      sourceId:source.id,url:`${source.baseUrl}/shop/?merchant-id=${source.merchantId}&ch-query=${encodeURIComponent(term)}`,ok:true,status:200,
    })))};
  const ecwid={complete:true,cacheReused:false,shadowOnly:true,customerDeliveryAllowed:false,selectedStores:['ecwid:de:130511528'],sourceObservedAt:at,
    requests:[sourceData.source.homeUrl,sourceData.product.url].map(url=>({url,ok:true,status:200,observedAt:at}))};
  const row={state:'DE',stateCode:'DE',type:'retailer_store_inventory_result',sourceRuntimeId:'de:ecwid-pickup',sourceUrl:sourceData.product.url,
    productId:sourceData.product.productId,storeId:'ecwid:de:130511528',storeAddress:sourceData.source.premise.address,city:'Millville',
    locationPrecision:'store_level',storeName:sourceData.source.retailer,sourceLabel:'Banks Wines & Spirits Millville first-party pickup',
    rawName:sourceData.product.title,canonicalBottleId:sourceData.product.canonicalId,canonicalName:sourceData.product.canonicalName,tier:'allocated',
    observedAt:at,availabilityStatus:'in_stock',sourceAvailabilityVerified:true,price:89,quantity:0,quantityIsExact:false,
    quantitySemantics:'binary_retailer_orderable_no_exact_count',eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,
    canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false,
    raw:{productionOnSiteOnly:true},sourceProductBinding:{schemaVersion:1,source:'ecwid-first-party-pickup',merchantId:'130511528',storeId:'ecwid:de:130511528',
      storeAddress:sourceData.source.premise.address,productId:sourceData.product.productId,sku:sourceData.product.sku,rawName:sourceData.product.title,
      canonicalId:sourceData.product.canonicalId,canonicalName:sourceData.product.canonicalName,observedAt:at,price:89,premisesVerified:true,
      pickupOfferVerified:true,quantitySemantics:'binary_retailer_orderable_no_exact_count',reportedQuantity:22,productionOnSiteOnly:true,
      productionCohortSha256:cohort}};
  const report={state:'DE',status:'useful',stale:false,startedAt:start,finishedAt:finish,lastGoodAt:at,signals:[row],metadata:{allDeliveryDisabled:true,requestCount:6,cityhive,ecwid}};
  const partition={state:'DE',count:1,drops:[row]};
  const locations={locations:[...citySources.map(source=>({state:'DE',id:source.storeId,address:source.address,city:source.city})),
    {state:'DE',id:'ecwid:de:130511528',address:sourceData.source.premise.address,city:'Millville'}]};
  return{nowMs,report,partition,locations};
}

test('Delaware first-publication contract accepts a current exact silent allocated row with the complete closed cohort',()=>{
  const input=fixture(),checked=verifyDelawareFirstPublication({...input,workflowRunId:'123456'});
  assert.equal(checked.ok,true,checked.failures.join('; '));
  assert.equal(checked.receipt.successfulRequests,6);
  assert.deepEqual(checked.receipt.selectedPremises,input.locations.locations.map(row=>row.id));
  assert.equal(checked.receipt.publishedRows,1);
  assert.equal(checked.receipt.publishedStores,1);
  assert.equal(checked.receipt.allocatedRows,1);
  assert.equal(checked.receipt.allDeliveryChannelsDisabled,true);
});

test('Delaware first-publication contract permits rotated second terms but rejects incomplete or unsafe cohorts',()=>{
  const input=fixture(),valid=verifyDelawareFirstPublication({...input,workflowRunId:'123456'});
  assert.equal(valid.ok,true,valid.failures.join('; '));
  const rotated=structuredClone(input);
  for(const source of rotated.report.metadata.cityhive.requests.filter(row=>!new URL(row.url).searchParams.get('ch-query').includes('barrel proof'))){
    const url=new URL(source.url);url.searchParams.set('ch-query','allocated bourbon');source.url=url.toString();
  }
  assert.equal(verifyDelawareFirstPublication({...rotated,workflowRunId:'123456'}).ok,true);
  const denied=structuredClone(input);denied.report.metadata.ecwid.requests[1].status=403;denied.report.metadata.ecwid.requests[1].ok=false;
  assert.equal(verifyDelawareFirstPublication({...denied,workflowRunId:'123456'}).ok,false);
  const noAllocated=structuredClone(input);noAllocated.partition.drops[0].tier='standard';noAllocated.report.signals[0].tier='standard';
  assert.equal(verifyDelawareFirstPublication({...noAllocated,workflowRunId:'123456'}).ok,false);
  const missingPremise=structuredClone(input);missingPremise.locations.locations.pop();
  assert.equal(verifyDelawareFirstPublication({...missingPremise,workflowRunId:'123456'}).ok,false);
  const shadow=structuredClone(input);shadow.report.signals[0].previewOnly=true;shadow.partition.drops[0].previewOnly=true;
  assert.equal(verifyDelawareFirstPublication({...shadow,workflowRunId:'123456'}).ok,false);
});
