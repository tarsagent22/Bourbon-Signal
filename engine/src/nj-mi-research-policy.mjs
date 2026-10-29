import {NJ_MI_CITYHIVE_PREMISES,NJ_MI_CANDIDATE_STORE_IDS} from './collectors/nj-mi-research-premises.mjs';

// Exactly the five premises with positive current first-party rows in immutable
// hosted run40895908381. Other reviewed candidates receive no customer admission.
export const NJ_MI_POSITIVE_RESEARCH_PREMISES=new Set(NJ_MI_CANDIDATE_STORE_IDS);
export function isNjMiResearchInventory(row,{nowMs=Date.now()}={}){
  const source=NJ_MI_CITYHIVE_PREMISES.find(source=>source.storeId===row?.storeId&&source.state===row?.state);
  const p=row?.sourceProductBinding,age=nowMs-Date.parse(row?.observedAt||'');
  if(!source||!NJ_MI_POSITIVE_RESEARCH_PREMISES.has(source.storeId)||!p)return false;
  let url;try{url=new URL(row.sourceUrl);}catch{return false;}
  const parts=url.pathname.split('/').filter(Boolean),query=[...url.searchParams];
  return row.stateCode===source.state&&row.sourceChain===source.chainId&&row.merchantId===source.merchantId
    &&row.sourceLabel===source.sourceLabel&&row.storeName===source.name&&row.storeAddress===source.address
    &&row.city===source.city&&(row.zip||row.postalCode)===source.zip&&row.locationPrecision==='store_level'
    &&['retailer_store_inventory_result','cityhive_store_inventory_result'].includes(row.eventType||row.type)
    &&url.origin===source.baseUrl&&!url.username&&!url.password&&!url.hash
    &&parts.length===4&&parts[0]==='shop'&&parts[1]==='product'&&parts[3]===row.productId
    &&query.length===1&&query[0][0]==='option-id'&&query[0][1]===(row.optionId||row.variantId)
    &&p.schemaVersion===1&&p.source==='central-cityhive'&&p.storeId===source.storeId&&p.storeAddress===source.address
    &&p.merchantId===source.merchantId&&p.productId===row.productId&&p.optionId===(row.optionId||row.variantId)
    &&p.rawName===row.rawName&&p.canonicalBottleId===row.canonicalBottleId&&p.canonicalName===row.canonicalName
    &&p.price===row.price&&typeof row.price==='number'&&row.price>0&&Number.isFinite(row.price)
    &&p.observedAt===row.observedAt&&p.premisesVerified===true&&p.pickupOfferVerified===true
    &&p.coordinatesVerified===true&&p.latitude===source.lat&&p.longitude===source.lng&&row.lat===source.lat&&row.lng===source.lng
    &&row.quantity===0&&row.quantityIsExact===false&&row.quantitySemantics==='binary_retailer_orderable_no_exact_count'
    &&p.quantitySemantics==='binary_retailer_orderable_no_exact_count'&&Number.isFinite(Number(p.reportedQuantity))&&Number(p.reportedQuantity)>0
    &&row.availabilityStatus==='in_stock'&&row.sourceAvailabilityVerified===true
    &&row.stale!==true&&row.sourceStale!==true&&row.raw?.staleFallback!==true&&row.raw?.sourceRuntimeNonAlertable!==true
    &&Number.isFinite(age)&&age>=0&&age<=2*60*60_000;
}

// Prepared for an isolated future preview only. No production caller imports
// this helper; lifecycle and confidence remain inactive until reviewed promotion.
export function isNjMiCanaryOnSiteSignal(row,options={}){
  return isNjMiResearchInventory(row,options)&&row.previewOnly===true&&row.eligibleForOnSite===true
    &&row.eligibleForDropFeed===true&&row.eligibleForWatch===false&&row.canAlertAsInventory===false
    &&row.can_alert_as_inventory!==true&&row.canAlertAsWatch===false&&row.can_alert_as_watch!==true&&row.alertable!==true
    &&row.eligibleForDelivery===false&&row.deliveryEligible!==true&&row.eligibleForEmail===false&&row.eligibleForSms===false;
}
