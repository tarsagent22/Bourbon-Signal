import sourceData from '../data/de-ecwid-research-source.json' with {type:'json'};

const merchantId=sourceData.source.merchantId;
const storeId=`ecwid:de:${merchantId}`;
const canonicalId=sourceData.product.canonicalId;
const productId=sourceData.product.productId;
const sku=sourceData.product.sku;
const sourceRuntimeId=`research:de:ecwid:${merchantId}`;
const quantitySemantics='binary_retailer_orderable_no_exact_count';

// Admit this exact product only in a disabled Delaware research preview.
export function isDelawareEcwidCanaryPreview(row,{nowMs=Date.now()}={}){
  const binding=row?.sourceProductBinding,age=nowMs-Date.parse(row?.observedAt||'');
  return row?.state==='DE'&&row.stateCode==='DE'&&row.previewOnly===true
    &&row.type==='retailer_store_inventory_result'&&row.sourceRuntimeId===sourceRuntimeId
    &&row.sourceUrl===sourceData.product.url&&String(row.productId)===String(productId)
    &&row.storeId===storeId&&row.storeAddress===sourceData.source.premise.address
    &&row.locationPrecision==='store_level'&&row.canonicalBottleId===canonicalId
    &&row.canonicalName==='Old Forester Single Barrel Barrel Proof'&&row.tier==='allocated'
    &&(row.quantity===0||row.quantity==null)&&row.quantityIsExact===false&&row.quantitySemantics===quantitySemantics
    &&row.inventorySemantics===quantitySemantics&&row.sourceAvailabilityVerified===true
    &&row.availabilityStatus==='in_stock'&&row.eligibleForOnSite===true&&row.eligibleForDropFeed===true
    &&row.eligibleForWatch===false&&row.canAlertAsInventory===false&&row.canAlertAsWatch===false
    &&row.eligibleForDelivery===false&&row.eligibleForEmail===false&&row.eligibleForSms===false
    &&Number.isFinite(age)&&age>=0&&age<=2*60*60_000
    &&binding?.schemaVersion===1&&binding.source==='ecwid-first-party-pickup'
    &&binding.merchantId===merchantId&&binding.storeId===storeId&&binding.storeAddress===sourceData.source.premise.address
    &&String(binding.productId)===String(productId)&&binding.sku===sku&&binding.canonicalId===canonicalId
    &&binding.canonicalName===row.canonicalName&&binding.observedAt===row.observedAt
    &&binding.premisesVerified===true&&binding.pickupOfferVerified===true
    &&binding.quantitySemantics===quantitySemantics;
}
