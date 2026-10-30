import {readFile,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import maManifest from '../../data/state-integration/MA.json' with {type:'json'};
import ctManifest from '../../data/state-integration/CT.json' with {type:'json'};
import riManifest from '../../data/state-integration/RI.json' with {type:'json'};
import {STATE_LIFECYCLE_CONFIG} from '../state-lifecycle.mjs';
import {validateImmutablePromotionEvidence,evaluateStateControl} from '../reliability-policy.mjs';
import {collectionSignal,writeCollectionFile} from '../core/collection-context.mjs';
import {sourceErrorForHttp} from '../sources/source-error.mjs';
import {createSourceAdapter} from '../sources/source-adapter.mjs';
import {runSourceAdapters} from '../sources/source-runner.mjs';
import {summarizeSourceResult} from '../sources/source-result.mjs';
import {newEnglandLibraryTier,collectNewEnglandCandidateInventory} from './new-england-production-inventory.mjs';
import {NEW_ENGLAND_RESEARCH_SOURCES as NEW_ENGLAND_EXPANSION_SOURCES,NEW_ENGLAND_PRODUCTION_COHORTS} from './new-england-premises.mjs';
import {isNewEnglandProductionOnSiteSignal} from '../new-england-policy.mjs';
import {NEW_ENGLAND_PRODUCTION_STATES,NEW_ENGLAND_PRODUCTION_BUDGETS,newEnglandProductionCohortKey,newEnglandProductionRuntimeId} from '../new-england-production-config.mjs';

export const NEW_ENGLAND_CACHE_MAX_AGE_MS=30*60_000;
const manifests={MA:maManifest,CT:ctManifest,RI:riManifest},DAY=86_400_000,DENIALS=new Set([401,403,429,435]);
import {fetchReviewedCityHiveText,readCityHiveIncidentJournal,validateCityHiveIncidentJournal,persistCityHiveIncidentJournal} from './central-cityhive-transport.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const fetchProductionText=(url,options)=>fetchReviewedCityHiveText(url,{...options,reviewedSources:NEW_ENGLAND_EXPANSION_SOURCES});
export function newEnglandSourceConfigHash(state,manifest=manifests[state]){
  if(!NEW_ENGLAND_PRODUCTION_STATES.includes(state)||!manifest)throw new Error('Unreviewed production CityHive state');
  return sha(JSON.stringify(Object.fromEntries(['lifecycle','collector','storeIdentity','sourceSemantics','customerPaths'].map(key=>[key,manifest[key]]))));
}
export function newEnglandProductionAllowed(state,config=STATE_LIFECYCLE_CONFIG,{manifest=manifests[state],env=process.env}={}){
  const entry=config?.states?.[state],evidence=entry?.promotionEvidence;
  const policy={...config?.reliabilityPolicy?.promotionPolicy,minShadowRuns:Math.max(3,Number(config?.reliabilityPolicy?.promotionPolicy?.minShadowRuns)||3),minCanaryRuns:Math.max(2,Number(config?.reliabilityPolicy?.promotionPolicy?.minCanaryRuns)||2)};
  return Boolean(NEW_ENGLAND_PRODUCTION_STATES.includes(state)&&config?.activeStates?.includes(state)
    &&entry?.publicStatus==='active'&&entry.promotionStage==='active'&&entry.inventoryAlertable===false&&entry.watchAlertable===false
    &&entry.coverageTier==='sparse_live_store_inventory'&&entry.refinementLevel==='store'
    &&manifest?.state===state&&manifest.lifecycle?.publicStatus==='active'&&manifest.lifecycle.refinementLevel==='store'
    &&manifest.lifecycle.coverageTier==='sparse_live_store_inventory'
    &&manifest.storeIdentity?.expectedKnownStores===NEW_ENGLAND_EXPANSION_SOURCES.filter(source=>source.state===state).length
    &&manifest.sourceSemantics?.inventoryAlertable===false&&manifest.sourceSemantics.watchAlertable===false
    &&manifest.collector?.cohortSha256===newEnglandProductionCohortKey(state)
    &&manifest.collector.cohortSha256===NEW_ENGLAND_PRODUCTION_COHORTS[state]
    &&JSON.stringify(manifest.collector.sourceIds)===JSON.stringify([newEnglandProductionRuntimeId(state)])
    &&Number(evidence?.shadowRuns)>=policy.minShadowRuns&&Number(evidence?.canaryRuns)>=policy.minCanaryRuns
    &&Number.isFinite(Date.parse(evidence?.verifiedAt||''))
    &&evidence.verticalSliceManifest===`engine/data/state-integration/${state}.json`&&evidence.fixtureContract===`engine/data/state-fixtures/${state}.json`
    &&evaluateStateControl(state,env).collect&&evaluateStateControl(state,env).publishCandidate
    &&validateImmutablePromotionEvidence(state,evidence,policy)
    &&evidence.immutableEvidence.sourceProof?.protocol==='bourbon-signal/new-england-first-party-cohort@1'
    &&evidence.immutableEvidence.sourceProof.cohortSha256===newEnglandProductionCohortKey(state)
    &&evidence.immutableEvidence.sourceProof.allSourceRunsComplete===true
    &&JSON.stringify(evidence.immutableEvidence.sourceProof.storeIds)===JSON.stringify(NEW_ENGLAND_EXPANSION_SOURCES.filter(source=>source.state===state).map(source=>source.storeId))
    &&evidence.immutableEvidence.provenance.repository==='tarsagent22/Bourbon-Signal'
    &&JSON.stringify(manifest.evidence?.immutablePromotionEvidence)===JSON.stringify(evidence.immutableEvidence)
    &&evidence.immutableEvidence.sourceConfigHash===newEnglandSourceConfigHash(state,manifest));
}
async function strictJson(file){try{const value=JSON.parse(await readFile(file,'utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw Error('State is not an object');return value;}catch(error){if(error.code==='ENOENT')return null;throw error;}}
const validateJournal=(value,state)=>validateCityHiveIncidentJournal(value,state,NEW_ENGLAND_EXPANSION_SOURCES);
const persistJournal=persistCityHiveIncidentJournal;
function completeCohort(metadata,state){
  const sources=NEW_ENGLAND_EXPANSION_SOURCES.filter(source=>source.state===state),ids=sources.map(source=>source.storeId);
  return metadata?.complete===true&&JSON.stringify(metadata.selectedStores)===JSON.stringify(ids)
    &&metadata.verifiedPremises?.length===ids.length&&ids.every(id=>metadata.verifiedPremises.includes(id))
    &&metadata.requests?.length>=sources.length&&metadata.requests.length<=NEW_ENGLAND_PRODUCTION_BUDGETS[state].maxRequests
    &&metadata.requests.every(row=>row.ok===true&&row.status===200)
    &&sources.every(source=>metadata.requests.some(row=>{const url=new URL(source.categoryUrl);url.searchParams.delete('subtype');url.searchParams.set('ch-query',source.prioritySearchTerm||'barrel proof');return row.url===url.href;}));
}
const silent=row=>({...row,canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,
  eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,eligibleForDelivery:false,deliveryEligible:false,eligibleForEmail:false,eligibleForSms:false});
function currentRows(rows,bible,nowMs){return rows.filter(row=>isNewEnglandProductionOnSiteSignal(row,{nowMs})).flatMap(row=>{
  const tier=newEnglandLibraryTier(row,bible);return['limited','allocated','unicorn'].includes(tier)?[silent({...row,tier})]:[];
});}
function cacheMatches(cache,state,nowMs){
  const age=nowMs-Date.parse(cache?.generatedAt||'');
  return cache?.schemaVersion===1&&cache.state===state&&cache.cohortKey===newEnglandProductionCohortKey(state)
    &&Number.isFinite(age)&&age>=0&&age<=NEW_ENGLAND_CACHE_MAX_AGE_MS&&completeCohort(cache.metadata,state)
    &&Array.isArray(cache.signals)&&cache.signals.every(row=>row.state===state&&isNewEnglandProductionOnSiteSignal(row,{nowMs})
      &&nowMs-Date.parse(row.observedAt)<=NEW_ENGLAND_CACHE_MAX_AGE_MS);
}

export async function collectNewEnglandProductionSource(config,bible,{lifecycleConfig=STATE_LIFECYCLE_CONFIG,promotionManifest,
  env=process.env,fetchText=fetchProductionText,cacheDir=path.resolve('out/cache/new-england-cityhive-production'),
  incidentDir=path.resolve('out/source-incidents/new-england-cityhive'),signal,nowMs=Date.now(),sleep,cursorDir,
  forceLive=process.env.BOURBON_SIGNAL_FORCE_SOURCE_RUN==='1',timeoutMs,persistIncidentJournal=persistJournal,onRequest=()=>{}}={}){
  const state=config?.id;
  if(!NEW_ENGLAND_PRODUCTION_STATES.includes(state))throw Error('Unreviewed production CityHive state');
  if(!newEnglandProductionAllowed(state,lifecycleConfig,{manifest:promotionManifest||manifests[state],env}))return{
    signals:[],roadblocks:[],metadata:{complete:false,blockedByPromotion:true},accounting:{requestCount:0,bytes:0,elapsedMs:0,completeSnapshot:false}};
  const inherited=collectionSignal(signal);inherited?.throwIfAborted();
  const incidentFile=path.join(incidentDir,state+'.json'),cacheFile=path.join(cacheDir,state+'.json');
  let journal=await readCityHiveIncidentJournal(incidentFile,state,NEW_ENGLAND_EXPANSION_SOURCES);
  if(journal.inFlight)throw Object.assign(Error('Unresolved prior CityHive observation; review the incident journal before another request'),{code:'CITYHIVE_UNRESOLVED_ATTEMPT'});
  const denied=Object.values(journal.hosts).find(Boolean);
  if(denied)throw sourceErrorForHttp(denied.httpStatus,'CityHive host remains under durable denial review hold',{details:{requestCount:0,nextAllowedAt:denied.nextAllowedAt,incidentPersisted:true,reviewRequired:true}});
  await persistIncidentJournal(incidentFile,journal);
  const cached=await strictJson(cacheFile);
  inherited?.throwIfAborted();
  if(!forceLive&&cacheMatches(cached,state,nowMs)){inherited?.throwIfAborted();return{signals:currentRows(cached.signals,bible,nowMs),roadblocks:[],
    metadata:{...cached.metadata,cacheReused:true,sourceObservedAt:cached.generatedAt},accounting:{requestCount:0,bytes:0,elapsedMs:0,completeSnapshot:true}};}
  const max=NEW_ENGLAND_PRODUCTION_BUDGETS[state].sourceMs,budget=Number.isFinite(timeoutMs)&&timeoutMs>0?Math.min(timeoutMs,max):max;
  const deadline=AbortSignal.timeout(budget),bounded=inherited?AbortSignal.any([inherited,deadline]):deadline;
  journal={...journal,inFlight:{attemptId:randomUUID(),startedAt:new Date(nowMs).toISOString()}};
  // A failed denied-response write leaves this durable incident-only latch in
  // place. Another process cannot infer permission from an absent denial row.
  await persistIncidentJournal(incidentFile,journal);
  let lastDenied=null,denialPersisted=false,requestCount=0,bytes=0;const started=Date.now();
  const measured=async(url,options)=>{
    const observeDenial=async response=>{
    if(DENIALS.has(Number(response.status))){
      const at=Math.max(nowMs,Date.now()),retry=Math.max(0,Number(response.retryAfterSeconds)||0),host=new URL(url).hostname;
      lastDenied={status:Number(response.status),retry};
      const next={...journal,inFlight:null,hosts:{...journal.hosts,[host]:{httpStatus:lastDenied.status,lastAttemptAt:new Date(at).toISOString(),
        nextAllowedAt:new Date(Math.min(8_640_000_000_000_000,Math.max(Date.parse(journal.hosts[host]?.nextAllowedAt)||0,at+DAY,at+retry*1000))).toISOString()}}};
      try{await persistIncidentJournal(incidentFile,validateJournal(next,state));journal=next;denialPersisted=true;}
      catch(error){throw sourceErrorForHttp(lastDenied.status,'CityHive denial journal write failed; unresolved durable attempt blocks further HTTP',{cause:error,details:{incidentWriteFailed:true,incidentErrorCode:error.code||null,unresolvedAttempt:true,retryAfterSeconds:retry,requestCount}});}
      throw sourceErrorForHttp(lastDenied.status,'CityHive host denied the observation',{details:{incidentPersisted:true,retryAfterSeconds:retry,requestCount}});
    }
    };
    bounded.throwIfAborted();requestCount++;onRequest();
    const response=await fetchText(url,{...options,signal:bounded,onResponse:observeDenial});bytes+=Buffer.byteLength(response.text||'');
    await observeDenial(response);
    if(response.ok){const requested=new URL(url),final=new URL(response.url);requested.searchParams.sort();final.searchParams.sort();if(requested.href!==final.href)throw Error('CityHive source redirected or omitted its first-party final URL');}
    return response;
  };
  try{
    const result=await collectNewEnglandCandidateInventory(config,bible,{fetchText:measured,signal:bounded});
    bounded.throwIfAborted();if(!completeCohort(result.metadata,state))throw Error('Production CityHive collection did not verify its complete reviewed cohort');
    const cohort=newEnglandProductionCohortKey(state),rows=result.signals.map(row=>silent({...row,sourceRuntimeId:newEnglandProductionRuntimeId(state),
      raw:{...row.raw,shadowOnly:false},sourceProductBinding:{...row.sourceProductBinding,shadowOnly:false,productionOnSiteOnly:true,productionCohortSha256:cohort}}));
    const metadata={...result.metadata,recordsInspected:result.metadata.verifiedPremises.length,cohortKey:cohort,
      sourceObservedAt:result.metadata.requests.at(-1).observedAt,observation:'production_onsite_only',productionAlertDeliveryAllowed:false};
    await mkdir(cacheDir,{recursive:true});bounded.throwIfAborted();
    await writeCollectionFile(cacheFile,JSON.stringify({schemaVersion:1,state,cohortKey:cohort,generatedAt:metadata.sourceObservedAt,signals:rows,metadata},null,2),{signal:bounded});
    bounded.throwIfAborted();journal={...journal,inFlight:null};await persistIncidentJournal(incidentFile,journal);
    return{signals:currentRows(rows,bible,Math.max(nowMs,Date.now())),roadblocks:[],metadata,accounting:{requestCount,bytes,elapsedMs:Date.now()-started,completeSnapshot:true}};
  }catch(error){
    if(!lastDenied){journal={...journal,inFlight:null};await persistIncidentJournal(incidentFile,journal);}
    if(lastDenied&&!error.status)throw sourceErrorForHttp(lastDenied.status,'CityHive denial preceded cancellation',{cause:error,details:{incidentPersisted:denialPersisted,requestCount}});
    throw error;
  }
}

export async function collectNewEnglandProductionState(config,bible,options={}){
  const state=config.id,id=newEnglandProductionRuntimeId(state),label=`${state} reviewed first-party pickup availability`,startedAt=new Date().toISOString();
  if(!newEnglandProductionAllowed(state,options.lifecycleConfig||STATE_LIFECYCLE_CONFIG,{manifest:options.promotionManifest||manifests[state],env:options.env||process.env}))return{
    state,label:config.label,startedAt,finishedAt:new Date().toISOString(),lastGoodAt:null,status:'not_promoted',stale:false,
    signals:[],sources:[],sourceResults:[],roadblocks:[],metadata:{blockedByPromotion:true,requestCount:0}};
  const budget=NEW_ENGLAND_PRODUCTION_BUDGETS[state].sourceMs;let requests=0;
  const run=await runSourceAdapters([createSourceAdapter({id,label,url:NEW_ENGLAND_EXPANSION_SOURCES.find(source=>source.state===state).baseUrl,
    metadata:{stateId:state,lane:'promoted_cityhive_onsite'},execute:(_context,{signal})=>collectNewEnglandProductionSource(config,bible,{...options,...options.newEnglandSourceOptions,
      signal:collectionSignal(options.signal?AbortSignal.any([options.signal,signal]):signal),onRequest:()=>{requests++;}}),
    validate:value=>value?.metadata?.complete===true&&Array.isArray(value.signals)?true:'Incomplete reviewed CityHive cohort',recordCount:value=>value.metadata.verifiedPremises.length,
  })],{}, {...options.sourceRunnerOptions,previousResults:options.previousSourceResults,circuitBreaker:options.sourceCircuitBreaker,
    concurrency:1,perDomain:1,schedule:false,timeoutMs:Math.min(Number(options.sourceRunnerOptions?.timeoutMs)||budget,budget),maxAttempts:1});
  const source=run.results[0],value=source.ok?source.value:null,finishedAt=new Date().toISOString();
  return{state,label:config.label,tier:config.tier,strategy:config.strategy,cadence:config.cadence,startedAt,finishedAt,lastGoodAt:value?.metadata.sourceObservedAt||null,
    status:source.ok?(value.signals.length?'useful':'monitored_no_current_inventory'):'blocked',stale:false,signals:value?.signals||[],
    sources:[{sourceRuntimeId:id,label,url:source.sourceUrl,ok:source.ok,status:source.error?.status||(source.ok?200:source.status),
      signalType:'retailer_store_inventory_result',matchedBottleCount:value?.signals.length||0,error:source.error?.message||null}],
    sourceResults:[{...summarizeSourceResult(source),lastGoodAt:value?.metadata.sourceObservedAt||null,alertable:false}],sourceCircuitState:run.circuitState,
    roadblocks:source.ok?[]:[{state,source:label,sourceRuntimeId:id,url:source.sourceUrl,status:source.error?.status||source.status,error:source.error?.message||'CityHive observation failed'}],
    metadata:{cityhive:value?.metadata||null,requestCount:value?.accounting?.requestCount??requests,allDeliveryDisabled:true}};
}
