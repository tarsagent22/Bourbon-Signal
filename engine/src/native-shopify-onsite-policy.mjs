import {NATIVE_PICKUP_PREPARATION_SOURCES} from './native-shopify-preparation-policy.mjs';
export const NATIVE_SHOPIFY_TTL_MS=60*60_000;
export const nativeShopifySource=id=>NATIVE_PICKUP_PREPARATION_SOURCES.find(source=>source.definition.runtimeId===id)||null;
export const isNativeShopifyEvent=row=>Boolean(nativeShopifySource(row?.sourceRuntimeId)||row?.sourceProductBinding?.source==='closed-native-shopify-pickup');
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function isNativeShopifyIdentity(row){
 const source=nativeShopifySource(row?.sourceRuntimeId),def=source?.definition,p=row?.sourceProductBinding;
 const product=def?.products.find(seed=>seed.productId===row?.productId&&seed.variantId===row?.variantId),store=def?.stores.find(store=>store.id===row?.storeId);
 return Boolean(source&&product&&store&&row.state===def.state&&row.stateCode===def.state&&row.sourceChain===def.chain&&row.merchantId===def.merchantId
  &&(row.sourceLabel||row.source)===def.sourceLabel&&(store.county?row.county===store.county:row.county==null)&&row.lat==null&&row.lng==null
  &&row.rawName===product.title&&row.canonicalName===product.canonicalName&&row.canonicalBottleId===product.canonicalBottleId
  &&row.storeName===store.name&&row.storeAddress===store.address&&row.city===store.city&&row.zip===store.zip
  &&row.sourceUrl===def.baseUrl+'/products/'+product.handle&&p?.schemaVersion===1&&p.source==='closed-native-shopify-pickup'
  &&p.sourceId===def.runtimeId&&p.configSha256===source.configSha256&&p.productionOnSiteOnly===true
  &&p.storeId===store.id&&p.storeAddress===store.address&&p.productId===product.productId&&p.variantId===product.variantId
  &&p.canonicalBottleId===product.canonicalBottleId&&p.canonicalName===product.canonicalName&&p.rawName===product.title&&p.sizeMl===product.sizeMl
  &&p.pickupUrl===`${def.baseUrl}/variants/${product.variantId}/?section_id=${def.sectionId}`&&p.price===row.price&&Number.isFinite(row.price)&&row.price>0
  &&p.observedAt===row.observedAt&&Number.isFinite(Date.parse(row.observedAt))&&hash(p.productSha256)&&hash(p.pickupSha256)
  &&p.productHttpStatus===200&&p.pickupHttpStatus===200&&p.premisesVerified===true&&p.pickupOfferVerified===true
  &&row.premisesVerified===true&&row.pickupOfferVerified===true&&row.variantAvailable===true
  &&row.quantityIsExact===false&&(row.quantity==null||row.quantity===0)&&row.inventorySemantics==='binary_retailer_orderable_no_exact_count');
}
export function isNativeShopifyOnSiteSignal(row,{nowMs=Date.now()}={}){
 const age=nowMs-Date.parse(row?.observedAt||'');
 return isNativeShopifyIdentity(row)&&row.availabilityStatus==='in_stock'&&row.sourceAvailabilityVerified===true
  &&(row.eventType||row.type)==='retailer_store_inventory_result'&&row.locationPrecision==='store_level'
  &&row.canAlertAsInventory===false&&row.canAlertAsWatch===false&&row.alertable===false
  &&row.eligibleForOnSite===true&&row.eligibleForDropFeed===true&&row.eligibleForWatch===false
  &&row.eligibleForDelivery===false&&row.eligibleForEmail===false&&row.eligibleForSms===false
  &&row.deliveryEligible!==true&&row.can_alert_as_inventory!==true&&row.can_alert_as_watch!==true
  &&!row.stale&&!row.sourceStale&&!row.source_stale&&!row.quarantined&&!row.previewOnly
  &&!row.raw?.researchOnly&&!row.raw?.shadowOnly&&!row.raw?.staleFallback&&!row.raw?.cacheFallback&&!row.raw?.sourceRuntimeNonAlertable
  &&!row.sourceProductBinding?.researchOnly&&!row.sourceProductBinding?.shadowOnly
  &&Number.isFinite(age)&&age>=0&&age<=NATIVE_SHOPIFY_TTL_MS;
}
