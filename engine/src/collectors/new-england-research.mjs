import {NEW_ENGLAND_RESEARCH_SOURCES} from './new-england-premises.mjs';
export {NEW_ENGLAND_RESEARCH_SOURCES} from './new-england-premises.mjs';
import {parseCityHiveProducts} from './cityhive-surfaces.mjs';
import {centralCityHiveBottleFormat,reviewedCentralCityHiveIdentity} from './central-cityhive-expansion.mjs';
import {cityHiveSafeBottleMatch} from './safe-bottle-match.mjs';
import {centralCityHiveRecordMarketTier} from './central-cityhive-market-policy.mjs';
import {stableId} from '../core/text.mjs';

// This module has no transport or production registration. Its only inputs are
// reviewed first-party captures, the current library and their original clocks.
export function parseNewEnglandResearchInventory(html,candidate,bible,{observedAt,nowMs=Date.now(),onVerifiedPremise}={}){
  const source=NEW_ENGLAND_RESEARCH_SOURCES.find(row=>row===candidate),age=nowMs-Date.parse(observedAt||'');
  if(!source||!Number.isFinite(age)||age<0||age>2*60*60_000||Buffer.byteLength(String(html))>2*1024*1024)return[];
  return parseCityHiveProducts(html,source,{sources:NEW_ENGLAND_RESEARCH_SOURCES,
    isAllowedOption:(option,product)=>centralCityHiveBottleFormat(option,product)
      &&Object.hasOwn(option,'preorder_details')&&option.preorder_details===null
      &&Object.hasOwn(option,'allowed_offer_types')&&(option.allowed_offer_types===null
        ||Array.isArray(option.allowed_offer_types)&&option.allowed_offer_types.includes('pick_up'))
      &&Array.isArray(option.units_of_measure)&&option.units_of_measure.length===0,
    reviewOption:reviewedCentralCityHiveIdentity,
    isAllowedMerchantConfiguration:merchant=>{
      const point=merchant.address?.location;
      const valid=merchant.name===source.name&&point?.type==='Point'&&point.coordinates?.length===2
        &&point.coordinates[1]===source.lat&&point.coordinates[0]===source.lng;
      if(valid)onVerifiedPremise?.(source);return valid;
    },
  }).flatMap(row=>{
    const match=row.reviewedIdentity?bible.match(row.reviewedIdentity):cityHiveSafeBottleMatch(row.title,bible).match;
    const record=match?.record,tier=centralCityHiveRecordMarketTier(record,source.state);
    const batch=row.title.match(/\bbatch\s*(\d{1,4})\b|\b(\d{1,4})\s*batch\b/i);
    if(!record||match.confidence!==1||!['limited','allocated','unicorn'].includes(tier)||!Number.isFinite(row.price)||row.price<=0
      ||batch&&!new RegExp(`\\b${batch[1]||batch[2]}\\b`).test(record.canonical))return[];
    return[{id:stableId([source.state,source.id,row.productId,row.variantId]),state:source.state,stateCode:source.state,
      sourceLabel:source.sourceLabel,sourceUrl:row.productUrl,sourceRuntimeId:`research:${source.state.toLowerCase()}:${source.id}`,
      sourceChain:source.chainId,merchantId:source.merchantId,storeId:source.storeId,storeName:source.name,storeAddress:source.address,
      city:source.city,zip:source.zip,lat:source.lat,lng:source.lng,locationPrecision:'store_level',eventType:'retailer_store_inventory_result',
      productId:row.productId,optionId:row.variantId,variantId:row.variantId,rawName:row.title,
      canonicalBottleId:record.id,canonicalName:record.canonical,tier,price:row.price,observedAt,
      quantity:0,quantityIsExact:false,quantitySemantics:'binary_retailer_orderable_no_exact_count',
      sourceAvailabilityVerified:true,availabilityStatus:'in_stock',
      canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,eligibleForOnSite:false,eligibleForDropFeed:false,eligibleForWatch:false,
      eligibleForDelivery:false,deliveryEligible:false,eligibleForEmail:false,eligibleForSms:false,
      sourceProductBinding:{schemaVersion:1,source:'new-england-research-cityhive',storeId:source.storeId,storeAddress:source.address,
        merchantId:source.merchantId,productId:row.productId,optionId:row.variantId,canonicalBottleId:record.id,canonicalName:record.canonical,
        rawName:row.title,identityName:row.reviewedIdentity||row.title,price:row.price,observedAt,premisesVerified:true,pickupOfferVerified:true,coordinatesVerified:true,
        latitude:source.lat,longitude:source.lng,reportedQuantity:row.reportedQuantity,quantitySemantics:'binary_retailer_orderable_no_exact_count',
        collectorVersion:'new-england-cityhive-v1-strict-options',optionPickupRestrictionVerified:true,preorderExcluded:true,shadowOnly:true},
      raw:{shadowOnly:true,reportedQuantity:row.reportedQuantity}}];
  });
}
