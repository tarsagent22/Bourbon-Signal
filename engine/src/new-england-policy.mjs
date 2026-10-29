import {NEW_ENGLAND_RESEARCH_SOURCES,NEW_ENGLAND_PRODUCTION_COHORTS} from './collectors/new-england-premises.mjs';
export const isNewEnglandRetailerEvent=row=>['MA','CT','RI'].includes(row?.state)&&/^(retailer_store_inventory_result|cityhive_store_inventory_result)$/i.test(row.eventType||row.type||'');
export function isNewEnglandInventory(row,{nowMs=Date.now()}={}){
  const source=NEW_ENGLAND_RESEARCH_SOURCES.find(source=>source.state===row?.state&&source.storeId===row?.storeId),p=row?.sourceProductBinding;
  if(!source||!p||!isNewEnglandRetailerEvent(row))return false;
  let url;try{url=new URL(row.sourceUrl);}catch{return false;}
  const parts=url.pathname.split('/').filter(Boolean),query=[...url.searchParams],age=nowMs-Date.parse(row.observedAt||'');
  const reviewedIdentity=p.identityName===row.rawName||(row.productId==='5e21e94d0320ad0f80403af4'&&row.rawName==='Larceny Barrel Proof Brourbon'&&p.identityName==='Larceny Barrel Proof');
  return row.stateCode===source.state&&row.sourceChain===source.chainId&&row.merchantId===source.merchantId
    &&row.sourceLabel===source.sourceLabel&&(!row.source||row.source===source.sourceLabel)&&row.storeName===source.name&&row.storeAddress===source.address
    &&row.city===source.city&&(row.zip||row.postalCode)===source.zip&&row.locationPrecision==='store_level'
    &&url.origin===source.baseUrl&&!url.username&&!url.password&&!url.hash
    &&parts.length===4&&parts[0]==='shop'&&parts[1]==='product'&&/^[a-z0-9][a-z0-9-]*$/i.test(parts[2])&&parts[3]===row.productId
    &&query.length===1&&query[0][0]==='option-id'&&query[0][1]===(row.optionId||row.variantId)
    &&p.schemaVersion===1&&p.source==='new-england-research-cityhive'&&p.collectorVersion==='new-england-cityhive-v1-strict-options'
    &&p.storeId===source.storeId&&p.storeAddress===source.address&&p.merchantId===source.merchantId
    &&p.productId===row.productId&&p.optionId===(row.optionId||row.variantId)&&p.rawName===row.rawName&&reviewedIdentity
    &&Boolean(row.canonicalBottleId&&row.canonicalName)&&p.canonicalBottleId===row.canonicalBottleId&&p.canonicalName===row.canonicalName
    &&p.price===row.price&&typeof row.price==='number'&&Number.isFinite(row.price)&&row.price>0&&p.observedAt===row.observedAt
    &&p.premisesVerified===true&&p.pickupOfferVerified===true&&p.optionPickupRestrictionVerified===true&&p.preorderExcluded===true
    &&p.coordinatesVerified===true&&p.latitude===source.lat&&p.longitude===source.lng&&row.lat===source.lat&&row.lng===source.lng
    &&row.quantity===0&&row.quantityIsExact===false&&row.quantitySemantics==='binary_retailer_orderable_no_exact_count'
    &&p.quantitySemantics===row.quantitySemantics&&Number.isInteger(p.reportedQuantity)&&p.reportedQuantity>0
    &&(row.raw?.reportedQuantity==null||row.raw.reportedQuantity===p.reportedQuantity)
    &&row.availabilityStatus==='in_stock'&&row.sourceAvailabilityVerified===true&&row.stale!==true&&row.sourceStale!==true
    &&row.raw?.staleFallback!==true&&row.raw?.sourceRuntimeNonAlertable!==true&&Number.isFinite(age)&&age>=0&&age<=2*60*60_000;
}
const channelsDisabled=row=>row.canAlertAsInventory===false&&row.can_alert_as_inventory!==true&&row.canAlertAsWatch===false
  &&row.can_alert_as_watch!==true&&row.alertable!==true&&row.eligibleForWatch===false&&row.eligibleForDelivery===false
  &&row.deliveryEligible!==true&&row.eligibleForEmail===false&&row.eligibleForSms===false;
export function isNewEnglandProductionOnSiteSignal(row,options={}){
  return isNewEnglandInventory(row,options)&&channelsDisabled(row)&&!Object.hasOwn(row,'previewOnly')&&row.quarantined!==true
    &&row.raw?.shadowOnly!==true&&row.raw?.cacheFallback!==true&&row.sourceProductBinding.shadowOnly!==true
    &&row.sourceRuntimeId===`${row.state.toLowerCase()}:new-england-cityhive`
    &&row.sourceProductBinding.productionOnSiteOnly===true&&row.sourceProductBinding.productionCohortSha256===NEW_ENGLAND_PRODUCTION_COHORTS[row.state]
    &&row.eligibleForOnSite===true&&row.eligibleForDropFeed===true;
}
export function isNewEnglandCanaryOnSiteSignal(row,options={}){
  return isNewEnglandInventory(row,options)&&channelsDisabled(row)&&row.previewOnly===true&&row.quarantined!==true
    &&row.raw?.shadowOnly!==true&&row.sourceProductBinding.shadowOnly!==true
    &&row.sourceProductBinding.productionOnSiteOnly!==true&&!row.sourceProductBinding.productionCohortSha256
    &&row.eligibleForOnSite===true&&row.eligibleForDropFeed===true;
}
export const isNewEnglandOnSiteSignal=(row,options)=>isNewEnglandProductionOnSiteSignal(row,options)||isNewEnglandCanaryOnSiteSignal(row,options);
