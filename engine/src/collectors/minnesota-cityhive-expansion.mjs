import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {writeCollectionFile} from '../core/collection-context.mjs';
import {collectCentralCityHiveExpansion,MINNESOTA_CITYHIVE_EXPANSION_SOURCES} from './central-cityhive-expansion.mjs';

// This policy describes source proof, never state activation. Minnesota remains
// research-only until its independent promotion and publication gates pass.
export function isMinnesotaCityHiveInventory(row) {
  const source=MINNESOTA_CITYHIVE_EXPANSION_SOURCES.find(s=>s.merchantId===row.merchantId);
  const proof=row.sourceProductBinding,variant=row.optionId||row.variantId;
  if(!source || row.state!=='MN' || row.stateCode!=='MN' || row.sourceChain!==source.chainId
    || row.sourceLabel!==source.sourceLabel || row.storeId!==source.storeId || row.storeAddress!==source.address
    || row.lat!==source.lat || row.lng!==source.lng || proof?.coordinatesVerified!==true
    || proof.latitude!==source.lat || proof.longitude!==source.lng
    || row.eventType!=='retailer_store_inventory_result' || row.locationPrecision!=='store_level'
    || row.sourceAvailabilityVerified!==true || row.availabilityStatus!=='in_stock'
    || !row.productId || !variant || !Number.isFinite(row.price) || row.price<=0
    || Number(row.quantity)!==0 || row.quantityIsExact!==false || !Number.isFinite(Date.parse(row.observedAt))
    || proof?.schemaVersion!==1 || proof.source!=='central-cityhive' || proof.storeId!==row.storeId
    || proof.storeAddress!==row.storeAddress || proof.merchantId!==row.merchantId
    || proof.productId!==row.productId || proof.optionId!==variant || proof.canonicalBottleId!==row.canonicalBottleId
    || proof.rawName!==row.rawName || proof.price!==row.price || proof.observedAt!==row.observedAt
    || proof.premisesVerified!==true || proof.pickupOfferVerified!==true)return false;
  try{
    const url=new URL(row.sourceUrl),segments=url.pathname.split('/').filter(Boolean);
    return url.protocol==='https:'&&url.hostname===source.hostname&&!url.username&&!url.password&&!url.hash
      &&segments.length===4&&segments[0]==='shop'&&segments[1]==='product'&&segments[3]===row.productId
      &&[...url.searchParams].length===1&&url.searchParams.get('option-id')===variant;
  }catch{return false;}
}

export async function collectMinnesotaCityHiveExpansion(config,bible,options={}) {
  if(config.id!=='MN')throw new Error('Minnesota collector requires its reviewed state');
  const cacheFile=options.cacheFile||path.resolve('out/cache/minnesota-cityhive-expansion.json');
  const nowMs=options.nowMs??Date.now();
  const cached=await readFile(cacheFile,'utf8').then(JSON.parse).catch(()=>null);
  const previous=cached?.schemaVersion===1?cached:{signals:[],sourceAttempts:{}};
  const result=await collectCentralCityHiveExpansion(config,bible,{...options,nowMs,attempts:previous.sourceAttempts});
  const attempted=new Set(result.metadata.requests.map(r=>r.sourceId));
  const retained=(previous.signals||[]).filter(r=>!attempted.has(r.storeId)&&isMinnesotaCityHiveInventory(r)
    &&nowMs-Date.parse(r.observedAt)>=0&&nowMs-Date.parse(r.observedAt)<=30*60_000);
  result.signals.push(...retained.map(r=>({...r,fallback:true,fallbackReason:'Source not due; original observedAt retained within its 30-minute freshness window.'})));
  await mkdir(path.dirname(cacheFile),{recursive:true});
  await writeCollectionFile(cacheFile,JSON.stringify({schemaVersion:1,signals:result.signals,sourceAttempts:result.metadata.sourceAttempts},null,2));
  return result;
}
