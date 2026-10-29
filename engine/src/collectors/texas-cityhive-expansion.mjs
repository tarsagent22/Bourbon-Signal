import { readFile,mkdir } from 'node:fs/promises';
import path from 'node:path';
import { writeCollectionFile } from '../core/collection-context.mjs';
import { collectCentralCityHiveExpansion,TEXAS_CITYHIVE_EXPANSION_SOURCES } from './central-cityhive-expansion.mjs';

export function isTexasExpansionSignalIdentity(row) {
  const source=TEXAS_CITYHIVE_EXPANSION_SOURCES.find(s=>s.chainId===row.sourceChain&&s.merchantId===row.merchantId);
  const proof=row.sourceProductBinding;
  const optionId=row.optionId||row.variantId;
  if(!source || row.state!=='TX' || row.stateCode!=='TX' || row.sourceLabel!==source.sourceLabel
    || row.storeId!==source.storeId || row.storeAddress!==source.address
    || !row.productId || !optionId || proof?.source!=='central-cityhive' || proof.schemaVersion!==1
    || proof.storeId!==row.storeId || proof.storeAddress!==row.storeAddress || proof.merchantId!==row.merchantId
    || proof.productId!==row.productId || proof.optionId!==optionId || proof.rawName!==row.rawName
    || proof.canonicalBottleId!==row.canonicalBottleId || proof.price!==row.price || proof.observedAt!==row.observedAt
    || proof.premisesVerified!==true || proof.pickupOfferVerified!==true
    || !Number.isFinite(Date.parse(row.observedAt)) || !Number.isFinite(row.price) || row.price<=0
    || Number(row.quantity)!==0 || row.quantityIsExact!==false)return false;
  try{
    const url=new URL(row.sourceUrl),segments=url.pathname.split('/').filter(Boolean);
    return url.protocol==='https:'&&url.hostname===source.hostname&&!url.username&&!url.password&&!url.hash
      && segments.length===4&&segments[0]==='shop'&&segments[1]==='product'&&segments[3]===row.productId
      && [...url.searchParams].length===1&&url.searchParams.get('option-id')===optionId;
  }catch{return false;}
}

export async function collectTexasCityHiveExpansion(config,bible,options={}) {
  const cacheFile=options.cacheFile||path.resolve('out/cache/texas-cityhive-expansion.json');
  const nowMs=options.nowMs??Date.now();
  const cache=await readFile(cacheFile,'utf8').then(JSON.parse).catch(()=>null);
  const prior=cache?.schemaVersion===1?cache:{signals:[],sourceAttempts:{}};
  const result=await collectCentralCityHiveExpansion(config,bible,{...options,nowMs,attempts:prior.sourceAttempts});
  const requested=new Set(result.metadata.requests.map(r=>r.sourceId));
  const retained=(prior.signals||[]).filter(row=>!requested.has(row.storeId)&&isTexasExpansionSignalIdentity(row)
    && nowMs-Date.parse(row.observedAt)>=0 && nowMs-Date.parse(row.observedAt)<=30*60_000);
  result.signals.push(...retained.map(row=>({...row,fallback:true,fallbackReason:'Source is not yet due; preserving original observedAt within the 30-minute source freshness limit.'})));
  await mkdir(path.dirname(cacheFile),{recursive:true});
  await writeCollectionFile(cacheFile,JSON.stringify({schemaVersion:1,signals:result.signals,sourceAttempts:result.metadata.sourceAttempts},null,2));
  return result;
}
