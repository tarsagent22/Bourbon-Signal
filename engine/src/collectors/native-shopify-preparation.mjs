import {createHash} from 'node:crypto';
import {collectShopifyVariantPickup} from './shopify-variant-pickup.mjs';
import {nativePickupPreparationSource,isCapturedNativePickupOnSiteShape} from '../native-shopify-preparation-policy.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');

// This explicit inactive entry point cannot be enabled by TX/MI lifecycle flags,
// a caller's enabled-ID list, or an old CityHive manifest. No storage or transport
// is touched. Real runtime admission/persistence remains separate future work.
export async function collectPreparedNativePickupSource(id,_bible,_options){
  const source=nativePickupPreparationSource(id);if(!source)throw Error('Unknown closed native pickup source');
  return{status:'preparation_only',signals:[],observations:[],roadblocks:[],metadata:{sourceId:source.definition.runtimeId,requestCount:0,productionActivated:false,blockedBySourceAdmission:true}};
}

/** Replay exactly two captured bodies through the unchanged strict collector.
 * Input bodies are supplied explicitly; there is no default/live transport.
 */
export async function replayPreparedNativePickup(id,bible,captures,{nowMs=Date.now()}={}){
  const source=nativePickupPreparationSource(id);if(!source)throw Error('Unknown closed native pickup source');
  if(!Array.isArray(captures)||captures.length!==2)throw Error('Exactly two original native captures required');
  const bodies=new Map();
  for(const expected of source.receipts){
    const matches=captures.filter(row=>row.url===expected.url);if(matches.length!==1)throw Error('Missing/duplicate exact native URL');
    const row=matches[0];if(row.finalUrl!==expected.url||row.status!==200||row.observedAt!==expected.observedAt
      ||typeof row.text!=='string'||sha(row.text)!==expected.sha256||Buffer.byteLength(row.text)!==expected.bytes)throw Error('Changed original native capture');
    bodies.set(expected.url,row.text);
  }
  let reads=0;
  const result=await collectShopifyVariantPickup(bible,source.definition,{observedAt:source.clock,fetchText:async url=>{
    if(!bodies.has(url))throw Error('Collector escaped the two exact native URLs');reads++;return{ok:true,status:200,url,text:bodies.get(url)};
  }});
  if(reads!==2||result.accounting.completeSnapshot!==true)throw Error('Incomplete native capture replay');
  const signals=result.signals.map(row=>({...row,canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,
    eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false,
    sourceProductBinding:{schemaVersion:1,source:'closed_native_shopify_preparation',configSha256:source.configSha256,storeId:row.storeId,
      productId:row.productId,variantId:row.variantId,canonicalBottleId:row.canonicalBottleId,price:row.price,observedAt:source.clock,
      pickupUrl:row.sourceProductBinding,productSha256:source.receipts[0].sha256,pickupSha256:source.receipts[1].sha256,researchOnly:true},
    raw:{...row.raw,researchOnly:true}}));
  const freshSignals=signals.filter(row=>isCapturedNativePickupOnSiteShape(row,{nowMs}));
  return{scope:'offline_captured_format_proof_not_production_admission_or_coverage',sourceId:source.definition.runtimeId,
    signals,observations:result.observations,formatReads:reads,sourceHttpRequests:0,currentCapturedSignals:freshSignals,
    originalSourceClock:source.clock,originalSourceClocksPreserved:true,productionActivated:false,customerStoresAdded:0,
    receipts:source.receipts,collectorVersion:result.metadata.collectorVersion,admissionBlockers:['No registered production adapter/authority','MI requires source-specific shadow/canary/issuer route and native-only state manifest','TX extension must preserve HotSpot and every held legacy leaf','Shared on-site public consumer admission is not wired']};
}
