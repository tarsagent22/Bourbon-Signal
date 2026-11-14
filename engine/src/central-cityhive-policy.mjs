import { CENTRAL_CITYHIVE_EXPANSION_SOURCES,CENTRAL_CITYHIVE_PRODUCTION_COHORTS } from './collectors/central-cityhive-premises.mjs';
import { CENTRAL_CITYHIVE_RESEARCH_SOURCES } from './collectors/central-cityhive-research-premises.mjs';

export const CENTRAL_CITYHIVE_STATE_IDS = new Set(CENTRAL_CITYHIVE_EXPANSION_SOURCES.map(source=>source.state));
const ALL_RECOGNIZED_SOURCES=Object.freeze([...CENTRAL_CITYHIVE_EXPANSION_SOURCES,...CENTRAL_CITYHIVE_RESEARCH_SOURCES]);
export function isCentralCityHiveRetailerEvent(row){
  return (CENTRAL_CITYHIVE_STATE_IDS.has(row?.state)
    || (row?.sourceProductBinding?.source === 'central-cityhive' && Boolean(centralCityHiveSourceForSignal(row))))
    && /^(retailer_store_inventory_result|cityhive_store_inventory_result)$/i.test(row?.eventType || row?.type || '');
}
export function centralCityHiveSourceForSignal(row){
  return ALL_RECOGNIZED_SOURCES.find(source=>source.state===row?.state&&source.storeId===row?.storeId&&source.merchantId===row?.merchantId&&(source.chainId||source.id)===(row?.sourceChain||row?.raw?.chain))||null;
}
export function isCentralCityHiveSignalIdentity(row){
  const source=centralCityHiveSourceForSignal(row),proof=row?.sourceProductBinding;
  if(!source||!isCentralCityHiveRetailerEvent(row)||row.stateCode&&row.stateCode!==source.state)return false;
  const productId=String(row.productId||''),optionId=String(row.optionId||row.variantId||'');
  let url;try{url=new URL(row.sourceUrl);}catch{return false;}
  const parts=url.pathname.split('/').filter(Boolean),query=[...url.searchParams];
  return row.sourceLabel===source.sourceLabel&&(!row.source||row.source===source.sourceLabel)&&row.merchantId===source.merchantId
    &&row.storeId===source.storeId&&row.storeAddress===source.address&&row.storeName===source.name
    &&row.city===source.city&&(row.zip||row.postalCode)===source.zip&&row.locationPrecision==='store_level'
    &&url.origin===source.baseUrl&&!url.username&&!url.password&&!url.hash
    &&parts.length===4&&parts[0]==='shop'&&parts[1]==='product'&&parts[3]===productId
    &&/^[a-z0-9][a-z0-9-]*$/i.test(parts[2])&&query.length===1&&query[0][0]==='option-id'&&query[0][1]===optionId
    &&Boolean(productId)&&Boolean(optionId)&&proof?.schemaVersion===1&&proof.source==='central-cityhive'
    &&proof.merchantId===source.merchantId&&proof.storeId===source.storeId&&proof.storeAddress===source.address
    &&proof.productId===productId&&proof.optionId===optionId&&proof.rawName===row.rawName
    &&proof.canonicalBottleId===row.canonicalBottleId&&proof.canonicalName===row.canonicalName
    &&proof.price===row.price&&proof.observedAt===row.observedAt
    &&(row.raw?.chain==null||row.raw.chain===(source.chainId||source.id))&&(row.raw?.merchantId==null||row.raw.merchantId===source.merchantId)
    &&(row.raw?.productId==null||row.raw.productId===productId)&&(row.raw?.optionId==null||row.raw.optionId===optionId);
}
export function isCentralCityHiveInventory(row,{nowMs=Date.now()}={}){
  if(!isCentralCityHiveSignalIdentity(row))return false;
  const observedMs=Date.parse(row.observedAt||''),age=nowMs-observedMs,proof=row.sourceProductBinding;
  return Boolean(row.canonicalBottleId&&row.canonicalName&&row.rawName)
    &&Number.isFinite(observedMs)&&age>=0&&age<=4*60*60_000
    &&row.stale!==true&&row.sourceStale!==true&&row.raw?.staleFallback!==true&&row.raw?.sourceRuntimeNonAlertable!==true
    &&row.sourceAvailabilityVerified===true&&row.availabilityStatus==='in_stock'
    &&proof.premisesVerified===true&&proof.pickupOfferVerified===true
    &&row.quantity===0&&row.quantityIsExact===false
    &&row.quantitySemantics==='binary_retailer_orderable_no_exact_count'
    &&proof.quantitySemantics==='binary_retailer_orderable_no_exact_count'
    &&Number.isFinite(Number(proof.reportedQuantity))&&Number(proof.reportedQuantity)>0
    &&(row.raw?.reportedQuantity==null||Number(row.raw.reportedQuantity)===Number(proof.reportedQuantity))
    &&typeof row.price==='number'&&Number.isFinite(row.price)&&row.price>0;
}

// Isolated canary visibility never grants alert or delivery eligibility.
export function isCentralCityHiveCanaryOnSiteSignal(row,{nowMs=Date.now()}={}){
  const age=nowMs-Date.parse(row?.observedAt||'');
  return isCentralCityHiveInventory(row,{nowMs})&&age<=2*60*60_000&&row.previewOnly===true
    &&row.sourceProductBinding?.productionOnSiteOnly!==true&&!row.sourceProductBinding?.productionCohortSha256
    &&row.eligibleForOnSite===true&&row.eligibleForDropFeed===true&&row.eligibleForWatch===false
    &&row.canAlertAsInventory===false&&row.can_alert_as_inventory!==true
    &&row.canAlertAsWatch===false&&row.can_alert_as_watch!==true&&row.alertable!==true
    &&row.eligibleForDelivery===false&&row.deliveryEligible!==true
    &&row.eligibleForEmail===false&&row.eligibleForSms===false;
}

