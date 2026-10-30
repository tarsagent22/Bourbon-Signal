import {readFile,mkdir,rm,writeFile} from 'node:fs/promises';
import {renameSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import laManifest from '../../data/state-integration/LA.json' with {type:'json'};
import akManifest from '../../data/state-integration/AK.json' with {type:'json'};
import {STATE_LIFECYCLE_CONFIG} from '../state-lifecycle.mjs';
import {validateImmutablePromotionEvidence,evaluateStateControl} from '../reliability-policy.mjs';
import {collectionSignal,collectionRequestSignal} from '../core/collection-context.mjs';
import {fetchReviewedLouisianaAlaskaText as fetchProductionText,validateLouisianaAlaskaIncidentJournal,persistLouisianaAlaskaIncidentJournal as writeIncidents} from './louisiana-alaska-grocery-transport.mjs';
import {sourceErrorForHttp} from '../sources/source-error.mjs';
import {createSourceAdapter} from '../sources/source-adapter.mjs';
import {runSourceAdapters} from '../sources/source-runner.mjs';
import {summarizeSourceResult} from '../sources/source-result.mjs';
import {collectLouisianaAlaskaGrocery,hasLouisianaAlaskaPositiveEvidenceOnly} from './louisiana-alaska-grocery-expansion.mjs';
import {LOUISIANA_ALASKA_GROCERY_SOURCES} from './louisiana-alaska-grocery-premises.mjs';
import {isLouisianaAlaskaGroceryInventory,louisianaAlaskaGroceryLibraryTier} from '../louisiana-alaska-grocery-policy.mjs';
import {LOUISIANA_ALASKA_GROCERY_PRODUCTION_STATES,LOUISIANA_ALASKA_GROCERY_BUDGETS,louisianaAlaskaGroceryCohortKey,louisianaAlaskaGroceryRuntimeId} from '../louisiana-alaska-grocery-production-config.mjs';

export const LOUISIANA_ALASKA_GROCERY_CACHE_MAX_AGE_MS=30*60_000;
const DENIALS=new Set([401,403,429,435]),DAY=86_400_000,manifests={LA:laManifest,AK:akManifest};
const sha=value=>createHash('sha256').update(value).digest('hex');
export function louisianaAlaskaGrocerySourceConfigHash(state,manifest=manifests[state]){if(!manifest)throw new Error('Unreviewed grocery state');
  return sha(JSON.stringify(Object.fromEntries(['lifecycle','collector','storeIdentity','sourceSemantics','customerPaths'].map(key=>[key,manifest[key]]))));
}
export function louisianaAlaskaGroceryPromotionAllowed(state,config=STATE_LIFECYCLE_CONFIG,{env=process.env,manifest=manifests[state]}={}){
  const entry=config?.states?.[state],policy={...config.reliabilityPolicy?.promotionPolicy,minShadowRuns:Math.max(3,Number(config.reliabilityPolicy?.promotionPolicy?.minShadowRuns)||3),minCanaryRuns:Math.max(2,Number(config.reliabilityPolicy?.promotionPolicy?.minCanaryRuns)||2)};
  return Boolean(LOUISIANA_ALASKA_GROCERY_PRODUCTION_STATES.includes(state)&&config.activeStates?.includes(state)
    &&entry?.publicStatus==='active'&&entry.promotionStage==='active'
    &&entry.inventoryAlertable===false&&entry.watchAlertable===false
    &&manifest?.state===state&&manifest.lifecycle?.publicStatus==='active'&&manifest.lifecycle.refinementLevel==='store'
    &&manifest.sourceSemantics?.inventoryAlertable===false&&manifest.sourceSemantics.watchAlertable===false
    &&Number(entry.promotionEvidence?.shadowRuns)>=policy.minShadowRuns&&Number(entry.promotionEvidence?.canaryRuns)>=policy.minCanaryRuns
    &&Number.isFinite(Date.parse(entry.promotionEvidence?.verifiedAt||''))
    &&entry.promotionEvidence.verticalSliceManifest===`engine/data/state-integration/${state}.json`
    &&entry.promotionEvidence.fixtureContract===`engine/data/state-fixtures/${state}.json`
    &&evaluateStateControl(state,env).collect&&evaluateStateControl(state,env).publishCandidate
    &&manifest.collector.cohortSha256===louisianaAlaskaGroceryCohortKey(state)
    &&JSON.stringify(manifest.collector.sourceIds)===JSON.stringify([louisianaAlaskaGroceryRuntimeId(state)])
    &&validateImmutablePromotionEvidence(state,entry.promotionEvidence,policy)
    &&JSON.stringify(manifest.evidence?.immutablePromotionEvidence)===JSON.stringify(entry.promotionEvidence.immutableEvidence)
    &&entry.promotionEvidence.immutableEvidence.sourceConfigHash===louisianaAlaskaGrocerySourceConfigHash(state,manifest));
}
const silent=row=>({...row,canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,
  eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,eligibleForDelivery:false,deliveryEligible:false,eligibleForEmail:false,eligibleForSms:false});
async function readJson(file,{strict=false}={}){try{return JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT'||!strict)return null;throw error;}}
const validateIncidents=validateLouisianaAlaskaIncidentJournal;
function completeCohortMetadata(metadata,state,rows=[]){
  const sources=LOUISIANA_ALASKA_GROCERY_SOURCES.filter(source=>source.stateCode===state),ids=sources.map(source=>source.storeId);
  return (metadata?.complete===true||hasLouisianaAlaskaPositiveEvidenceOnly(metadata,rows,state)) && JSON.stringify(metadata.selectedStores)===JSON.stringify(ids)
    && Array.isArray(metadata.verifiedPremises)&&metadata.verifiedPremises.length===ids.length&&ids.every(id=>metadata.verifiedPremises.includes(id))
    && Array.isArray(metadata.requests)&&metadata.requests.length>=sources.length*2+(state==='LA'?5:7)&&metadata.requests.length<=(state==='LA'?43:53)
    && metadata.requests.every(row=>row.ok===true&&[200,206].includes(row.status));
}
function cacheMatches(cache,state,nowMs){
  const age=nowMs-Date.parse(cache?.generatedAt||'');
  return cache?.schemaVersion===1&&cache.cohortKey===louisianaAlaskaGroceryCohortKey(state)&&completeCohortMetadata(cache.metadata,state,cache.signals)
    &&Array.isArray(cache.signals)&&Number.isFinite(age)&&age>=0&&age<=LOUISIANA_ALASKA_GROCERY_CACHE_MAX_AGE_MS
    &&cache.signals.every(row=>row.state===state&&row.sourceRuntimeId===louisianaAlaskaGroceryRuntimeId(state)
      &&isLouisianaAlaskaGroceryInventory(row)&&row.quarantined!==true&&row.raw?.sourceRuntimeNonAlertable!==true&&row.raw?.staleFallback!==true&&row.raw?.shadowOnly!==true&&row.sourceProductBinding?.shadowOnly!==true
      &&Number.isFinite(Date.parse(row.observedAt))&&nowMs-Date.parse(row.observedAt)>=0
      &&nowMs-Date.parse(row.observedAt)<=LOUISIANA_ALASKA_GROCERY_CACHE_MAX_AGE_MS);
}
function currentRows(rows,bible){return rows.flatMap(row=>{const tier=louisianaAlaskaGroceryLibraryTier(row,bible);return ['limited','allocated','unicorn'].includes(tier)?[silent({...row,tier})]:[];});}

export async function collectLouisianaAlaskaGroceryProductionSource(config,bible,{lifecycleConfig=STATE_LIFECYCLE_CONFIG,promotionManifest,env=process.env,
  fetchText=fetchProductionText,cacheDir=path.resolve('out/browser'),incidentDir=path.resolve('out/source-incidents/louisiana-alaska-grocery'),signal,nowMs=Date.now(),sleep,cursorDir,
  onRequest=()=>{},forceLive=process.env.BOURBON_SIGNAL_FORCE_SOURCE_RUN==='1',timeoutMs,persistIncidentJournal=writeIncidents}={}){
  const state=config?.id;
  if(!LOUISIANA_ALASKA_GROCERY_PRODUCTION_STATES.includes(state))throw new Error('Unreviewed production grocery state');
  if(!louisianaAlaskaGroceryPromotionAllowed(state,lifecycleConfig,{env,manifest:promotionManifest||manifests[state]}))return{signals:[],roadblocks:[],metadata:{complete:false,blockedByPromotion:true},accounting:{requestCount:0,bytes:0,elapsedMs:0,completeSnapshot:false}};
  const inherited=collectionSignal(signal);inherited?.throwIfAborted();
  const cacheFile=path.join(cacheDir,`${state}-grocery-production-cache.json`),incidentFile=path.join(incidentDir,`${state}-grocery-production-incidents.json`);
  const incidents=validateIncidents(await readJson(incidentFile,{strict:true})||{},state);
  const blocked=Object.entries(incidents).find(([,entry])=>entry.status==='access_denied'||Date.parse(entry.nextAllowedAt)>nowMs);
  if(blocked)throw sourceErrorForHttp(blocked[1].httpStatus||0,'Grocery host has a persisted access denial or unfinished request',{details:{incidentPersisted:true,requestCount:0,reviewRequired:blocked[1].reviewRequired===true,blockedByInFlight:blocked[1].status==='in_flight',nextAllowedAt:blocked[1].nextAllowedAt}});
  // Admission proves the independent incident journal is writable before HTTP.
  // It carries no inventory and may still be saved after collection aborts.
  await persistIncidentJournal(incidentFile,incidents);
  const cached=await readJson(cacheFile,{strict:true});
  if(!forceLive&&cacheMatches(cached,state,nowMs)){inherited?.throwIfAborted();const signals=currentRows(cached.signals,bible);
    if(cached.metadata.profileScope==='POSITIVE_EVIDENCE_ONLY'&&!signals.length)throw Error('Positive-only cached query profile has no current eligible positive evidence');
    return{signals,roadblocks:[],
    metadata:{...cached.metadata,cacheReused:true,cacheGeneratedAt:cached.generatedAt,sourceObservedAt:cached.generatedAt},
    accounting:{requestCount:0,bytes:0,elapsedMs:0,completeSnapshot:cached.metadata.complete===true,profileScope:cached.metadata.profileScope||'COMPLETE_REVIEWED_PROFILE',negativeComplete:cached.metadata.negativeComplete!==false,unconfirmedNegativeQueryCount:cached.metadata.unconfirmedNegativeQueryCount||0}};}
  const max=LOUISIANA_ALASKA_GROCERY_BUDGETS[state].sourceMs,budget=Number.isFinite(timeoutMs)&&timeoutMs>0?Math.min(timeoutMs,max):max;
  const deadline=AbortSignal.timeout(budget),bounded=inherited?AbortSignal.any([inherited,deadline]):deadline;
  const started=Date.now();let requestCount=0,bytes=0,lastDenied=null,denialPersisted=false;
  const seenDenials=new Map();
  const recordDenial=async result=>{
    if(!DENIALS.has(Number(result.status)))return;
    const host=new URL(result.url).hostname,at=Math.max(nowMs,Date.now()),retry=Number.isFinite(Number(result.retryAfterSeconds))?Math.max(0,Number(result.retryAfterSeconds)):0;
    lastDenied={status:Number(result.status),host,at,retry};seenDenials.set(host,lastDenied);
    incidents[`host:${host}`]={status:'access_denied',httpStatus:lastDenied.status,reviewRequired:true,lastAttemptAt:new Date(at).toISOString(),
      nextAllowedAt:new Date(Math.min(8_640_000_000_000_000,at+Math.max(DAY,retry*1000))).toISOString()};
    try{await persistIncidentJournal(incidentFile,incidents);denialPersisted=true;}
    catch(error){throw sourceErrorForHttp(lastDenied.status,'Grocery incident journal could not preserve denied response headers',{cause:error,details:{incidentWriteFailed:true,requestCount}});}
  };
  const measured=async(url,options)=>{
    const requestSignal=collectionRequestSignal(options.signal);requestSignal?.throwIfAborted();const host=new URL(url).hostname,at=Math.max(nowMs,Date.now());
    incidents[`host:${host}`]={status:'in_flight',httpStatus:null,lastAttemptAt:new Date(at).toISOString(),nextAllowedAt:new Date(at+DAY).toISOString(),requestId:randomUUID(),urlSha256:sha(url)};
    await persistIncidentJournal(incidentFile,incidents);requestCount++;onRequest();
    const verifyResponse=result=>{const requested=new URL(url),final=new URL(result.url);requested.searchParams.sort();final.searchParams.sort();if(requested.href!==final.href)throw new Error('Production grocery source changed its exact first-party URL');return result;};
    const result=verifyResponse(await fetchText(url,{...options,signal:requestSignal,onResponse:result=>recordDenial(verifyResponse(result))}));
    bytes+=Buffer.byteLength(result.text||'');
    if(DENIALS.has(Number(result.status))){if(!seenDenials.has(host))await recordDenial({...result,url});}
    else if(Number(result.status)>=100){delete incidents[`host:${host}`];await persistIncidentJournal(incidentFile,incidents);}
    return result;
  };
  const persistAttempts=async value=>{
    const journal={...incidents};for(const[key,entry]of Object.entries(value))if(key.startsWith('host:')){
      const denied=seenDenials.get(key.slice(5)),at=denied?.at||Date.parse(entry.lastAttemptAt);
      journal[key]={...entry,reviewRequired:true,lastAttemptAt:new Date(at).toISOString(),nextAllowedAt:new Date(Math.min(8_640_000_000_000_000,Math.max(Date.parse(entry.nextAllowedAt),at+DAY,at+(denied?.retry||0)*1000))).toISOString()};
    }
    validateIncidents(journal,state);
    try{await persistIncidentJournal(incidentFile,journal);denialPersisted=true;}catch(error){throw sourceErrorForHttp(lastDenied?.status||403,'Grocery incident journal could not be persisted after access denial',{cause:error,details:{incidentWriteFailed:true,incidentErrorCode:error.code||null,requestCount}});}
  };
  let result;
  try{result=await collectLouisianaAlaskaGrocery(config,bible,{fetchText:measured,attempts:incidents,persistAttempts,
    observedAt:new Date(nowMs).toISOString(),nowMs,signal:bounded,sleep,cursorDir});}
  catch(error){if(lastDenied&&!error.status)throw sourceErrorForHttp(lastDenied.status,'Grocery access denial was observed before collection aborted',{cause:error,details:{incidentPersisted:denialPersisted,requestCount}});throw error;}
  bounded.throwIfAborted();
  if(!completeCohortMetadata(result.metadata,state,result.signals)){
    const denial=result.roadblocks.find(row=>DENIALS.has(Number(row.status)));
    if(denial)throw sourceErrorForHttp(denial.status,'Grocery access denial ended the complete-cohort observation',{details:{incidentPersisted:true,requestCount}});
    throw new Error('Production grocery collection did not verify its complete reviewed cohort');
  }
  const rows=result.signals.map(row=>silent({...row,sourceRuntimeId:louisianaAlaskaGroceryRuntimeId(state)}));
  const signals=currentRows(rows,bible);if(result.metadata.profileScope==='POSITIVE_EVIDENCE_ONLY'&&!signals.length)throw Error('Positive-only query profile has no current eligible positive evidence');
  const metadata={...result.metadata,sourceObservedAt:new Date(nowMs).toISOString(),cohortKey:louisianaAlaskaGroceryCohortKey(state),observation:'production_onsite_only',productionAlertDeliveryAllowed:false};
  await mkdir(cacheDir,{recursive:true});bounded.throwIfAborted();const temporary=cacheFile+'.'+randomUUID()+'.tmp';
  try{await writeFile(temporary,JSON.stringify({schemaVersion:1,cohortKey:louisianaAlaskaGroceryCohortKey(state),generatedAt:new Date(nowMs).toISOString(),signals:rows,metadata},null,2));bounded.throwIfAborted();renameSync(temporary,cacheFile);}finally{await rm(temporary,{force:true});}
  return{signals,roadblocks:result.roadblocks,metadata,accounting:{requestCount,bytes,elapsedMs:Date.now()-started,completeSnapshot:metadata.complete===true,profileScope:metadata.profileScope,negativeComplete:metadata.negativeComplete,unconfirmedNegativeQueryCount:metadata.unconfirmedNegativeQueryCount}};
}

export async function collectLouisianaAlaskaGroceryProductionState(config,bible,options={}){
  const state=config.id,startedAt=new Date().toISOString(),id=louisianaAlaskaGroceryRuntimeId(state),label=`${state} reviewed exact-store grocery inventory`;
  if(!louisianaAlaskaGroceryPromotionAllowed(state,options.lifecycleConfig||STATE_LIFECYCLE_CONFIG,{env:options.env||process.env,manifest:options.promotionManifest||manifests[state]}))return{
    state,label:config.label,tier:config.tier,strategy:config.strategy,cadence:config.cadence,startedAt,finishedAt:new Date().toISOString(),lastGoodAt:null,
    status:'not_promoted',stale:false,signals:[],roadblocks:[],sources:[],sourceResults:[],metadata:{blockedByPromotion:true,requestCount:0}};
  const budget=LOUISIANA_ALASKA_GROCERY_BUDGETS[state].sourceMs;let measuredRequests=0;
  const run=await runSourceAdapters([createSourceAdapter({id,label,url:'https://www.safeway.com/abs/pub/xapi/storeresolver/v2/all',
    metadata:{stateId:state,lane:'promoted_grocery_onsite'},execute:(_context,{signal})=>collectLouisianaAlaskaGroceryProductionSource(config,bible,{...options,...options.grocerySourceOptions,onRequest:()=>{measuredRequests++;},signal:collectionSignal(options.signal?AbortSignal.any([options.signal,signal]):signal)}),
    validate:value=>completeCohortMetadata(value?.metadata,state,value?.signals)&&Array.isArray(value.signals)?true:'Grocery source did not complete its reviewed cohort or qualify an explicit positive-only query profile',recordCount:value=>value.signals.length,
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
