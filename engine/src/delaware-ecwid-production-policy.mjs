import sourceData from '../data/de-ecwid-research-source.json' with {type:'json'};

const merchantId=sourceData.source.merchantId;
const storeId=`ecwid:de:${merchantId}`;
const productId=sourceData.product.productId;
const sku=sourceData.product.sku;
const canonicalId=sourceData.product.canonicalId;
const sourceRuntimeId='de:ecwid-pickup';
const quantitySemantics='binary_retailer_orderable_no_exact_count';

// Production visibility is separate from the still-disabled lifecycle gate.
export function isDelawareEcwidProductionOnSiteSignal(row,{nowMs=Date.now()}={}){
  const binding=row?.sourceProductBinding,age=nowMs-Date.parse(row?.observedAt||'');
  return row?.state==='DE'&&row.stateCode==='DE'
    &&/^(?:retailer_store_inventory_result|cityhive_store_inventory_result)$/.test(row.eventType||row.type||'')
    &&row.previewOnly!==true&&row.sourceRuntimeId===sourceRuntimeId&&row.sourceUrl===sourceData.product.url
    &&String(row.productId)===String(productId)&&row.storeId===storeId&&row.storeAddress===sourceData.source.premise.address
    &&row.city===sourceData.source.premise.city&&row.locationPrecision==='store_level'
    &&row.storeName===sourceData.source.retailer&&row.sourceLabel==='Banks Wines & Spirits Millville first-party pickup'
    &&row.rawName===sourceData.product.title
    &&row.canonicalBottleId===canonicalId&&row.canonicalName===sourceData.product.canonicalName&&row.tier==='allocated'
    &&row.availabilityStatus==='in_stock'&&row.sourceAvailabilityVerified===true
    &&Number.isFinite(row.price)&&row.price>0&&Number(binding?.reportedQuantity)>0
    &&row.quantity===0&&row.quantityIsExact===false&&row.quantitySemantics===quantitySemantics
    &&row.eligibleForOnSite===true&&row.eligibleForDropFeed===true&&row.eligibleForWatch===false
    &&row.canAlertAsInventory===false&&row.canAlertAsWatch===false&&row.alertable!==true
    &&row.eligibleForDelivery===false&&row.eligibleForEmail===false&&row.eligibleForSms===false
    &&row.raw?.shadowOnly!==true&&row.raw?.cacheFallback!==true
    &&Number.isFinite(age)&&age>=0&&age<=2*60*60_000
    &&binding?.schemaVersion===1&&binding.source==='ecwid-first-party-pickup'
    &&binding.merchantId===merchantId&&binding.storeId===storeId&&binding.storeAddress===sourceData.source.premise.address
    &&String(binding.productId)===String(productId)&&binding.sku===sku&&binding.rawName===sourceData.product.title&&binding.canonicalId===canonicalId
    &&binding.canonicalName===row.canonicalName&&binding.observedAt===row.observedAt&&binding.price===row.price
    &&binding.premisesVerified===true&&binding.pickupOfferVerified===true
    &&binding.quantitySemantics===quantitySemantics&&binding.productionOnSiteOnly===true
    &&binding.productionCohortSha256==='2ff60687569747c6aa829f62cc371a894591b1fba53b4ff76e426650eed98e21';
}