export function isCentralCityHiveProductionOnSiteSignal(row,{nowMs=Date.now()}={}){
  const source=centralCityHiveSourceForSignal(row),proof=row?.sourceProductBinding;
  return Boolean(source)&&isCentralCityHiveInventory(row,{nowMs})&&nowMs-Date.parse(row.observedAt)<=2*60*60_000
    &&!Object.hasOwn(row,'previewOnly')&&row.quarantined!==true&&row.raw?.cacheFallback!==true
    &&row.raw?.shadowOnly!==true&&proof?.shadowOnly!==true
    &&row.sourceRuntimeId===`${source.state.toLowerCase()}:central-cityhive`
    &&proof.productionOnSiteOnly===true&&proof.productionCohortSha256===CENTRAL_CITYHIVE_PRODUCTION_COHORTS[source.state]
    &&row.canAlertAsInventory===false&&row.can_alert_as_inventory!==true&&row.canAlertAsWatch===false&&row.can_alert_as_watch!==true
    &&row.alertable!==true&&row.eligibleForOnSite===true&&row.eligibleForDropFeed===true&&row.eligibleForWatch===false
    &&row.eligibleForDelivery===false&&row.deliveryEligible!==true&&row.eligibleForEmail===false&&row.eligibleForSms===false;
}
export function isPearsonsDcProductionOnSiteSignal(row,{nowMs=Date.now()}={}){
  const binding=row?.sourceProductBinding,observed=Date.parse(row?.observedAt||''),age=nowMs-observed;
  return Boolean(binding)&&row?.state==='DC'&&row?.stateCode==='DC'&&row?.eventType==='retailer_store_inventory_result'
    &&row?.sourceRuntimeId==='dc:pearsons-shopify'&&row?.storeId==='pearsonswine.com:#store'
    &&row?.storeName==="Pearson's Wine & Spirits"&&row?.storeAddress==='2436 Wisconsin Avenue NW, Washington, DC 20007'
    &&row?.merchantId==='https://pearsonswine.com/#store'
    &&row?.productId==='https://pearsonswine.com/products/blantons-single-barrel-bourbon-750ml#product'
    &&row?.sourceUrl==='https://pearsonswine.com/products/blantons-single-barrel-bourbon-750ml'
    &&row?.city==='Washington'&&row?.zip==='20007'&&row?.locationPrecision==='store_level'
    &&row?.variantId==='45949567795418'&&row?.rawName==="Blanton's Single Barrel Bourbon"
    &&row?.canonicalName==="Blanton's Original Single Barrel"&&row?.tier==='allocated'&&row?.price===99.99
    &&row?.availabilityStatus==='in_stock'&&row?.sourceAvailabilityVerified===true&&row?.pickupOfferVerified===true
    &&row?.quantity==null&&row?.quantityIsExact===false&&row?.quantitySemantics==='no_exact_shelf_count'
    &&row?.inventorySemantics==='Orderable first-party pickup offer at the exact reviewed store; no exact shelf quantity is published.'
    &&binding.source==='pearsons-shopify-retained-page'&&/^[a-f0-9]{64}$/u.test(binding.sourcePageSha256||'')
    &&binding.storeGraphId===row.merchantId&&binding.storeAddress===row.storeAddress
    &&binding.productGraphId===row.productId&&binding.variantId===row.variantId&&binding.sku==='00963'
    &&binding.capturedAt===row.observedAt&&binding.httpStatus===200&&binding.productionOnSiteOnly===true
    &&binding.productionCohortSha256===CENTRAL_CITYHIVE_PRODUCTION_COHORTS.DC
    &&!Object.hasOwn(row,'previewOnly')&&row.researchOnly!==true&&row.stale!==true&&row.sourceStale!==true
    &&row.raw?.shadowOnly!==true&&binding.shadowOnly!==true
    &&row.canAlertAsInventory===false&&row.canAlertAsWatch===false&&row.alertable!==true
    &&row.eligibleForOnSite===true&&row.eligibleForDropFeed===true&&row.eligibleForWatch===false
    &&row.eligibleForDelivery===false&&row.deliveryEligible!==true&&row.eligibleForEmail===false&&row.eligibleForSms===false
    &&Number.isFinite(observed)&&age>=0&&age<=2*60*60_000;
}
export const isCentralCityHiveOnSiteSignal=(row,options)=>isCentralCityHiveCanaryOnSiteSignal(row,options)||isCentralCityHiveProductionOnSiteSignal(row,options);

// Source readiness is independent of notification eligibility. This proof may
// count only in isolated shadow evidence and never grants public visibility.
export function isCentralCityHiveResearchInventory(row,options){
  const source=centralCityHiveSourceForSignal(row);
  return Boolean(source)&&isCentralCityHiveInventory(row,options)&&row.sourceRuntimeId===`research:${source.state.toLowerCase()}:${source.id}`
    &&row.raw?.shadowOnly===true&&row.sourceProductBinding?.shadowOnly===true
    &&row.canAlertAsInventory===false&&row.canAlertAsWatch===false&&row.alertable===false
    &&row.eligibleForOnSite===false&&row.eligibleForDropFeed===false&&row.eligibleForWatch===false
    &&row.eligibleForDelivery===false&&row.eligibleForEmail===false&&row.eligibleForSms===false;
}
