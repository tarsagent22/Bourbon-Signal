import {readFile,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import manifest from '../../data/state-integration/MN.json' with {type:'json'};
import {STATE_LIFECYCLE_CONFIG} from '../state-lifecycle.mjs';
import {validateImmutablePromotionEvidence,evaluateStateControl} from '../reliability-policy.mjs';
import {collectionSignal,writeCollectionFile} from '../core/collection-context.mjs';
import {fetchReviewedFirstPartyText,readCityHiveIncidentJournal,validateCityHiveIncidentJournal,persistCityHiveIncidentJournal,CITYHIVE_DENIAL_STATUSES} from './central-cityhive-transport.mjs';
import {sourceErrorForHttp} from '../sources/source-error.mjs';
import {createSourceAdapter} from '../sources/source-adapter.mjs';
import {runSourceAdapters} from '../sources/source-runner.mjs';
import {summarizeSourceResult} from '../sources/source-result.mjs';
import {collectCentralCityHiveExpansion,centralCityHiveLibraryTier} from './central-cityhive-expansion.mjs';
import {MINNESOTA_CITYHIVE_PRODUCTION_BUDGET as budget,MINNESOTA_CITYHIVE_PRODUCTION_COHORT_SHA256 as cohort,
  MINNESOTA_CITYHIVE_PRODUCTION_RUNTIME_ID as runtimeId,MINNESOTA_CITYHIVE_PRODUCTION_SOURCES as sources,
  MINNESOTA_CITYHIVE_PRODUCTION_STORE_IDS as storeIds,selectMinnesotaProductionSources,nextMinnesotaProductionCursor} from '../minnesota-cityhive-production-config.mjs';
import {isCentralCityHiveProductionOnSiteSignal} from '../central-cityhive-policy.mjs';

export const MINNESOTA_CITYHIVE_CACHE_MAX_AGE_MS=30*60_000;
const sha=value=>createHash('sha256').update(value).digest('hex');
const sourceById=new Map(sources.map(source=>[source.id,source]));
const entryKeys=['lifecycle','collector','storeIdentity','sourceSemantics','customerPaths'];

export function minnesotaCityHiveSourceConfigHash(value=manifest){
  if(value?.state!=='MN')throw Error('Minnesota promotion requires the reviewed MN manifest');
  return sha(JSON.stringify(Object.fromEntries(entryKeys.map(key=>[key,value[key]]))));
}

export function minnesotaCityHiveProductionAllowed(config=STATE_LIFECYCLE_CONFIG,{promotionManifest=manifest,env=process.env}={}){
  const entry=config?.states?.MN,evidence=entry?.promotionEvidence;
  const policy={...config?.reliabilityPolicy?.promotionPolicy,minShadowRuns:Math.max(3,Number(config?.reliabilityPolicy?.promotionPolicy?.minShadowRuns)||3),
    minCanaryRuns:Math.max(2,Number(config?.reliabilityPolicy?.promotionPolicy?.minCanaryRuns)||2)};
  const control=evaluateStateControl('MN',env);
  return Boolean(config?.activeStates?.includes('MN')&&entry?.publicStatus==='active'&&entry.promotionStage==='active'
    &&entry.inventoryAlertable===false&&entry.watchAlertable===false&&control.collect&&control.publishCandidate
    &&promotionManifest?.state==='MN'&&promotionManifest.lifecycle?.publicStatus==='active'
    &&promotionManifest.lifecycle.refinementLevel==='store'&&promotionManifest.lifecycle.coverageTier==='sparse_live_store_inventory'
    &&promotionManifest.sourceSemantics?.inventoryAlertable===false&&promotionManifest.sourceSemantics.watchAlertable===false
    &&promotionManifest.collector?.cohortSha256===cohort&&JSON.stringify(promotionManifest.collector.sourceIds)===JSON.stringify([runtimeId])
    &&promotionManifest.storeIdentity?.mode==='exact_reviewed_merchant_and_premises'&&promotionManifest.storeIdentity.expectedKnownStores===sources.length
    &&Number(evidence?.shadowRuns)>=policy.minShadowRuns&&Number(evidence?.canaryRuns)>=policy.minCanaryRuns
    &&Number.isFinite(Date.parse(evidence?.verifiedAt||''))
    &&evidence.verticalSliceManifest==='engine/data/state-integration/MN.json'&&evidence.fixtureContract==='engine/data/state-fixtures/MN.json'
    &&validateImmutablePromotionEvidence('MN',evidence,policy)
    &&evidence.immutableEvidence.provenance.repository==='tarsagent22/Bourbon-Signal'
    &&JSON.stringify(promotionManifest.evidence?.immutablePromotionEvidence)===JSON.stringify(evidence.immutableEvidence)
    &&evidence.immutableEvidence.sourceConfigHash===minnesotaCityHiveSourceConfigHash(promotionManifest));
}

export function isMinnesotaCityHiveProductionOnSiteSignal(row,{nowMs=Date.now()}={}){
  return row?.state==='MN'&&isCentralCityHiveProductionOnSiteSignal(row,{nowMs});
}

function silent(row){return{...row,canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,eligibleForOnSite:true,
  eligibleForDropFeed:true,eligibleForWatch:false,eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false};}
function strictObject(value,label){if(!value||typeof value!=='object'||Array.isArray(value))throw Error(`${label} must be an object`);return value;}
async function readJson(file){try{return strictObject(JSON.parse(await readFile(file,'utf8')),`Existing ${path.basename(file)}`);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
function validateCursor(value){
  if(value===null)return{schemaVersion:1,state:'MN',cohortSha256:cohort,cursor:0,completedRotations:0};
  if(value.schemaVersion!==1||value.state!=='MN'||value.cohortSha256!==cohort||!Number.isSafeInteger(value.cursor)
    ||value.cursor<0||value.cursor>=sources.length||!Number.isSafeInteger(value.completedRotations)||value.completedRotations<0
    ||Object.keys(value).some(key=>!['schemaVersion','state','cohortSha256','cursor','completedRotations','updatedAt'].includes(key)))throw Error('Minnesota rotation cursor is malformed or belongs to another cohort');
  return value;
}
function completeObservation(metadata,selected){
  const selectedIds=selected.map(source=>source.storeId),requestRows=metadata?.requests;
  if(metadata?.complete!==true||JSON.stringify(metadata.selectedStores)!==JSON.stringify(selectedIds)
    ||metadata.verifiedPremises?.length!==selected.length||selectedIds.some(id=>!metadata.verifiedPremises.includes(id))
    ||!Array.isArray(requestRows)||requestRows.length!==selected.length*2||requestRows.length>budget.maxRequests
    ||requestRows.some(row=>row.ok!==true||row.status!==200))return false;
  return selected.every(source=>{
    const requests=requestRows.filter(row=>row.sourceId===source.id);
    if(requests.length!==2)return false;
    return requests.every(row=>{
      try{const url=new URL(row.url),params=[...url.searchParams];return url.origin===source.baseUrl&&url.pathname==='/shop/'&&!url.hash
        &&!url.username&&!url.password&&params.length===2&&url.searchParams.get('merchant-id')===source.merchantId
        &&Boolean(url.searchParams.get('ch-query')?.trim())&&url.searchParams.get('ch-query').length<=120;}
      catch{return false;}
    });
  });
}
function currentRows(rows,bible,nowMs){return rows.filter(row=>isMinnesotaCityHiveProductionOnSiteSignal(row,{nowMs})).flatMap(row=>{
  const tier=centralCityHiveLibraryTier(row,bible);return['limited','allocated','unicorn'].includes(tier)?[silent({...row,tier})]:[];
});}
function cacheMatches(value,nowMs){
  const age=nowMs-Date.parse(value?.generatedAt||'');
  return value?.schemaVersion===1&&value.state==='MN'&&value.cohortSha256===cohort&&Number.isFinite(age)&&age>=0&&age<=MINNESOTA_CITYHIVE_CACHE_MAX_AGE_MS
    &&Array.isArray(value.selectedStores)&&value.selectedStores.length>=1&&value.selectedStores.length<=7
    &&value.selectedStores.every(id=>storeIds.includes(id))&&completeObservation(value.metadata,selectByStoreIds(value.selectedStores))
    &&validStoreObservations(value.observationsByStore,nowMs)!==null
    &&Array.isArray(value.signals)&&value.signals.every(row=>isMinnesotaCityHiveProductionOnSiteSignal(row,{nowMs}));
}
function selectByStoreIds(ids){return ids.map(id=>sources.find(source=>source.storeId===id)).filter(Boolean);}
function validStoreObservations(value,nowMs){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const result={};
  for(const [storeId,row] of Object.entries(value)){
    const age=nowMs-Date.parse(row?.observedAt||'');
    if(!storeIds.includes(storeId)||!row||Object.keys(row).some(key=>!['status','observedAt'].includes(key))
      ||!['positive','no_current_positive'].includes(row.status)||!Number.isFinite(age)||age<0||age>2*60*60_000)return null;
    result[storeId]={status:row.status,observedAt:row.observedAt};
  }
  return result;
}
function reusableHistory(value,nowMs){
  const age=nowMs-Date.parse(value?.generatedAt||'');
  if(value?.schemaVersion!==1||value.state!=='MN'||value.cohortSha256!==cohort||!Number.isFinite(age)||age<0||age>2*60*60_000
    ||!Array.isArray(value.selectedStores)||value.selectedStores.length<1||value.selectedStores.length>7
    ||new Set(value.selectedStores).size!==value.selectedStores.length||value.selectedStores.some(id=>!storeIds.includes(id))
    ||!completeObservation(value.metadata,selectByStoreIds(value.selectedStores))
    ||!Array.isArray(value.signals))return null;
  const observations=validStoreObservations(value.observationsByStore,nowMs);
  if(observations===null||!value.signals.every(row=>isMinnesotaCityHiveProductionOnSiteSignal(row,{nowMs})))return null;
  return{observations,signals:value.signals};
}

export async function collectMinnesotaCityHiveProductionSource(config,bible,{lifecycleConfig=STATE_LIFECYCLE_CONFIG,promotionManifest=manifest,env=process.env,
  fetchText=fetchReviewedFirstPartyText,cacheFile=path.resolve('out/cache/minnesota-cityhive-production/MN.json'),
  cursorFile=path.resolve('out/cursors/minnesota-cityhive-production/MN.json'),
  incidentFile=path.resolve('out/research-source-attempts/central-cityhive-journals/MN.json'),signal,nowMs=Date.now(),sleep,
  timeoutMs,persistIncidentJournal=persistCityHiveIncidentJournal,forceLive=false,onRequest=()=>{}}={}){
  if(config?.id!=='MN')throw Error('Minnesota CityHive production collector requires MN');
  if(!minnesotaCityHiveProductionAllowed(lifecycleConfig,{promotionManifest,env}))return{signals:[],roadblocks:[],metadata:{complete:false,blockedByPromotion:true},
    accounting:{requestCount:0,bytes:0,elapsedMs:0,completeSnapshot:false}};
  const inherited=collectionSignal(signal);inherited?.throwIfAborted();
  let journal=validateCityHiveIncidentJournal(await readJson(incidentFile),'MN',sources);
  if(journal.inFlight)throw Object.assign(Error('Unresolved prior Minnesota CityHive observation; review incident journal before another request'),{code:'CITYHIVE_UNRESOLVED_ATTEMPT'});
  const denial=Object.values(journal.hosts).find(row=>Date.parse(row.nextAllowedAt)>nowMs);
  if(denial)throw sourceErrorForHttp(denial.httpStatus,'Minnesota CityHive host remains in durable denial cooldown',{details:{requestCount:0,nextAllowedAt:denial.nextAllowedAt,incidentPersisted:true}});
  await persistIncidentJournal(incidentFile,journal);
  const cached=await readJson(cacheFile),history=reusableHistory(cached,nowMs);inherited?.throwIfAborted();
  if(!forceLive&&cacheMatches(cached,nowMs))return{signals:currentRows(cached.signals,bible,nowMs),roadblocks:[],
    metadata:{...cached.metadata,cacheReused:true,sourceObservedAt:cached.generatedAt},accounting:{requestCount:0,bytes:0,elapsedMs:0,completeSnapshot:true}};
  const cursor=validateCursor(await readJson(cursorFile)),selected=selectMinnesotaProductionSources(cursor.cursor),selectedIds=selected.map(source=>source.id);
  const allowance=Math.min(Number.isFinite(timeoutMs)&&timeoutMs>0?timeoutMs:budget.sourceMs,budget.sourceMs),deadline=AbortSignal.timeout(allowance);
  const bounded=inherited?AbortSignal.any([inherited,deadline]):deadline;
  journal={...journal,inFlight:{attemptId:randomUUID(),startedAt:new Date(nowMs).toISOString()}};
  await persistIncidentJournal(incidentFile,journal);
  let requests=0,bytes=0,lastDenied=null,started=Date.now();
  const measured=async(url,options={})=>{
    if(requests>=budget.maxRequests)throw Error('Minnesota CityHive reached the reviewed per-run request limit');
    const parsed=new URL(url),source=selected.find(item=>item.baseUrl===parsed.origin&&parsed.searchParams.get('merchant-id')===item.merchantId);
    if(!source||parsed.pathname!=='/shop/'||parsed.hash||parsed.username||parsed.password||[...parsed.searchParams].length!==2
      ||!parsed.searchParams.get('ch-query')?.trim()||parsed.searchParams.get('ch-query').length>120)throw Error('Minnesota CityHive request is outside the exact reviewed merchant query');
    const observe=async response=>{
      if(!CITYHIVE_DENIAL_STATUSES.has(Number(response.status)))return;
      lastDenied={status:Number(response.status),retry:Number(response.retryAfterSeconds)||0};const at=Math.max(nowMs,Date.now()),host=source.hostname;
      const next={...journal,inFlight:null,hosts:{...journal.hosts,[host]:{httpStatus:lastDenied.status,lastAttemptAt:new Date(at).toISOString(),
        nextAllowedAt:new Date(Math.max(Date.parse(journal.hosts[host]?.nextAllowedAt)||0,at+86_400_000,lastDenied.retry*1000+at)).toISOString()}}};
      try{await persistIncidentJournal(incidentFile,validateCityHiveIncidentJournal(next,'MN',sources));journal=next;}
      catch(error){throw sourceErrorForHttp(lastDenied.status,'Minnesota CityHive denial journal write failed; unresolved attempt blocks further HTTP',{cause:error,details:{unresolvedAttempt:true,requestCount:requests}});}
      throw sourceErrorForHttp(lastDenied.status,'Minnesota CityHive host denied the observation',{details:{incidentPersisted:true,requestCount:requests}});
    };
    bounded.throwIfAborted();requests++;onRequest();
    const response=await fetchText(url,{...options,signal:bounded,maxTimeoutMs:10_000,timeoutMs:10_000,reviewedSources:selected,
      isAllowedUrl:value=>value.origin===source.baseUrl&&value.pathname==='/shop/'&&[...value.searchParams].length===2
        &&value.searchParams.get('merchant-id')===source.merchantId&&Boolean(value.searchParams.get('ch-query')?.trim())&&value.searchParams.get('ch-query').length<=120,
      onResponse:observe});
    await observe(response);bytes+=Buffer.byteLength(response.text||'');
    if(response.ok){const requested=new URL(url),final=new URL(response.url);requested.searchParams.sort();final.searchParams.sort();if(requested.href!==final.href)throw Error('Minnesota CityHive source redirected or changed its exact query URL');}
    return response;
  };
  try{
    const observedAt=new Date(nowMs).toISOString();
    const result=await collectCentralCityHiveExpansion(config,bible,{fetchText:measured,observedAt,nowMs,signal:bounded,sleep,sourceIds:selectedIds});
    bounded.throwIfAborted();if(!completeObservation(result.metadata,selected))throw Error('Minnesota CityHive rotation did not verify its complete selected premises');
    const rows=result.signals.map(row=>silent({...row,sourceRuntimeId:runtimeId,sourceProductBinding:{...row.sourceProductBinding,
      productionOnSiteOnly:true,productionCohortSha256:cohort}}));
    const observations={...(history?.observations||{})};
    for(const source of selected)observations[source.storeId]={status:rows.some(row=>row.storeId===source.storeId)?'positive':'no_current_positive',observedAt};
    const retained=(history?.signals||[]).filter(row=>!selected.some(source=>source.storeId===row.storeId));
    const combinedSignals=[...retained,...rows];
    const nextCursor=nextMinnesotaProductionCursor(cursor.cursor),rotationCompleted=nextCursor<cursor.cursor;
    const freshObservedStoreCount=Object.keys(observations).length;
    const metadata={...result.metadata,sourceObservedAt:observedAt,cohortSha256:cohort,fullCohortStoreCount:sources.length,
      rotationBatchSize:selected.length,rotationIndex:cursor.cursor,rotationCompleted,freshObservedStoreCount,
      completeFullCohort:freshObservedStoreCount===sources.length,
      observation:'production_onsite_only',productionAlertDeliveryAllowed:false};
    await mkdir(path.dirname(cacheFile),{recursive:true});bounded.throwIfAborted();
    await writeCollectionFile(cacheFile,JSON.stringify({schemaVersion:1,state:'MN',cohortSha256:cohort,generatedAt:observedAt,
      selectedStores:metadata.selectedStores,observationsByStore:observations,signals:combinedSignals,metadata},null,2),{signal:bounded});
    await mkdir(path.dirname(cursorFile),{recursive:true});
    await writeCollectionFile(cursorFile,JSON.stringify({schemaVersion:1,state:'MN',cohortSha256:cohort,cursor:nextCursor,
      completedRotations:cursor.completedRotations+(rotationCompleted?1:0),updatedAt:observedAt},null,2),{signal:bounded});
    bounded.throwIfAborted();journal={...journal,inFlight:null};await persistIncidentJournal(incidentFile,journal);
    return{signals:currentRows(combinedSignals,bible,nowMs),roadblocks:[],metadata,accounting:{requestCount:requests,bytes,elapsedMs:Date.now()-started,completeSnapshot:true}};
  }catch(error){
    if(!lastDenied){journal={...journal,inFlight:null};await persistIncidentJournal(incidentFile,journal);}
    if(lastDenied&&!error.status)throw sourceErrorForHttp(lastDenied.status,'Minnesota CityHive denial preceded cancellation',{cause:error,details:{incidentPersisted:true,requestCount:requests}});
    throw error;
  }
}

export async function collectMinnesotaCityHiveProductionState(config,bible,options={}){
  const label='Minnesota reviewed first-party pickup availability',startedAt=new Date().toISOString();
  if(!minnesotaCityHiveProductionAllowed(options.lifecycleConfig||STATE_LIFECYCLE_CONFIG,{promotionManifest:options.promotionManifest||manifest,env:options.env||process.env}))return{
    state:'MN',label:config.label,startedAt,finishedAt:new Date().toISOString(),lastGoodAt:null,status:'not_promoted',stale:false,
    signals:[],sources:[],sourceResults:[],roadblocks:[],metadata:{blockedByPromotion:true,requestCount:0}};
  let requests=0;
  const run=await runSourceAdapters([createSourceAdapter({id:runtimeId,label,url:sources[0].baseUrl,
    metadata:{stateId:'MN',lane:'promoted_cityhive_onsite',cohortSha256:cohort},execute:(_context,{signal})=>collectMinnesotaCityHiveProductionSource(config,bible,
      {...options,signal:collectionSignal(options.signal?AbortSignal.any([options.signal,signal]):signal),onRequest:()=>{requests++;}}),
    validate:value=>value?.metadata?.complete===true&&Array.isArray(value.signals)?true:'Incomplete reviewed Minnesota CityHive rotation',
    recordCount:value=>value.metadata.verifiedPremises.length})],{}, {...options.sourceRunnerOptions,previousResults:options.previousSourceResults,
      circuitBreaker:options.sourceCircuitBreaker,concurrency:1,perDomain:1,schedule:false,timeoutMs:Math.min(Number(options.sourceRunnerOptions?.timeoutMs)||budget.sourceMs,budget.sourceMs),maxAttempts:1});
  const source=run.results[0],value=source.ok?source.value:null,finishedAt=new Date().toISOString();
  return{state:'MN',label:config.label,tier:config.tier,strategy:config.strategy,cadence:config.cadence,startedAt,finishedAt,
    lastGoodAt:value?.metadata.sourceObservedAt||null,status:source.ok?(value.signals.length?'useful':'monitored_no_current_inventory'):'blocked',stale:false,
    signals:value?.signals||[],sources:[{sourceRuntimeId:runtimeId,label,url:source.sourceUrl,ok:source.ok,status:source.error?.status||(source.ok?200:source.status),
      signalType:'retailer_store_inventory_result',matchedBottleCount:value?.signals.length||0,error:source.error?.message||null}],
    sourceResults:[{...summarizeSourceResult(source),lastGoodAt:value?.metadata.sourceObservedAt||null,alertable:false}],sourceCircuitState:run.circuitState,
    roadblocks:source.ok?[]:[{state:'MN',source:label,sourceRuntimeId:runtimeId,url:source.sourceUrl,status:source.error?.status||source.status,
      error:source.error?.message||'Minnesota CityHive observation failed'}],metadata:{cityhive:value?.metadata||null,requestCount:value?.accounting?.requestCount??requests,allDeliveryDisabled:true}};
}
