// Pure source identity only: no collector, filesystem, discovery or lifecycle imports.
import {MN_MO_COHORTS,mnMoSourcesForState,mnMoResearchRuntimeId} from './collectors/mn-mo-cityhive-premises.mjs';
export function isMnMoCityHiveInventory(row,{nowMs=Date.now()}={}){
 const p=row?.sourceProductBinding,source=mnMoSourcesForState(row?.state,p?.profile).find(s=>s.storeId===row?.storeId);if(!source||!p)return false;
 let url;try{url=new URL(row.sourceUrl);}catch{return false;}const parts=url.pathname.split('/').filter(Boolean),query=[...url.searchParams],optionId=row.optionId||row.variantId,age=nowMs-Date.parse(row.observedAt||'');
 const identity=p.identityName===row.rawName||(row.productId==='5e21e94d0320ad0f80403af4'&&row.rawName==='Larceny Barrel Proof Brourbon'&&p.identityName==='Larceny Barrel Proof');
 return row.stateCode===source.state&&row.sourceChain===source.chainId&&row.sourceLabel===source.sourceLabel
  &&row.merchantId===source.merchantId&&row.storeName===source.name&&row.storeAddress===source.address&&row.city===source.city&&(row.zip||row.postalCode)===source.zip
  &&row.lat===source.lat&&row.lng===source.lng&&row.locationPrecision==='store_level'
  &&['retailer_store_inventory_result','cityhive_store_inventory_result'].includes(row.eventType||row.type)
  &&url.origin===source.baseUrl&&!url.username&&!url.password&&!url.hash&&parts.length===4&&parts[0]==='shop'&&parts[1]==='product'&&parts[3]===row.productId&&/^[a-z0-9][a-z0-9-]*$/i.test(parts[2])
  &&Boolean(row.productId&&optionId)&&row.variantId===optionId&&query.length===1&&query[0][0]==='option-id'&&query[0][1]===optionId
  &&p.schemaVersion===1&&p.source==='mn-mo-native-cityhive'&&p.collectorVersion==='mn-mo-native-cityhive-v1'&&p.cohortSha256===MN_MO_COHORTS[p.profile]?.[source.state]
  &&p.merchantId===source.merchantId&&p.storeId===source.storeId&&p.storeAddress===source.address&&p.productId===row.productId&&p.optionId===optionId
  &&p.rawName===row.rawName&&identity&&Boolean(row.canonicalBottleId&&row.canonicalName)&&p.canonicalBottleId===row.canonicalBottleId&&p.canonicalName===row.canonicalName
  &&p.price===row.price&&typeof row.price==='number'&&Number.isFinite(row.price)&&row.price>0&&p.observedAt===row.observedAt
  &&p.premisesVerified===true&&p.pickupOfferVerified===true&&p.coordinatesVerified===true&&p.latitude===source.lat&&p.longitude===source.lng
  &&row.sourceAvailabilityVerified===true&&row.availabilityStatus==='in_stock'&&row.quantity===0&&row.quantityIsExact===false
  &&row.quantitySemantics==='binary_retailer_orderable_no_exact_count'&&p.quantitySemantics===row.quantitySemantics&&Number.isInteger(p.reportedQuantity)&&p.reportedQuantity>0
  &&row.raw?.reportedQuantity===p.reportedQuantity&&row.raw?.chain===source.chainId
  &&row.stale!==true&&row.sourceStale!==true&&row.quarantined!==true&&row.raw?.sourceRuntimeNonAlertable!==true&&row.raw?.staleFallback!==true
  &&Number.isFinite(age)&&age>=0&&age<=2*60*60_000;
}
export function isMnMoCityHiveResearchInventory(row,options){
 const p=row?.sourceProductBinding,source=mnMoSourcesForState(row?.state,p?.profile).find(s=>s.storeId===row?.storeId);
 return Boolean(source)&&isMnMoCityHiveInventory(row,options)&&row.sourceRuntimeId===mnMoResearchRuntimeId(source,p.profile)
  &&row.raw?.shadowOnly===true&&p.shadowOnly===true&&!Object.hasOwn(row,'previewOnly')
  &&row.canAlertAsInventory===false&&row.canAlertAsWatch===false&&row.can_alert_as_inventory===false&&row.can_alert_as_watch===false&&row.alertable===false
  &&row.eligibleForOnSite===false&&row.eligibleForDropFeed===false&&row.eligibleForWatch===false
  &&row.eligibleForDelivery===false&&row.deliveryEligible===false&&row.eligibleForEmail===false&&row.eligibleForSms===false;
}
export const isMnMoCityHiveRetailerEvent=row=>['MN','MO'].includes(row?.state)&&['retailer_store_inventory_result','cityhive_store_inventory_result'].includes(row?.eventType||row?.type);
export function isMnMoCityHiveCanaryOnSiteSignal(row,options){
 const p=row?.sourceProductBinding,source=mnMoSourcesForState(row?.state,p?.profile).find(s=>s.storeId===row?.storeId);
 return Boolean(source)&&isMnMoCityHiveInventory(row,options)&&row.previewOnly===true&&row.researchOnly!==true&&row.customerVisible!==false
  &&row.sourceRuntimeId===mnMoResearchRuntimeId(source,p.profile)&&p.shadowOnly===false&&row.raw?.shadowOnly===false
  &&row.raw?.cacheFallback!==true&&p.productionOnSiteOnly!==true&&!p.productionCohortSha256
  &&row.inventorySemantics==='binary_retailer_orderable_no_exact_count'
  &&row.canAlertAsInventory===false&&row.canAlertAsWatch===false&&row.can_alert_as_inventory===false&&row.can_alert_as_watch===false&&row.alertable===false
  &&row.eligibleForOnSite===true&&row.eligibleForDropFeed===true&&row.eligibleForWatch===false
  &&row.eligibleForDelivery===false&&row.deliveryEligible===false&&row.eligibleForEmail===false&&row.eligibleForSms===false;
}
