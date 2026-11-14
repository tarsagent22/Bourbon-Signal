const SHA256=/^[a-f0-9]{64}$/u;

function exactRow(row,runtimeId,nowMs){
  const b=row?.sourceProductBinding,age=nowMs-Date.parse(row?.observedAt||row?.observed_at||''),
    eventType=row?.eventType||row?.event_type||row?.type,quantity=row?.quantity??row?.storeQty??row?.store_qty,
    semantics=row?.quantitySemantics||row?.inventorySemantics;
  return row?.state==='DC'&&(row?.stateCode||row?.state_code)==='DC'&&eventType==='retailer_store_inventory_result'
    &&row?.sourceRuntimeId===runtimeId&&row?.storeId==='pearsonswine.com:#store'
    &&row?.storeName==="Pearson's Wine & Spirits"&&row?.storeAddress==='2436 Wisconsin Avenue NW, Washington, DC 20007'
    &&row?.merchantId==='https://pearsonswine.com/#store'
    &&row?.productId==='https://pearsonswine.com/products/blantons-single-barrel-bourbon-750ml#product'
    &&row?.sourceUrl==='https://pearsonswine.com/products/blantons-single-barrel-bourbon-750ml'
    &&row?.variantId==='45949567795418'&&row?.canonicalName==="Blanton's Original Single Barrel"
    &&row?.rawName==="Blanton's Single Barrel Bourbon"&&row?.price===99.99&&row?.tier==='allocated'
    &&row?.availabilityStatus==='in_stock'&&row?.sourceAvailabilityVerified===true&&row?.pickupOfferVerified===true
    &&(quantity==null||quantity===0)&&row?.quantityIsExact===false
    &&['no_exact_shelf_count','storefront_orderable_pickup_offer_no_shelf_count'].includes(semantics)
    &&row?.canAlertAsInventory===false&&row?.canAlertAsWatch===false&&row?.eligibleForOnSite===true
    &&row?.eligibleForDropFeed===true&&row?.eligibleForWatch===false&&row?.eligibleForDelivery===false
    &&row?.eligibleForEmail===false&&row?.eligibleForSms===false
    &&b?.source==='pearsons-shopify-retained-page'&&SHA256.test(b.sourcePageSha256||'')
    &&b?.storeGraphId===row.merchantId&&b?.productGraphId===row.productId&&b?.sku==='00963'
    &&b?.variantId===row.variantId&&b?.storeLat===38.9218933&&b?.storeLng===-77.0727601
    &&b?.offerPrice===99.99&&b?.currency==='USD'&&b?.offerAvailability==='InStock'
    &&b?.pickupMethod==='DeliveryModePickUp'&&b?.pickupLocation==='Wisconsin Ave NW'
    &&b?.pickupReadyText==='Ready within 30 minutes'&&b?.httpStatus===200
    &&Number.isFinite(age)&&age>=0&&age<=2*60*60_000;
}

/** Exact retained source proof for an alert-free isolated customer canary. */
export function isPearsonsDcCanaryPreview(row,{nowMs=Date.now()}={}){
  return row?.previewOnly===true&&row?.sourceProductBinding?.productionOnSiteOnly!==true
    &&exactRow(row,'research:dc:pearsons-shopify',nowMs);
}

/** Pure customer-projection guard; safe to bundle into browser-facing policy. */
export function isPearsonsDcProductionOnSiteSignal(row,{nowMs=Date.now(),cohortSha256}={}){
  const binding=row?.sourceProductBinding;
  return row?.previewOnly!==true&&binding?.productionOnSiteOnly===true
    &&exactRow(row,'dc:pearsons-shopify',nowMs)
    &&(cohortSha256?binding?.productionCohortSha256===cohortSha256:SHA256.test(binding?.productionCohortSha256||''));
}
