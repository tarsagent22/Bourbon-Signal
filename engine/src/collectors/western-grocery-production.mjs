import {readFile,mkdir,rm,writeFile} from 'node:fs/promises';
import {mkdirSync,writeFileSync,renameSync,rmSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import waManifest from '../../data/state-integration/WA.json' with {type:'json'};
import nmManifest from '../../data/state-integration/NM.json' with {type:'json'};
import {STATE_LIFECYCLE_CONFIG} from '../state-lifecycle.mjs';
import {validateImmutablePromotionEvidence,evaluateStateControl} from '../reliability-policy.mjs';
import {collectionSignal,collectionRequestSignal} from '../core/collection-context.mjs';
import {fetchWithMeta} from '../core/fetcher.mjs';
import {sourceErrorForHttp} from '../sources/source-error.mjs';
import {createSourceAdapter} from '../sources/source-adapter.mjs';
import {runSourceAdapters} from '../sources/source-runner.mjs';
import {summarizeSourceResult} from '../sources/source-result.mjs';
import {collectGroceryExpansion} from './grocery-xapi-expansion.mjs';
import {WESTERN_GROCERY_EXPANSION_SOURCES} from './western-grocery-premises.mjs';
import {isGroceryExpansionInventory,groceryExpansionLibraryTier} from '../grocery-xapi-policy.mjs';
import {WESTERN_GROCERY_PRODUCTION_STATES,WESTERN_GROCERY_BUDGETS,westernGroceryCohortKey,westernGroceryRuntimeId} from '../western-grocery-production-config.mjs';

export const WESTERN_GROCERY_CACHE_MAX_AGE_MS=30*60_000;
const DENIALS=new Set([401,403,429,435]),DAY=86_400_000,manifests={WA:waManifest,NM:nmManifest};
const sha=value=>createHash('sha256').update(value).digest('hex');
export function westernGrocerySourceConfigHash(state,manifest=manifests[state]){if(!manifest)throw new Error('Unreviewed grocery state');
  return sha(JSON.stringify(Object.fromEntries(['lifecycle','collector','storeIdentity','sourceSemantics','customerPaths'].map(key=>[key,manifest[key]]))));
}
export function westernGroceryPromotionAllowed(state,config=STATE_LIFECYCLE_CONFIG,{env=process.env,manifest=manifests[state]}={}){
  const entry=config?.states?.[state],policy={...config.reliabilityPolicy?.promotionPolicy,minShadowRuns:Math.max(3,Number(config.reliabilityPolicy?.promotionPolicy?.minShadowRuns)||3),minCanaryRuns:Math.max(2,Number(config.reliabilityPolicy?.promotionPolicy?.minCanaryRuns)||2)};
  return Boolean(WESTERN_GROCERY_PRODUCTION_STATES.includes(state)&&config.activeStates?.includes(state)
    &&entry?.publicStatus==='active'&&entry.promotionStage==='active'
    &&entry.inventoryAlertable===false&&entry.watchAlertable===false
    &&manifest?.state===state&&manifest.sourceSemantics.inventoryAlertable===false&&manifest.sourceSemantics.watchAlertable===false
    &&Number(entry.promotionEvidence?.shadowRuns)>=policy.minShadowRuns&&Number(entry.promotionEvidence?.canaryRuns)>=policy.minCanaryRuns
    &&Number.isFinite(Date.parse(entry.promotionEvidence?.verifiedAt||''))
    &&entry.promotionEvidence.verticalSliceManifest===`engine/data/state-integration/${state}.json`
    &&entry.promotionEvidence.fixtureContract===`engine/data/state-fixtures/${state}.json`
    &&evaluateStateControl(state,env).collect&&evaluateStateControl(state,env).publishCandidate
    &&manifest.collector.cohortSha256===westernGroceryCohortKey(state)
    &&JSON.stringify(manifest.collector.sourceIds)===JSON.stringify([westernGroceryRuntimeId(state)])
    &&validateImmutablePromotionEvidence(state,entry.promotionEvidence,policy)
    &&JSON.stringify(manifest.evidence?.immutablePromotionEvidence)===JSON.stringify(entry.promotionEvidence.immutableEvidence)
    &&entry.promotionEvidence.immutableEvidence.sourceConfigHash===westernGrocerySourceConfigHash(state,manifest));
}
const silent=row=>({...row,canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,
  eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false});
async function readJson(file,{strict=false}={}){try{return JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT'||!strict)return null;throw error;}}
function allowedHosts(state){return new Set(['www.safeway.com',...WESTERN_GROCERY_EXPANSION_SOURCES.filter(source=>source.stateCode===state).map(source=>source.host)]);}
function validateIncidents(value,state){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Grocery incident journal is malformed');
  for(const[key,entry]of Object.entries(value))if(!key.startsWith('host:')||!allowedHosts(state).has(key.slice(5))
    ||entry?.status!=='access_denied'||!DENIALS.has(Number(entry.httpStatus))
    ||!Number.isFinite(Date.parse(entry.lastAttemptAt))||!Number.isFinite(Date.parse(entry.nextAllowedAt))
    ||Date.parse(entry.nextAllowedAt)-Date.parse(entry.lastAttemptAt)<DAY)throw new Error('Grocery incident journal has an unreviewed or invalid cooldown');
  return value;
}
function writeIncidents(file,value){
  mkdirSync(path.dirname(file),{recursive:true});const temporary=file+'.'+randomUUID()+'.tmp';
  try{writeFileSync(temporary,JSON.stringify(value,null,2));renameSync(temporary,file);}finally{rmSync(temporary,{force:true});}
}
function completeCohortMetadata(metadata,state){
  const sources=WESTERN_GROCERY_EXPANSION_SOURCES.filter(source=>source.stateCode===state),ids=sources.map(source=>source.storeId);
  return metadata?.complete===true && JSON.stringify(metadata.selectedStores)===JSON.stringify(ids)
    && Array.isArray(metadata.verifiedPremises)&&metadata.verifiedPremises.length===ids.length&&ids.every(id=>metadata.verifiedPremises.includes(id))
    && Array.isArray(metadata.requests)&&metadata.requests.length>=sources.length*2+3&&metadata.requests.length<=(state==='WA'?127:43)
    && metadata.requests.every(row=>row.ok===true&&[200,206].includes(row.status));
}
function cacheMatches(cache,state,nowMs){
  const age=nowMs-Date.parse(cache?.generatedAt||'');
  return cache?.schemaVersion===1&&cache.cohortKey===westernGroceryCohortKey(state)&&completeCohortMetadata(cache.metadata,state)
    &&Array.isArray(cache.signals)&&Number.isFinite(age)&&age>=0&&age<=WESTERN_GROCERY_CACHE_MAX_AGE_MS
    &&cache.signals.every(row=>row.state===state&&row.sourceRuntimeId===westernGroceryRuntimeId(state)
      &&isGroceryExpansionInventory(row)&&row.raw?.shadowOnly!==true&&row.sourceProductBinding?.shadowOnly!==true
      &&Number.isFinite(Date.parse(row.observedAt))&&nowMs-Date.parse(row.observedAt)>=0
      &&nowMs-Date.parse(row.observedAt)<=WESTERN_GROCERY_CACHE_MAX_AGE_MS);
}
function currentRows(rows,bible){return rows.flatMap(row=>{const tier=groceryExpansionLibraryTier(row,bible);return ['limited','allocated','unicorn'].includes(tier)?[silent({...row,tier})]:[];});}

export async function collectWesternGroceryProductionSource(config,bible,{lifecycleConfig=STATE_LIFECYCLE_CONFIG,promotionManifest,env=process.env,
  fetchText=fetchWithMeta,cacheDir=path.resolve('out/browser'),incidentDir=path.resolve('out/source-incidents/western-grocery'),signal,nowMs=Date.now(),sleep,cursorDir,
  onRequest=()=>{},forceLive=process.env.BOURBON_SIGNAL_FORCE_SOURCE_RUN==='1',timeoutMs,persistIncidentJournal=writeIncidents}={}){
  const state=config?.id;
  if(!WESTERN_GROCERY_PRODUCTION_STATES.includes(state))throw new Error('Unreviewed production grocery state');
  if(!westernGroceryPromotionAllowed(state,lifecycleConfig,{env,manifest:promotionManifest||manifests[state]}))return{signals:[],roadblocks:[],metadata:{complete:false,blockedByPromotion:true},accounting:{requestCount:0,bytes:0,elapsedMs:0,completeSnapshot:false}};
  const inherited=collectionSignal(signal);inherited?.throwIfAborted();
  const cacheFile=path.join(cacheDir,`${state}-grocery-production-cache.json`),incidentFile=path.join(incidentDir,`${state}-grocery-production-incidents.json`);
  const incidents=validateIncidents(await readJson(incidentFile,{strict:true})||{},state);
  const blocked=Object.entries(incidents).find(([,entry])=>Date.parse(entry.nextAllowedAt)>nowMs);
  if(blocked)throw sourceErrorForHttp(blocked[1].httpStatus,'Grocery host remains in its persisted access-denial cooldown',{details:{incidentPersisted:true,requestCount:0,nextAllowedAt:blocked[1].nextAllowedAt}});
  // Admission proves the independent incident journal is writable before HTTP.
  // It carries no inventory and may still be saved after collection aborts.
  await persistIncidentJournal(incidentFile,incidents);
  const cached=await readJson(cacheFile,{strict:true});
  if(!forceLive&&cacheMatches(cached,state,nowMs)){inherited?.throwIfAborted();return{signals:currentRows(cached.signals,bible),roadblocks:[],
    metadata:{...cached.metadata,cacheReused:true,cacheGeneratedAt:cached.generatedAt,sourceObservedAt:cached.generatedAt},
    accounting:{requestCount:0,bytes:0,elapsedMs:0,completeSnapshot:true}};}
  const max=WESTERN_GROCERY_BUDGETS[state].sourceMs,budget=Number.isFinite(timeoutMs)&&timeoutMs>0?Math.min(timeoutMs,max):max;
  const deadline=AbortSignal.timeout(budget),bounded=inherited?AbortSignal.any([inherited,deadline]):deadline;
  const started=Date.now();let requestCount=0,bytes=0,lastDenied=null,denialPersisted=false;
  const seenDenials=new Map();
  const measured=async(url,options)=>{
    const requestSignal=collectionRequestSignal(options.signal);requestCount++;onRequest();
    const result=await fetchText(url,{...options,signal:requestSignal});
    bytes+=Buffer.byteLength(result.text||'');
    if(DENIALS.has(Number(result.status))){lastDenied={status:Number(result.status),host:new URL(url).hostname,at:Math.max(nowMs,Date.now()),retry:Number.isFinite(Number(result.retryAfterSeconds))?Math.max(0,Number(result.retryAfterSeconds)):0};seenDenials.set(lastDenied.host,lastDenied);}
    if(result.ok){const requested=new URL(url),final=new URL(result.url);requested.searchParams.sort();final.searchParams.sort();if(requested.href!==final.href)throw new Error('Production grocery source changed its exact first-party URL');}
    return result;
  };
  const persistAttempts=async value=>{
    const journal={...incidents};for(const[key,entry]of Object.entries(value))if(key.startsWith('host:')){
      const denied=seenDenials.get(key.slice(5)),at=denied?.at||Date.parse(entry.lastAttemptAt);
      journal[key]={...entry,lastAttemptAt:new Date(at).toISOString(),nextAllowedAt:new Date(Math.min(8_640_000_000_000_000,Math.max(Date.parse(entry.nextAllowedAt),at+DAY,at+(denied?.retry||0)*1000))).toISOString()};
    }
    validateIncidents(journal,state);
    try{await persistIncidentJournal(incidentFile,journal);denialPersisted=true;}catch(error){throw sourceErrorForHttp(lastDenied?.status||403,'Grocery incident journal could not be persisted after access denial',{cause:error,details:{incidentWriteFailed:true,incidentErrorCode:error.code||null,requestCount}});}
  };
  let result;
  try{result=await collectGroceryExpansion(config,bible,{fetchText:measured,attempts:incidents,persistAttempts,
    observedAt:new Date(nowMs).toISOString(),nowMs,signal:bounded,sleep,cursorDir});}
  catch(error){if(lastDenied&&!error.status)throw sourceErrorForHttp(lastDenied.status,'Grocery access denial was observed before collection aborted',{cause:error,details:{incidentPersisted:denialPersisted,requestCount}});throw error;}
  bounded.throwIfAborted();
  if(!result.metadata.complete){
    const denial=result.roadblocks.find(row=>DENIALS.has(Number(row.status)));
    if(denial)throw sourceErrorForHttp(denial.status,'Grocery access denial ended the complete-cohort observation',{details:{incidentPersisted:true,requestCount}});
    throw new Error('Production grocery collection did not verify its complete reviewed cohort');
  }
  const rows=result.signals.map(row=>silent({...row,sourceRuntimeId:westernGroceryRuntimeId(state)}));
  const metadata={...result.metadata,sourceObservedAt:new Date(nowMs).toISOString(),cohortKey:westernGroceryCohortKey(state),observation:'production_onsite_only',productionAlertDeliveryAllowed:false};
  await mkdir(cacheDir,{recursive:true});bounded.throwIfAborted();const temporary=cacheFile+'.'+randomUUID()+'.tmp';
  try{await writeFile(temporary,JSON.stringify({schemaVersion:1,cohortKey:westernGroceryCohortKey(state),generatedAt:new Date(nowMs).toISOString(),signals:rows,metadata},null,2));bounded.throwIfAborted();renameSync(temporary,cacheFile);}finally{await rm(temporary,{force:true});}
  return{signals:currentRows(rows,bible),roadblocks:result.roadblocks,metadata,accounting:{requestCount,bytes,elapsedMs:Date.now()-started,completeSnapshot:true}};
}

export async function collectWesternGroceryProductionState(config,bible,options={}){
  const state=config.id,startedAt=new Date().toISOString(),id=westernGroceryRuntimeId(state),label=`${state} reviewed exact-store grocery inventory`;
  if(!westernGroceryPromotionAllowed(state,options.lifecycleConfig||STATE_LIFECYCLE_CONFIG,{env:options.env||process.env,manifest:options.promotionManifest||manifests[state]}))return{
    state,label:config.label,tier:config.tier,strategy:config.strategy,cadence:config.cadence,startedAt,finishedAt:new Date().toISOString(),lastGoodAt:null,
    status:'not_promoted',stale:false,signals:[],roadblocks:[],sources:[],sourceResults:[],metadata:{blockedByPromotion:true,requestCount:0}};
  const budget=WESTERN_GROCERY_BUDGETS[state].sourceMs;let measuredRequests=0;
  const run=await runSourceAdapters([createSourceAdapter({id,label,url:'https://www.safeway.com/abs/pub/xapi/storeresolver/v2/all',
    metadata:{stateId:state,lane:'promoted_grocery_onsite'},execute:(_context,{signal})=>collectWesternGroceryProductionSource(config,bible,{...options,...options.grocerySourceOptions,onRequest:()=>{measuredRequests++;},signal:collectionSignal(options.signal?AbortSignal.any([options.signal,signal]):signal)}),
    validate:value=>value?.metadata?.complete===true&&Array.isArray(value.signals)?true:'Grocery source did not complete its reviewed cohort',recordCount:value=>value.signals.length,
  })],{}, {...options.sourceRunnerOptions,previousResults:options.previousSourceResults,circuitBreaker:options.sourceCircuitBreaker,
    concurrency:1,perDomain:1,schedule:false,timeoutMs:Math.min(Number(options.sourceRunnerOptions?.timeoutMs)||budget,budget),maxAttempts:1});
  const source=run.results[0],value=source.ok?source.value:null,finishedAt=new Date().toISOString();
  return{state,label:config.label,tier:config.tier,strategy:config.strategy,cadence:config.cadence,startedAt,finishedAt,
    lastGoodAt:value?.metadata.sourceObservedAt||null,status:source.ok?(value.signals.length?'useful':'monitored_no_current_inventory'):'blocked',stale:false,
    signals:value?.signals||[],sources:[{sourceRuntimeId:id,label,url:source.sourceUrl,ok:source.ok,status:source.error?.status||(source.ok?200:source.status),
      contentType:'application/json',signalType:'retailer_store_inventory_result',matchedBottleCount:value?.signals.length||0,locationPrecision:'store_level',error:source.error?.message||null}],
    sourceResults:[{...summarizeSourceResult(source),lastGoodAt:value?.metadata.sourceObservedAt||null,alertable:false}],sourceCircuitState:run.circuitState,
    roadblocks:source.ok?[]:[{state,source:label,sourceRuntimeId:id,url:source.sourceUrl,status:source.error?.status||source.status,error:source.error?.message||'Grocery source failed'}],
    metadata:{grocery:value?.metadata||null,requestCount:value?.accounting?.requestCount??measuredRequests,allDeliveryDisabled:true}};
}
