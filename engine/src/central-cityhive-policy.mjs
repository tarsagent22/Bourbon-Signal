import { CENTRAL_CITYHIVE_EXPANSION_SOURCES } from './collectors/central-cityhive-expansion.mjs';

export const CENTRAL_CITYHIVE_STATE_IDS = new Set(CENTRAL_CITYHIVE_EXPANSION_SOURCES.map(source=>source.state));
export function isCentralCityHiveRetailerEvent(row){
  return CENTRAL_CITYHIVE_STATE_IDS.has(row?.state)&&/^(retailer_store_inventory_result|cityhive_store_inventory_result)$/i.test(row?.eventType||row?.type||'');
}
export function centralCityHiveSourceForSignal(row){
  return CENTRAL_CITYHIVE_EXPANSION_SOURCES.find(source=>source.state===row?.state&&source.id===(row?.sourceChain||row?.raw?.chain))||null;
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
    &&(row.raw?.chain==null||row.raw.chain===source.id)&&(row.raw?.merchantId==null||row.raw.merchantId===source.merchantId)
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
