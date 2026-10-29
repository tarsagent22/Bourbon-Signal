import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {writeCollectionFile} from '../core/collection-context.mjs';
import {collectCentralCityHiveExpansion,MIDWEST_CITYHIVE_EXPANSION_SOURCES} from './central-cityhive-expansion.mjs';

export function isMidwestCityHiveInventory(row) {
  const source=MIDWEST_CITYHIVE_EXPANSION_SOURCES.find(s=>s.merchantId===row.merchantId&&s.state===row.state);
  const p=row.sourceProductBinding,variant=row.optionId||row.variantId;
  if(!source || row.stateCode!==source.state || row.sourceChain!==source.chainId || row.sourceLabel!==source.sourceLabel
    || row.storeId!==source.storeId || row.storeAddress!==source.address || String(row.eventType||row.type)!=='retailer_store_inventory_result'
    || row.lat!==source.lat || row.lng!==source.lng || p?.coordinatesVerified!==true
    || p.latitude!==source.lat || p.longitude!==source.lng
    || row.locationPrecision!=='store_level' || row.availabilityStatus!=='in_stock' || row.sourceAvailabilityVerified!==true
    || !row.productId || !variant || !Number.isFinite(row.price) || row.price<=0 || Number(row.quantity)!==0 || row.quantityIsExact!==false
    || !Number.isFinite(Date.parse(row.observedAt)) || p?.schemaVersion!==1 || p.source!=='central-cityhive'
    || p.storeId!==row.storeId || p.storeAddress!==row.storeAddress || p.merchantId!==row.merchantId
    || p.productId!==row.productId || p.optionId!==variant || p.canonicalBottleId!==row.canonicalBottleId
    || p.rawName!==row.rawName || p.price!==row.price || p.observedAt!==row.observedAt
    || p.premisesVerified!==true || p.pickupOfferVerified!==true)return false;
  try{
    const u=new URL(row.sourceUrl),segments=u.pathname.split('/').filter(Boolean);
    return u.protocol==='https:'&&u.hostname===source.hostname&&!u.username&&!u.password&&!u.hash
      &&segments.length===4&&segments[0]==='shop'&&segments[1]==='product'&&segments[3]===row.productId
      &&[...u.searchParams].length===1&&u.searchParams.get('option-id')===variant;
  }catch{return false;}
}

export async function collectMidwestCityHiveExpansion(config,bible,options={}) {
  if(!['MO','IL'].includes(config.id))throw new Error('Midwest collector requires a reviewed state');
  const cacheFile=options.cacheFile||path.resolve(`out/cache/${config.id.toLowerCase()}-cityhive-expansion.json`);
  const nowMs=options.nowMs??Date.now();
  const cached=await readFile(cacheFile,'utf8').then(JSON.parse).catch(()=>null);
  const previous=cached?.schemaVersion===1?cached:{signals:[],sourceAttempts:{}};
  const result=await collectCentralCityHiveExpansion(config,bible,{...options,nowMs,attempts:previous.sourceAttempts});
  const attempted=new Set(result.metadata.requests.map(r=>r.sourceId));
  const retained=(previous.signals||[]).filter(r=>r.state===config.id&&!attempted.has(r.storeId)&&isMidwestCityHiveInventory(r)
    &&nowMs-Date.parse(r.observedAt)>=0&&nowMs-Date.parse(r.observedAt)<=30*60_000);
  result.signals.push(...retained.map(r=>({...r,fallback:true,fallbackReason:'Source not due; original observedAt retained within its 30-minute freshness window.'})));
  await mkdir(path.dirname(cacheFile),{recursive:true});
  await writeCollectionFile(cacheFile,JSON.stringify({schemaVersion:1,signals:result.signals,sourceAttempts:result.metadata.sourceAttempts},null,2));
  return result;
}
