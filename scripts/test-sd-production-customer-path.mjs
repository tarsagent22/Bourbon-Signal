import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sources,storeId,fullAddress,southDakotaRetailerRequest} from '../engine/src/south-dakota-pickup-policy.mjs';
import {isSouthDakotaProductionOnSiteSignal,productionCohortSha256,southDakotaProductionRuntimeId} from '../engine/src/south-dakota-pickup-policy.mjs';
import * as evidenceModule from '../src/lib/public-drop-evidence.ts';
import * as contractModule from '../src/lib/site-engine-contract.ts';
import * as classificationModule from '../src/lib/drop-classification.ts';
const {derivePublicDropEvidence,isPublicDropFeedEligible,normalizePublicDropEvidenceInput}=evidenceModule.default||evidenceModule;
const {normalizeDropForSite}=contractModule.default||contractModule;
const {classifyPublicDrop,getDropClassificationIndex}=classificationModule.default||classificationModule;

const nowMs=Date.now(),observedAt=new Date(nowMs-1000).toISOString();
const identities=[
  {store:sources[0],query:'Wild Turkey',product:sources[0].products[0],canonicalId:'bb_4b57850b8b8f77fd'},
  {store:sources[1],query:'Heaven Hill',product:sources[1].products[0],canonicalId:'bb_ef203a18f5f98f23'},
  {store:sources[1],query:'Larceny',product:sources[1].products[1],canonicalId:'larceny-barrel-proof'},
];
const rows=identities.map(({store,query,product:[productId,upc,rawName,canonicalName],canonicalId})=>({
  id:`fixture:${store.id}:${productId}`,state:'SD',city:'Rapid City',postalCode:store.zip,zip:store.zip,
  storeId:storeId(store),storeName:store.name,storeAddress:fullAddress(store),locationPrecision:'store_level',
  type:'retailer_store_inventory_result',eventType:'retailer_store_inventory_result',sourceLabel:`${store.name} first-party pickup inventory`,
  source:`${store.name} first-party pickup inventory`,sourceUrl:southDakotaRetailerRequest(query),sourceRuntimeId:southDakotaProductionRuntimeId,
  productId,rawName,canonicalName,canonicalBottleId:canonicalId,tier:'limited',observedAt,firstSeenAt:observedAt,lastConfirmedAt:observedAt,
  quantity:0,storeQty:0,quantityIsExact:false,quantitySemantics:'binary_retailer_orderable_no_exact_count',
  sourceAvailabilityVerified:true,availabilityStatus:'in_stock',pickupOfferVerified:true,premisesVerified:true,
  canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,eligibleForOnSite:true,eligibleForDropFeed:true,
  eligibleForWatch:false,eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false,
  sourceStale:false,stale:false,quarantined:false,previewOnly:false,
  sourceProductBinding:{source:'mr-liquor-sante',storeId:storeId(store),storeAddress:fullAddress(store),productId,upc,
    canonicalBottleId:canonicalId,observedAt,premiseVerified:true,pickupOfferVerified:true,availableToOrder:1,
    quantitySemantics:'binary_retailer_orderable_no_exact_count',shadowOnly:false,productionOnSiteOnly:true,
    productionCohortSha256},
  raw:{productionOnSiteOnly:true},
}));
assert.ok(rows.every(row=>isSouthDakotaProductionOnSiteSignal(row,{nowMs})));
const classification=JSON.parse(await readFile('src/data/drop-feed-classification.generated.json','utf8'));
const index=getDropClassificationIndex(classification.records);
const projected=rows.map(row=>normalizePublicDropEvidenceInput(classifyPublicDrop(normalizeDropForSite(row),index)));
assert.ok(projected.every(row=>row.quantity===0&&row.quantityIsExact===false),'site normalization must preserve binary zero');
assert.ok(projected.every(row=>isPublicDropFeedEligible(row,{asOf:nowMs})),'classified server output must remain customer eligible');
const coverage=derivePublicDropEvidence(projected,nowMs).get('SD');
assert.equal(coverage.currentInventoryStores.length,2);
assert.equal(coverage.currentInventoryCities,1);
assert.equal(coverage.alertableInventoryStores.length,0);
assert.equal(coverage.freshPublicSignalCount,3);
assert.deepEqual(new Set(coverage.currentInventoryStores.map(row=>row.address)),new Set(rows.map(row=>row.storeAddress)));
assert.ok(projected.every(row=>row.canAlertAsInventory===false&&row.canAlertAsWatch===false
  &&row.eligibleForDelivery===false&&row.eligibleForEmail===false&&row.eligibleForSms===false));
console.log(JSON.stringify({state:'SD',path:'normalizeDropForSite -> classifyPublicDrop -> derivePublicDropEvidence',
  rows:projected.length,currentStores:coverage.currentInventoryStores.length,cities:coverage.currentInventoryCities,
  alertableStores:coverage.alertableInventoryStores.length,allDeliveryDisabled:true}));
