import {readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {mkdirSync,writeFileSync,renameSync} from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {fetchWithMeta} from '../core/fetcher.mjs';
import {collectionRequestSignal} from '../core/collection-context.mjs';
import {collectGroceryExpansion} from './grocery-xapi-expansion.mjs';
import {CALIFORNIA_GROCERY_SOURCES} from './california-grocery-premises.mjs';

export const CALIFORNIA_GROCERY_RUNTIME_ID='ca:grocery-xapi';
export const CALIFORNIA_GROCERY_CACHE_MAX_AGE_MS=30*60_000;
export function californiaGroceryCohortKey(sources=CALIFORNIA_GROCERY_SOURCES){
  return createHash('sha256').update(JSON.stringify(['strict-grocery-proof-v1',sources.map(source=>[
    source.id,source.host,source.banner,source.merchantId,source.storeId,source.address,source.city,
    source.zip,source.lat,source.lng,source.resolverDomainName,
  ])])).digest('hex');
}

async function readJson(file,{strict=false}={}){
  try{return JSON.parse(await readFile(file,'utf8'));}catch(error){
    if(error.code==='ENOENT'||!strict)return null;
    throw new Error('California grocery denial ledger could not be read safely',{cause:error});
  }
}

export async function collectCaliforniaGrocerySource(config,bible,{signal,fetchText=fetchWithMeta,
  cacheDir=path.resolve('out/browser'),forceLive=process.env.BOURBON_SIGNAL_CA_FORCE_GROCERY_LIVE==='1'||process.env.BOURBON_SIGNAL_FORCE_SOURCE_RUN==='1',
  nowMs=Date.now(),sleep,cursorDir}={}){
  if(config.id!=='CA')throw new Error('California grocery runtime requires CA');
  const cacheFile=path.join(cacheDir,'CA-grocery-xapi-cache.json'),attemptsFile=path.join(cacheDir,'CA-grocery-xapi-attempts.json');
  const attempts=await readJson(attemptsFile,{strict:true}) || {};
  if(typeof attempts!=='object'||Array.isArray(attempts))throw new Error('California grocery denial ledger is malformed');
  const cached=await readJson(cacheFile);
  const age=nowMs-Date.parse(cached?.generatedAt || '');
  if(!forceLive&&cached?.schemaVersion===1&&cached?.cohortKey===californiaGroceryCohortKey()&&cached?.metadata?.complete===true&&Array.isArray(cached.signals)
    &&Number.isFinite(age)&&age>=0&&age<=CALIFORNIA_GROCERY_CACHE_MAX_AGE_MS
    &&cached.signals.every(row=>Number.isFinite(Date.parse(row.observedAt))&&nowMs-Date.parse(row.observedAt)>=0&&nowMs-Date.parse(row.observedAt)<=CALIFORNIA_GROCERY_CACHE_MAX_AGE_MS)){
    return {signals:cached.signals.map(row=>({...row,sourceRuntimeId:CALIFORNIA_GROCERY_RUNTIME_ID,
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
  const signals=result.signals.map(row=>({...row,sourceRuntimeId:CALIFORNIA_GROCERY_RUNTIME_ID}));
  if(result.metadata.complete){
    signal?.throwIfAborted();await mkdir(cacheDir,{recursive:true});
    const temporary=cacheFile+'.'+randomUUID()+'.tmp';
    try{
      await writeFile(temporary,JSON.stringify({schemaVersion:1,cohortKey:californiaGroceryCohortKey(),generatedAt:new Date(nowMs).toISOString(),signals,metadata:result.metadata},null,2));
      signal?.throwIfAborted();renameSync(temporary,cacheFile);
    }finally{await rm(temporary,{force:true});}
  }
  return {...result,signals,accounting:{requestCount,bytes,elapsedMs:Date.now()-started,completeSnapshot:result.metadata.complete}};
}
