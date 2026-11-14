import test from 'node:test';
import assert from 'node:assert/strict';
import {isDelawareEcwidCanaryPreview} from '../src/delaware-ecwid-canary-preview-policy.mjs';
import sourceData from '../data/de-ecwid-research-source.json' with {type:'json'};

const observedAt='2026-11-14T20:23:14.456Z';
const row={state:'DE',stateCode:'DE',previewOnly:true,type:'retailer_store_inventory_result',
  sourceRuntimeId:'research:de:ecwid:130511528',sourceUrl:sourceData.product.url,productId:sourceData.product.productId,
  canonicalBottleId:sourceData.product.canonicalId,canonicalName:sourceData.product.canonicalName,tier:'allocated',
  storeId:'ecwid:de:130511528',storeAddress:sourceData.source.premise.address,locationPrecision:'store_level',
  observedAt,quantityIsExact:false,quantitySemantics:'binary_retailer_orderable_no_exact_count',
  inventorySemantics:'binary_retailer_orderable_no_exact_count',availabilityStatus:'in_stock',sourceAvailabilityVerified:true,
  eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,canAlertAsInventory:false,canAlertAsWatch:false,
  eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false,
  sourceProductBinding:{schemaVersion:1,source:'ecwid-first-party-pickup',merchantId:'130511528',storeId:'ecwid:de:130511528',
    storeAddress:sourceData.source.premise.address,productId:sourceData.product.productId,sku:sourceData.product.sku,
    canonicalId:sourceData.product.canonicalId,canonicalName:sourceData.product.canonicalName,observedAt,
    premisesVerified:true,pickupOfferVerified:true,quantitySemantics:'binary_retailer_orderable_no_exact_count'}};

test('DE Ecwid preview admits only the exact current Banks allocated pickup row with no alerts',()=>{
  assert.equal(isDelawareEcwidCanaryPreview(row,{nowMs:Date.parse(observedAt)}),true);
  const omittedZero={...row,quantity:undefined};
  assert.equal(isDelawareEcwidCanaryPreview(omittedZero,{nowMs:Date.parse(observedAt)+60_000}),true);
  const old={...row,observedAt:'2026-11-14T18:22:00.000Z',sourceProductBinding:{...row.sourceProductBinding,observedAt:'2026-11-14T18:22:00.000Z'}};
  assert.equal(isDelawareEcwidCanaryPreview(old,{nowMs:Date.parse(observedAt)}),false);
  for(const mutation of [
    {state:'MD'},{previewOnly:false},{storeId:'unreviewed'},{storeAddress:'1 Other Rd, Millville, DE'},
    {sourceUrl:'https://example.invalid/product'},{productId:'unreviewed'},{canonicalBottleId:'unreviewed'},
    {tier:'limited'},{quantity:1},{quantityIsExact:true},{sourceAvailabilityVerified:false},
    {eligibleForDelivery:true},{eligibleForEmail:true},{eligibleForSms:true},{canAlertAsInventory:true},
    {sourceProductBinding:{...row.sourceProductBinding,sku:'wrong'}},
    {sourceProductBinding:{...row.sourceProductBinding,pickupOfferVerified:false}},
  ])assert.equal(isDelawareEcwidCanaryPreview({...row,...mutation},{nowMs:Date.parse(observedAt)}),false,JSON.stringify(mutation));
});
