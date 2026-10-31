import {readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {mkdirSync,writeFileSync,renameSync} from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {fetchWithMeta} from '../core/fetcher.mjs';
import {collectionRequestSignal} from '../core/collection-context.mjs';
import {collectGroceryExpansion,ILLINOIS_GROCERY_PRIORITY_TERMS} from './grocery-xapi-expansion.mjs';
import {ILLINOIS_GROCERY_SOURCES,ILLINOIS_GROCERY_RESOLVER_ZIPS} from './illinois-grocery-premises.mjs';

export const ILLINOIS_GROCERY_RUNTIME_ID='il:grocery-xapi';
export const ILLINOIS_GROCERY_SOURCE_TIMEOUT_MS=40*60_000;
export const ILLINOIS_GROCERY_CACHE_MAX_AGE_MS=30*60_000;
export function illinoisGroceryCohortKey(sources=ILLINOIS_GROCERY_SOURCES){
  return createHash('sha256').update(JSON.stringify(['illinois-grocery-depth-v1',3,ILLINOIS_GROCERY_PRIORITY_TERMS,ILLINOIS_GROCERY_RESOLVER_ZIPS,sources.map(source=>[
    source.id,source.host,source.banner,source.merchantId,source.storeId,source.address,source.city,
    source.zip,source.lat,source.lng,source.resolverDomainName,
  ])])).digest('hex');
}

async function readJson(file,{strict=false}={}){
  try{return JSON.parse(await readFile(file,'utf8'));}catch(error){
    if(error.code==='ENOENT'||!strict)return null;
    throw new Error('Illinois grocery denial ledger could not be read safely',{cause:error});
  }
}

export async function collectIllinoisGrocerySource(config,bible,{signal,fetchText=fetchWithMeta,
  cacheDir=path.resolve('out/browser'),forceLive=process.env.BOURBON_SIGNAL_IL_FORCE_GROCERY_LIVE==='1'||process.env.BOURBON_SIGNAL_FORCE_SOURCE_RUN==='1',
  nowMs=Date.now(),sleep,cursorDir}={}){
  if(config.id!=='IL')throw new Error('Illinois grocery runtime requires IL');
  const cacheFile=path.join(cacheDir,'IL-grocery-xapi-cache.json'),attemptsFile=path.join(cacheDir,'IL-grocery-xapi-attempts.json');
  const attempts=await readJson(attemptsFile,{strict:true}) || {};
  if(typeof attempts!=='object'||Array.isArray(attempts))throw new Error('Illinois grocery denial ledger is malformed');
  const cached=await readJson(cacheFile);
  const age=nowMs-Date.parse(cached?.generatedAt || '');
  const denied=Object.entries(attempts).some(([key,value])=>key.startsWith('host:')&&Date.parse(value?.nextAllowedAt)>nowMs);
  if(!forceLive&&!denied&&cached?.schemaVersion===1&&cached?.cohortKey===illinoisGroceryCohortKey()&&cached?.metadata?.complete===true&&Array.isArray(cached.signals)
    &&Number.isFinite(age)&&age>=0&&age<=ILLINOIS_GROCERY_CACHE_MAX_AGE_MS
    &&cached.signals.every(row=>Number.isFinite(Date.parse(row.observedAt))&&nowMs-Date.parse(row.observedAt)>=0&&nowMs-Date.parse(row.observedAt)<=ILLINOIS_GROCERY_CACHE_MAX_AGE_MS)){
    return {signals:cached.signals.map(row=>({...row,sourceRuntimeId:ILLINOIS_GROCERY_RUNTIME_ID,
      raw:{...row.raw,cacheFallback:true,artifactPath:cacheFile,cacheGeneratedAt:cached.generatedAt}})),roadblocks:[],
      metadata:{...cached.metadata,cacheReused:true,cacheGeneratedAt:cached.generatedAt},
      accounting:{requestCount:0,bytes:0,elapsedMs:0,completeSnapshot:true}};
  }
  const started=Date.now();let requestCount=0,bytes=0;
  const measuredFetch=async(url,options)=>{
    requestCount++;const response=await fetchText(url,{...options,signal:collectionRequestSignal(options.signal)});
    bytes+=Buffer.byteLength(response.text || '');return response;
  };
  const persistAttempts=async value=>{
    // Incident-only journal deliberately survives collection cancellation. It
    // never publishes inventory or advances any observation/freshness clock.
    mkdirSync(cacheDir,{recursive:true});const temporary=attemptsFile+'.'+randomUUID()+'.tmp';
    writeFileSync(temporary,JSON.stringify(value,null,2));renameSync(temporary,attemptsFile);
  };
  const result=await collectGroceryExpansion(config,bible,{fetchText:measuredFetch,signal,sleep,cursorDir,attempts,nowMs,
    observedAt:new Date(nowMs).toISOString(),persistAttempts});
  const signals=result.signals.map(row=>({...row,sourceRuntimeId:ILLINOIS_GROCERY_RUNTIME_ID}));
  if(result.metadata.complete){
    signal?.throwIfAborted();await mkdir(cacheDir,{recursive:true});
    const temporary=cacheFile+'.'+randomUUID()+'.tmp';
    try{
      await writeFile(temporary,JSON.stringify({schemaVersion:1,cohortKey:illinoisGroceryCohortKey(),generatedAt:new Date(nowMs).toISOString(),signals,metadata:result.metadata},null,2));
      signal?.throwIfAborted();renameSync(temporary,cacheFile);
    }finally{await rm(temporary,{force:true});}
  }
  return {...result,signals,accounting:{requestCount,bytes,elapsedMs:Date.now()-started,completeSnapshot:result.metadata.complete}};
}
