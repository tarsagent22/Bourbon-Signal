import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import reviewed from '../../data/texas-shopify-pickup-retailers.json' with {type:'json'};
import {collectShopifyVariantPickup,validateShopifyVariantSource,SHOPIFY_VARIANT_PICKUP_VERSION} from './shopify-variant-pickup.mjs';
import {centralCityHiveRecordMarketTier} from './central-cityhive-market-policy.mjs';
import {runLegacyPrecisionSource} from '../sources/legacy-precision-runtime.mjs';
import {createSourceSkippedResult,summarizeSourceResult} from '../sources/source-result.mjs';
import {writeCollectionFile,collectionRequestSignal} from '../core/collection-context.mjs';

export const TEXAS_SHOPIFY_PICKUP_SOURCE=validateShopifyVariantSource(reviewed.source);
export const TEXAS_SHOPIFY_PICKUP_TTL_MS=60*60_000;
const SOURCE=TEXAS_SHOPIFY_PICKUP_SOURCE,STORE=SOURCE.stores[0];
const CONFIG_DIGEST=createHash('sha256').update(JSON.stringify(SOURCE)).digest('hex');
const adapter={id:SOURCE.runtimeId,label:SOURCE.sourceLabel,url:SOURCE.baseUrl,
  metadata:{stateId:'TX',lane:'exact_variant_pickup'}};
const targets=new Set(['limited','allocated','unicorn']);

export function isTexasShopifyPickupIdentity(row) {
  const seed=SOURCE.products.find(seed=>seed.productId===row?.productId&&seed.variantId===row?.variantId);
  const p=row?.sourceProductBinding;
  if(!seed||row.state!=='TX'||row.stateCode!=='TX'||row.sourceChain!==SOURCE.chain
    || row.sourceRuntimeId!==SOURCE.runtimeId||row.sourceLabel!==SOURCE.sourceLabel
    || row.merchantId!==SOURCE.merchantId||row.storeId!==STORE.id||row.storeAddress!==STORE.address
    || row.storeName!==STORE.name||row.city!==STORE.city||row.zip!==STORE.zip
    || row.canonicalBottleId!==seed.canonicalBottleId||row.canonicalName!==seed.canonicalName||row.rawName!==seed.title
    || row.sourceUrl!==SOURCE.baseUrl+'/products/'+seed.handle
    || p?.schemaVersion!==1||p.source!=='texas-shopify-pickup'||p.configSha256!==CONFIG_DIGEST
    || p.collectorVersion!==SHOPIFY_VARIANT_PICKUP_VERSION||p.storeId!==STORE.id||p.storeAddress!==STORE.address
    || p.merchantId!==SOURCE.merchantId||p.productId!==seed.productId||p.variantId!==seed.variantId
    || p.canonicalBottleId!==seed.canonicalBottleId||p.canonicalName!==seed.canonicalName||p.rawName!==seed.title
    || p.pickupUrl!==`${SOURCE.baseUrl}/variants/${seed.variantId}/?section_id=${SOURCE.sectionId}`
    || p.price!==row.price||!Number.isFinite(row.price)||row.price<=0||p.observedAt!==row.observedAt
    || !Number.isFinite(Date.parse(row.observedAt))||p.sizeMl!==seed.sizeMl
    || p.premisesVerified!==true||p.pickupOfferVerified!==true
    || row.quantity!==0||row.quantityIsExact!==false||row.variantAvailable!==true
    || row.pickupOfferVerified!==true||row.premisesVerified!==true)return false;
  return true;
}

export function isTexasShopifyPickupInventory(row,nowMs=Date.now()) {
  const age=nowMs-Date.parse(row?.observedAt||'');
  return isTexasShopifyPickupIdentity(row)&&row.availabilityStatus==='in_stock'&&row.sourceAvailabilityVerified===true
    && (row.eventType||row.type)==='retailer_store_inventory_result'&&row.locationPrecision==='store_level'
    && row.canAlertAsInventory!==false
    && !row.stale&&!row.sourceStale&&!row.raw?.staleFallback&&!row.raw?.cacheFallback&&!row.raw?.sourceRuntimeNonAlertable
    && Number.isFinite(age)&&age>=0&&age<=TEXAS_SHOPIFY_PICKUP_TTL_MS;
}

export function texasShopifyPickupLibraryTier(row,bible) {
  if(!isTexasShopifyPickupIdentity(row))return null;
  const record=bible.match(row.canonicalName)?.record;
  if(record?.id!==row.canonicalBottleId||record.canonical!==row.canonicalName)return null;
  return centralCityHiveRecordMarketTier(record,'TX');
}

function currentSignals(rows,bible,nowMs) {
  return (rows||[]).filter(row=>isTexasShopifyPickupInventory(row,nowMs)).flatMap(row=>{
    const tier=texasShopifyPickupLibraryTier(row,bible);
    return targets.has(tier)?[{...row,tier}]:[];
  });
}

