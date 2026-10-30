import cohort from '../data/research/native-shopify-closed-cohort.json' with {type:'json'};

// Pure closed identity definitions. Importing them confers no polling or public
// authority; the separate native leaf guard stays disabled without3/2 evidence.
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const NATIVE_PICKUP_PREPARATION_SOURCES=freeze(cohort.sources);
export function nativePickupPreparationSource(id){return NATIVE_PICKUP_PREPARATION_SOURCES.find(row=>row.key===id||row.definition.runtimeId===id)||null;}
export function isCapturedNativePickupOnSiteShape(row,{nowMs=Date.now()}={}){
  const source=nativePickupPreparationSource(row?.sourceRuntimeId),definition=source?.definition,p=row?.sourceProductBinding;
  const product=definition?.products.find(seed=>seed.productId===row.productId&&seed.variantId===row.variantId),store=definition?.stores.find(store=>store.id===row.storeId);
  if(!source||!product||!store||p?.schemaVersion!==1||p.source!=='closed_native_shopify_preparation'||p.researchOnly!==true||p.configSha256!==source.configSha256
    ||row.state!==definition.state||row.stateCode!==definition.state||row.sourceChain!==definition.chain||row.merchantId!==definition.merchantId
    ||row.sourceLabel!==definition.sourceLabel||row.storeName!==store.name||row.storeAddress!==store.address||row.city!==store.city||row.zip!==store.zip
    ||row.rawName!==product.title||row.canonicalName!==product.canonicalName||row.canonicalBottleId!==product.canonicalBottleId
    ||row.sourceUrl!==definition.baseUrl+'/products/'+product.handle||p.pickupUrl!==definition.baseUrl+'/variants/'+product.variantId+'/?section_id='+definition.sectionId
    ||p.productId!==row.productId||p.variantId!==row.variantId||p.storeId!==row.storeId||p.canonicalBottleId!==row.canonicalBottleId
    ||p.observedAt!==row.observedAt||p.observedAt!==source.clock||p.price!==row.price||row.price!==source.capturedPrice||!Number.isFinite(row.price)||row.price<=0
    ||p.productSha256!==source.receipts[0].sha256||p.pickupSha256!==source.receipts[1].sha256
    ||(row.quantity!=null&&row.quantity!==0)||row.quantityIsExact!==false||row.inventorySemantics!=='binary_retailer_orderable_no_exact_count'
    ||row.sourceAvailabilityVerified!==true||row.pickupOfferVerified!==true||row.premisesVerified!==true
    ||row.availabilityStatus!=='in_stock'||row.locationPrecision!=='store_level'||row.raw?.researchOnly!==true
    ||row.raw?.sizeMetadataVerified!==true||row.raw?.sizeMl!==product.sizeMl||row.raw?.variant?.available!==true
    ||row.raw?.pickupAddress!==store.address||row.stale===true||row.sourceStale===true||row.quarantined===true
    ||row.canAlertAsInventory!==false||row.canAlertAsWatch!==false||row.alertable!==false||row.eligibleForOnSite!==true||row.eligibleForDropFeed!==true
    ||row.eligibleForWatch!==false||row.eligibleForDelivery!==false||row.eligibleForEmail!==false||row.eligibleForSms!==false)return false;
  const age=nowMs-Date.parse(row.observedAt);return Number.isFinite(age)&&age>=0&&age<=source.ttlMs;
}
