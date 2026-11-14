import {readFile,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import wiManifest from '../../data/state-integration/WI.json' with {type:'json'};
import okManifest from '../../data/state-integration/OK.json' with {type:'json'};
import riManifest from '../../data/state-integration/RI.json' with {type:'json'};
import wyManifest from '../../data/state-integration/WY.json' with {type:'json'};
import dcManifest from '../../data/state-integration/DC.json' with {type:'json'};
import {STATE_LIFECYCLE_CONFIG} from '../state-lifecycle.mjs';
import {validateImmutablePromotionEvidence,evaluateStateControl} from '../reliability-policy.mjs';
import {collectionSignal,writeCollectionFile} from '../core/collection-context.mjs';
import {fetchReviewedCityHiveText as fetchProductionText,validateCityHiveIncidentJournal as validateJournal,persistCityHiveIncidentJournal as persistJournal} from './central-cityhive-transport.mjs';
import {sourceErrorForHttp} from '../sources/source-error.mjs';
import {createSourceAdapter} from '../sources/source-adapter.mjs';
import {runSourceAdapters} from '../sources/source-runner.mjs';
import {summarizeSourceResult,createSourceSkippedResult} from '../sources/source-result.mjs';
import {collectCentralCityHiveExpansion,centralCityHiveLibraryTier} from './central-cityhive-expansion.mjs';
import {CENTRAL_CITYHIVE_PRODUCTION_SOURCES,CENTRAL_CITYHIVE_PRODUCTION_COHORTS} from './central-cityhive-premises.mjs';
import {collectPearsonsDcProductionSource,isPearsonsDcProductionOnSiteSignal} from './pearsons-dc-production.mjs';
import {isCentralCityHiveProductionOnSiteSignal} from '../central-cityhive-policy.mjs';
import {CENTRAL_CITYHIVE_PRODUCTION_STATES,CENTRAL_CITYHIVE_PRODUCTION_BUDGETS,centralCityHiveProductionCohortKey,centralCityHiveProductionRuntimeId,centralCityHiveProductionSourceIds} from '../central-cityhive-production-config.mjs';

export const CENTRAL_CITYHIVE_CACHE_MAX_AGE_MS=30*60_000;
const manifests={WI:wiManifest,OK:okManifest,RI:riManifest,WY:wyManifest,DC:dcManifest},DAY=86_400_000,DENIALS=new Set([401,403,429,435]);
const sha=value=>createHash('sha256').update(value).digest('hex');
export function centralCityHiveSourceConfigHash(state,manifest=manifests[state]){
  if(!CENTRAL_CITYHIVE_PRODUCTION_STATES.includes(state)||!manifest)throw new Error('Unreviewed production CityHive state');
  return sha(JSON.stringify(Object.fromEntries(['lifecycle','collector','storeIdentity','sourceSemantics','customerPaths'].map(key=>[key,manifest[key]]))));
}
export function centralCityHiveProductionAllowed(state,config=STATE_LIFECYCLE_CONFIG,{manifest=manifests[state],env=process.env}={}){
  const entry=config?.states?.[state],evidence=entry?.promotionEvidence;
  const policy={...config?.reliabilityPolicy?.promotionPolicy,minShadowRuns:Math.max(3,Number(config?.reliabilityPolicy?.promotionPolicy?.minShadowRuns)||3),minCanaryRuns:Math.max(2,Number(config?.reliabilityPolicy?.promotionPolicy?.minCanaryRuns)||2)};
  return Boolean(CENTRAL_CITYHIVE_PRODUCTION_STATES.includes(state)&&config?.activeStates?.includes(state)
    &&entry?.publicStatus==='active'&&entry.promotionStage==='active'&&entry.inventoryAlertable===false&&entry.watchAlertable===false
    &&manifest?.state===state&&manifest.lifecycle?.publicStatus==='active'&&manifest.lifecycle.refinementLevel==='store'
    &&manifest.sourceSemantics?.inventoryAlertable===false&&manifest.sourceSemantics.watchAlertable===false
    &&manifest.collector?.cohortSha256===centralCityHiveProductionCohortKey(state)
    &&manifest.collector.cohortSha256===CENTRAL_CITYHIVE_PRODUCTION_COHORTS[state]
    &&JSON.stringify(manifest.collector.sourceIds)===JSON.stringify(centralCityHiveProductionSourceIds(state))
    &&Number(evidence?.shadowRuns)>=policy.minShadowRuns&&Number(evidence?.canaryRuns)>=policy.minCanaryRuns
    &&Number.isFinite(Date.parse(evidence?.verifiedAt||''))
    &&evidence.verticalSliceManifest===`engine/data/state-integration/${state}.json`&&evidence.fixtureContract===`engine/data/state-fixtures/${state}.json`
    &&evaluateStateControl(state,env).collect&&evaluateStateControl(state,env).publishCandidate
    &&validateImmutablePromotionEvidence(state,evidence,policy)
    &&evidence.immutableEvidence.provenance.repository==='tarsagent22/Bourbon-Signal'
    &&JSON.stringify(manifest.evidence?.immutablePromotionEvidence)===JSON.stringify(evidence.immutableEvidence)
    &&evidence.immutableEvidence.sourceConfigHash===centralCityHiveSourceConfigHash(state,manifest));
}
async function strictJson(file){try{const value=JSON.parse(await readFile(file,'utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw Error('State is not an object');return value;}catch(error){if(error.code==='ENOENT')return null;throw error;}}
function completeCohort(metadata,state){
  const sources=CENTRAL_CITYHIVE_PRODUCTION_SOURCES.filter(source=>source.state===state),ids=sources.map(source=>source.storeId);
  const complete=metadata?.complete===true&&JSON.stringify(metadata.selectedStores)===JSON.stringify(ids)
    &&metadata.verifiedPremises?.length===ids.length&&ids.every(id=>metadata.verifiedPremises.includes(id))
    &&metadata.requests?.length>=sources.length&&metadata.requests.length<=CENTRAL_CITYHIVE_PRODUCTION_BUDGETS[state].maxRequests
    &&metadata.requests.every(row=>row.ok===true&&row.status===200);
  if(!complete)return false;
  if(!['RI','WY','DC'].includes(state))return sources.every(source=>metadata.requests.some(row=>row.url===source.categoryUrl));
  if (metadata.requests.length !== CENTRAL_CITYHIVE_PRODUCTION_BUDGETS[state].maxRequests
    || new Set(metadata.requests.map(row => row.url)).size !== metadata.requests.length) return false;
  return sources.every(source => {
    const requests = metadata.requests.filter(row => row.sourceId === source.id);
    const priorityTerms = source.prioritySearchTerms?.length ? source.prioritySearchTerms : [source.prioritySearchTerm];
    if (!priorityTerms[0] || requests.length !== priorityTerms.length + 1) return false;
    const terms = requests.map(row => {
      const url = URL.parse(row.url);
      if (url?.origin !== source.baseUrl || url.pathname !== '/shop/' || url.hash || url.username || url.password
        || [...url.searchParams].length !== 2 || url.searchParams.get('merchant-id') !== source.merchantId) return null;
      return url.searchParams.get('ch-query');
    });
    return terms.every(Boolean) && priorityTerms.every(term => terms.includes(term));
  });
}
const silent=row=>({...row,canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,
  eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false});
function currentRows(rows,bible,nowMs){return rows.filter(row=>isCentralCityHiveProductionOnSiteSignal(row,{nowMs})
  ||isPearsonsDcProductionOnSiteSignal(row,{nowMs})).flatMap(row=>{
  const match=row.sourceRuntimeId==='dc:pearsons-shopify'?bible?.match?.(row.canonicalName):null;
  const tier=row.sourceRuntimeId==='dc:pearsons-shopify'
    ?(match?.confidence===1&&match.record?.id===row.canonicalBottleId&&match.record?.canonical===row.canonicalName?match.record.tier:null)
    :centralCityHiveLibraryTier(row,bible);
  return['limited','allocated','unicorn'].includes(tier)?[silent({...row,tier})]:[];
});}
function cacheMatches(cache,state,nowMs){
  const age=nowMs-Date.parse(cache?.generatedAt||'');
  return cache?.schemaVersion===1&&cache.state===state&&cache.cohortKey===centralCityHiveProductionCohortKey(state)
    &&Number.isFinite(age)&&age>=0&&age<=CENTRAL_CITYHIVE_CACHE_MAX_AGE_MS&&completeCohort(cache.metadata,state)
    &&Array.isArray(cache.signals)&&cache.signals.every(row=>row.state===state&&isCentralCityHiveProductionOnSiteSignal(row,{nowMs})
      &&nowMs-Date.parse(row.observedAt)<=CENTRAL_CITYHIVE_CACHE_MAX_AGE_MS);
}

export async function collectCentralCityHiveProductionSource(config,bible,{lifecycleConfig=STATE_LIFECYCLE_CONFIG,promotionManifest,
  env=process.env,fetchText=fetchProductionText,cacheDir=path.resolve('out/cache/central-cityhive-production'),
  incidentDir=path.resolve('out/source-incidents/central-cityhive'),signal,nowMs=Date.now(),sleep,cursorDir,
  forceLive=process.env.BOURBON_SIGNAL_FORCE_SOURCE_RUN==='1',timeoutMs,persistIncidentJournal=persistJournal,onRequest=()=>{}}={}){
  const state=config?.id;
  if(!CENTRAL_CITYHIVE_PRODUCTION_STATES.includes(state))throw Error('Unreviewed production CityHive state');
  if(!centralCityHiveProductionAllowed(state,lifecycleConfig,{manifest:promotionManifest||manifests[state],env}))return{
    signals:[],roadblocks:[],metadata:{complete:false,blockedByPromotion:true},accounting:{requestCount:0,bytes:0,elapsedMs:0,completeSnapshot:false}};
  const inherited=collectionSignal(signal);inherited?.throwIfAborted();
  const incidentFile=path.join(incidentDir,state+'.json'),cacheFile=path.join(cacheDir,state+'.json');
  let journal=validateJournal(await strictJson(incidentFile),state);
  if(journal.inFlight)throw Object.assign(Error('Unresolved prior CityHive observation; review the incident journal before another request'),{code:'CITYHIVE_UNRESOLVED_ATTEMPT'});
  const denied=Object.values(journal.hosts).find(entry=>Date.parse(entry.nextAllowedAt)>nowMs);
  if(denied)throw sourceErrorForHttp(denied.httpStatus,'CityHive host remains in durable denial cooldown',{details:{requestCount:0,nextAllowedAt:denied.nextAllowedAt,incidentPersisted:true}});
  await persistIncidentJournal(incidentFile,journal);
  const cached=await strictJson(cacheFile);
  inherited?.throwIfAborted();
  if(!forceLive&&cacheMatches(cached,state,nowMs)){inherited?.throwIfAborted();return{signals:currentRows(cached.signals,bible,nowMs),roadblocks:[],
    metadata:{...cached.metadata,cacheReused:true,sourceObservedAt:cached.generatedAt},accounting:{requestCount:0,bytes:0,elapsedMs:0,completeSnapshot:true}};}
  const max=CENTRAL_CITYHIVE_PRODUCTION_BUDGETS[state].sourceMs,budget=Number.isFinite(timeoutMs)&&timeoutMs>0?Math.min(timeoutMs,max):max;
  const deadline=AbortSignal.timeout(budget),bounded=inherited?AbortSignal.any([inherited,deadline]):deadline;
  journal={...journal,inFlight:{attemptId:randomUUID(),startedAt:new Date(nowMs).toISOString()}};
  // A failed denied-response write leaves this durable incident-only latch in
  // place. Another process cannot infer permission from an absent denial row.
  await persistIncidentJournal(incidentFile,journal);
  let lastDenied=null,denialPersisted=false,requestCount=0,bytes=0;const started=Date.now();
  const measured=async(url,options)=>{
    if (requestCount >= CENTRAL_CITYHIVE_PRODUCTION_BUDGETS[state].maxRequests) {
      throw Error('CityHive reached the reviewed request limit');
    }
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
    const result=await collectCentralCityHiveExpansion(config,bible,{fetchText:measured,observedAt:new Date(nowMs).toISOString(),nowMs,signal:bounded,sleep,cursorDir});
    bounded.throwIfAborted();if(!completeCohort(result.metadata,state))throw Error('Production CityHive collection did not verify its complete reviewed cohort');
    const cohort=centralCityHiveProductionCohortKey(state),rows=result.signals.map(row=>silent({...row,sourceRuntimeId:centralCityHiveProductionRuntimeId(state),
      sourceProductBinding:{...row.sourceProductBinding,productionOnSiteOnly:true,productionCohortSha256:cohort}}));
    const metadata={...result.metadata,recordsInspected:result.metadata.verifiedPremises.length,cohortKey:cohort,
      sourceObservedAt:new Date(nowMs).toISOString(),observation:'production_onsite_only',productionAlertDeliveryAllowed:false};
    await mkdir(cacheDir,{recursive:true});bounded.throwIfAborted();
    await writeCollectionFile(cacheFile,JSON.stringify({schemaVersion:1,state,cohortKey:cohort,generatedAt:metadata.sourceObservedAt,signals:rows,metadata},null,2),{signal:bounded});
    bounded.throwIfAborted();journal={...journal,inFlight:null};await persistIncidentJournal(incidentFile,journal);
    return{signals:currentRows(rows,bible,nowMs),roadblocks:[],metadata,accounting:{requestCount,bytes,elapsedMs:Date.now()-started,completeSnapshot:true}};
  }catch(error){
    if(!lastDenied){journal={...journal,inFlight:null};await persistIncidentJournal(incidentFile,journal);}
    if(lastDenied&&!error.status)throw sourceErrorForHttp(lastDenied.status,'CityHive denial preceded cancellation',{cause:error,details:{incidentPersisted:denialPersisted,requestCount}});
    throw error;
  }
}

export async function collectCentralCityHiveProductionState(config,bible,options={}){
  const state=config.id,id=centralCityHiveProductionRuntimeId(state),label=`${state} reviewed first-party pickup availability`,startedAt=new Date().toISOString();
  if(!centralCityHiveProductionAllowed(state,options.lifecycleConfig||STATE_LIFECYCLE_CONFIG,{manifest:options.promotionManifest||manifests[state],env:options.env||process.env}))return{
    state,label:config.label,startedAt,finishedAt:new Date().toISOString(),lastGoodAt:null,status:'not_promoted',stale:false,
    signals:[],sources:[],sourceResults:[],roadblocks:[],metadata:{blockedByPromotion:true,requestCount:0}};
  const budgets=CENTRAL_CITYHIVE_PRODUCTION_BUDGETS[state],citySource=CENTRAL_CITYHIVE_PRODUCTION_SOURCES.find(source=>source.state===state);
  let requests=0;const countRequest=()=>{if(requests>=Number(budgets.maxStateRequests||budgets.maxRequests))throw Error('DC reached its combined reviewed source request ceiling');requests++;};
  const cityAdapter=createSourceAdapter({id,label,url:citySource.baseUrl,timeoutMs:budgets.sourceMs,
    metadata:{stateId:state,lane:'promoted_cityhive_onsite'},execute:(_context,{signal})=>collectCentralCityHiveProductionSource(config,bible,{...options,...options.cityHiveSourceOptions,
      signal:collectionSignal(options.signal?AbortSignal.any([options.signal,signal]):signal),onRequest:countRequest}),
    validate:value=>value?.metadata?.complete===true&&Array.isArray(value.signals)?true:'Incomplete reviewed CityHive cohort',
    recordCount:value=>value.metadata.verifiedPremises.length,
  });
  const pearsonAdapter=createSourceAdapter({id:'dc:pearsons-shopify',label:"Pearson's DC reviewed Shopify pickup offer",
    url:'https://pearsonswine.com/products/blantons-single-barrel-bourbon-750ml',timeoutMs:budgets.pearsonsSourceMs,
    metadata:{stateId:state,lane:'promoted_pearsons_pickup_offer'},execute:(_context,{signal})=>collectPearsonsDcProductionSource({
      cohortSha256:centralCityHiveProductionCohortKey(state),bible,admissionPassed:true,nowMs:options.nowMs||Date.now(),
      signal:collectionSignal(options.signal?AbortSignal.any([options.signal,signal]):signal),onRequest:countRequest,
      ...options.pearsonsSourceOptions,
    }),validate:value=>value?.metadata?.complete===true&&Array.isArray(value.signals)&&value.signals.length===1
      ?true:'Pearson DC did not verify its current exact pickup offer',recordCount:value=>value.signals.length,
  });
  const stateBudget=budgets.stateMs,runnerOptions={...options.sourceRunnerOptions,previousResults:options.previousSourceResults,
    circuitBreaker:options.sourceCircuitBreaker,concurrency:1,perDomain:1,schedule:false,
    timeoutMs:Math.min(Number(options.sourceRunnerOptions?.timeoutMs)||stateBudget,stateBudget),maxAttempts:1};
  const cityRun=await runSourceAdapters([cityAdapter],{},runnerOptions),cityResult=cityRun.results[0];
  // Do not start the independent retailer after any CityHive failure/denial.
  // Both source results are required before this state emits any customer row.
  const pearsonRun=state==='DC'&&cityResult?.ok
    ?await runSourceAdapters([pearsonAdapter],{},runnerOptions):null;
  const runResults=state==='DC'
    ?[cityResult,...(pearsonRun?.results||[createSourceSkippedResult({adapter:pearsonAdapter,status:'skipped_after_cityhive_failure',
      now:new Date().toISOString(),error:new Error('Pearson was not requested after CityHive failed.')})])]
    :[cityResult];
  const finishedAt=new Date().toISOString(),allOk=runResults.length===(state==='DC'?2:1)&&runResults.every(source=>source.ok);
  const values=runResults.map(source=>source.ok?source.value:null),signals=allOk?values.flatMap(value=>value.signals||[]):[];
  const getObserved=value=>value?.metadata?.sourceObservedAt||value?.metadata?.cityhive?.sourceObservedAt||null;
  const sourceRows=runResults.map((source,index)=>{
    const value=values[index],isPearsons=source.sourceId==='dc:pearsons-shopify',meta=value?.metadata||{};
    const reportClock=isPearsons?meta.sourceObservedAt:(meta.sourceObservedAt||meta.cityhive?.sourceObservedAt||null);
    return{sourceRuntimeId:source.sourceId,label:source.sourceLabel,url:source.sourceUrl,ok:source.ok,
      status:source.error?.status||(source.ok?200:source.status),checkedAt:reportClock||source.checkedAt||finishedAt,lastGoodAt:reportClock,
      signalType:'retailer_store_inventory_result',matchedBottleCount:value?.signals?.length||0,error:source.error?.message||null};
  });
  const timestamps=values.map(getObserved).filter(Boolean).map(Date.parse).filter(Number.isFinite);
  const lastGoodAt=allOk&&timestamps.length?new Date(Math.min(...timestamps)).toISOString():null;
  const sourceResults=runResults.map((source,index)=>({...summarizeSourceResult(source),lastGoodAt:getObserved(values[index]),alertable:false,
    inventoryAlertable:false,watchAlertable:false}));
  const roadblocks=runResults.filter(source=>!source.ok).map(source=>({state,source:source.sourceLabel||label,sourceRuntimeId:source.sourceId,
    url:source.sourceUrl,status:source.error?.status||source.status,error:source.error?.message||'Reviewed DC source failed'}));
  return{state,label:config.label,tier:config.tier,strategy:config.strategy,cadence:config.cadence,startedAt,finishedAt,lastGoodAt,
    status:allOk?(signals.length?'useful':'monitored_no_current_inventory'):'blocked',stale:false,signals,
    sources:sourceRows,sourceResults,sourceCircuitState:{...cityRun.circuitState,...(pearsonRun?.circuitState||{})},roadblocks,
    metadata:{cityhive:values[0]?.metadata||null,pearsons:state==='DC'?values[1]?.metadata||null:null,requestCount:requests,
      allDeliveryDisabled:true,complete:allOk,requestBudget:Number(budgets.maxStateRequests||budgets.maxRequests)}};
}