function envelope(result) {
  const signals=result.value?.signals||[];
  const roadblocks=[...(result.value?.roadblocks||[])];
  if(!result.ok&&!['not_due'].includes(result.status))roadblocks.push({state:'TX',source:SOURCE.sourceLabel,url:SOURCE.baseUrl,
    sourceRuntimeId:SOURCE.runtimeId,status:result.error?.status||result.status,error:result.error?.message||result.status});
  return {signals,roadblocks,sourceResults:[summarizeSourceResult(result)],sourceReports:[{
    sourceRuntimeId:SOURCE.runtimeId,label:SOURCE.sourceLabel,url:SOURCE.baseUrl,ok:result.ok,
    status:result.error?.status||result.status,sourceRuntimeStatus:result.status,stale:result.stale,
    contentType:'exact-variant-pickup',signalType:'retailer_store_inventory_result',matchedBottleCount:signals.length,
    bytes:0,elapsedMs:0,pdfLinkCount:0,documentLinkCount:0,error:result.error?.message||null,
  }]};
}

export async function collectTexasShopifyPickup(config,bible,options={}) {
  if(config?.id!=='TX')throw new Error('Texas Shopify pickup cannot collect another state');
  const nowMs=options.nowMs??Date.now(),observedAt=options.observedAt||new Date(nowMs).toISOString();
  const cacheFile=options.cacheFile||path.resolve('out/cache/texas-shopify-pickup.json');
  const cache=await readFile(cacheFile,'utf8').then(JSON.parse).catch(()=>null);
  const validCache=cache?.schemaVersion===1&&cache.sourceId===SOURCE.runtimeId;
  const compatible=validCache&&cache.configSha256===CONFIG_DIGEST;
  const lastGood=compatible?cache.lastGood:options.previousSourceResults?.[SOURCE.runtimeId];
  const denied=validCache&&[401,403,429].includes(cache.httpStatus);
  if(validCache&&(compatible||denied)&&Date.parse(cache.nextAllowedAt)>nowMs){
    const result=createSourceSkippedResult({adapter,previous:lastGood,status:denied?'circuit_open':'not_due',now:observedAt,
      schedule:{sourceId:SOURCE.runtimeId,decision:denied?'denial_cooldown':'source_not_due',nextAllowedAt:cache.nextAllowedAt}});
    if(!denied&&result.value)result.value={...result.value,signals:currentSignals(result.value.signals,bible,nowMs)};
    return envelope(result);
  }
  const collected=await runLegacyPrecisionSource({sourceId:SOURCE.runtimeId,stateId:'TX',label:SOURCE.sourceLabel,url:SOURCE.baseUrl,
    previousResults:lastGood?{[SOURCE.runtimeId]:lastGood}:null,circuitBreaker:options.sourceCircuitBreaker,
    sourceRunnerOptions:{...options.sourceRunnerOptions,schedule:false,maxAttempts:1,timeoutMs:55_000},
    collect:async({signal})=>{
      const result=await collectShopifyVariantPickup(bible,SOURCE,{observedAt,signal,fetchText:options.fetchText});
      result.signals=result.signals.flatMap(row=>{
        const seed=SOURCE.products.find(seed=>seed.variantId===row.variantId);
        const signal={...row,variantAvailable:true,sourceProductBinding:{schemaVersion:1,source:'texas-shopify-pickup',
          configSha256:CONFIG_DIGEST,collectorVersion:SHOPIFY_VARIANT_PICKUP_VERSION,merchantId:SOURCE.merchantId,
          storeId:row.storeId,storeAddress:row.storeAddress,productId:row.productId,variantId:row.variantId,
          canonicalBottleId:row.canonicalBottleId,canonicalName:row.canonicalName,rawName:row.rawName,
          price:row.price,observedAt:row.observedAt,sizeMl:seed.sizeMl,premisesVerified:true,pickupOfferVerified:true,
          pickupUrl:row.sourceProductBinding}};
        const tier=texasShopifyPickupLibraryTier(signal,bible);
        return targets.has(tier)?[{...signal,tier}]:[];
      });
      return {...result,metadata:{...result.metadata,complete:true,recordsInspected:result.observations.length,
        inspectedScope:result.observations.map(row=>({sku:row.variantId,storeId:row.storeId})),
        negativeObservations:result.observations.filter(row=>row.availabilityStatus==='out_of_stock'),
        exhaustiveCatalogVerified:false,accounting:result.accounting}};
    }});
  collectionRequestSignal(options.signal)?.throwIfAborted();
  const summary=collected.sourceResults[0],httpStatus=summary.ok?200:summary.error?.status||0;
  const defaultCooldown=[401,403,429].includes(httpStatus)?24*60*60_000:30*60_000;
  const cooldown=Math.max(defaultCooldown,Math.max(0,Number(summary.error?.details?.retryAfterSeconds)||0)*1000);
  const next={schemaVersion:1,sourceId:SOURCE.runtimeId,configSha256:CONFIG_DIGEST,lastAttemptAt:observedAt,httpStatus,
    nextAllowedAt:new Date(nowMs+cooldown).toISOString(),lastAttemptResult:summary,
    lastGood:summary.ok?{...summary,value:{signals:collected.signals,roadblocks:[],metadata:collected.metadata}}:lastGood};
  await mkdir(path.dirname(cacheFile),{recursive:true});await writeCollectionFile(cacheFile,JSON.stringify(next,null,2));
  return collected;
}
