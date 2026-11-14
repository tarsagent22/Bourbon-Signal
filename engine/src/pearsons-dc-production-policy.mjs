const SHA256=/^[a-f0-9]{64}$/u;

/** Pure customer-projection guard; safe to bundle into browser-facing policy. */
export function isPearsonsDcProductionOnSiteSignal(row,{nowMs=Date.now(),cohortSha256}={}){
  const binding=row?.sourceProductBinding,age=nowMs-Date.parse(row?.observedAt||'');
  return row?.state==='DC'&&row?.stateCode==='DC'&&row?.eventType==='retailer_store_inventory_result'
    &&row?.sourceRuntimeId==='dc:pearsons-shopify'&&row?.storeId==='pearsonswine.com:#store'
    &&row?.storeName==="Pearson's Wine & Spirits"&&row?.storeAddress==='2436 Wisconsin Avenue NW, Washington, DC 20007'
    &&row?.merchantId==='https://pearsonswine.com/#store'
    &&row?.productId==='https://pearsonswine.com/products/blantons-single-barrel-bourbon-750ml#product'
    &&row?.sourceUrl==='https://pearsonswine.com/products/blantons-single-barrel-bourbon-750ml'
    &&row?.variantId==='45949567795418'&&row?.canonicalName==="Blanton's Original Single Barrel"
    &&row?.rawName==="Blanton's Single Barrel Bourbon"&&row?.price===99.99&&row?.tier==='allocated'
    &&row?.availabilityStatus==='in_stock'&&row?.sourceAvailabilityVerified===true&&row?.pickupOfferVerified===true
    &&row?.quantity==null&&row?.quantityIsExact===false&&row?.quantitySemantics==='no_exact_shelf_count'
    &&row?.canAlertAsInventory===false&&row?.canAlertAsWatch===false&&row?.eligibleForOnSite===true
    &&row?.eligibleForDropFeed===true&&row?.eligibleForWatch===false&&row?.eligibleForDelivery===false
    &&row?.eligibleForEmail===false&&row?.eligibleForSms===false
    &&binding?.source==='pearsons-shopify-retained-page'&&SHA256.test(binding.sourcePageSha256||'')
    &&binding?.storeGraphId===row.merchantId&&binding?.productGraphId===row.productId
    &&binding?.sku==='00963'&&binding?.variantId===row.variantId&&binding?.storeLat===38.9218933
    &&binding?.storeLng===-77.0727601&&binding?.offerPrice===99.99&&binding?.currency==='USD'
    &&binding?.offerAvailability==='InStock'&&binding?.pickupMethod==='DeliveryModePickUp'
    &&binding?.pickupLocation==='Wisconsin Ave NW'&&binding?.pickupReadyText==='Ready within 30 minutes'
    &&binding?.httpStatus===200&&binding?.productionOnSiteOnly===true
    &&(cohortSha256?binding?.productionCohortSha256===cohortSha256:SHA256.test(binding?.productionCohortSha256||''))
    &&Number.isFinite(age)&&age>=0&&age<=2*60*60_000;
}
