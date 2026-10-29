import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {NEW_ENGLAND_RESEARCH_SOURCES,NEW_ENGLAND_NAMES} from './collectors/new-england-premises.mjs';
import {parseNewEnglandResearchInventory} from './collectors/new-england-research.mjs';
import {newEnglandProductionCohortKey,NEW_ENGLAND_PRODUCTION_BUDGETS} from './new-england-production-config.mjs';
import {fetchReviewedCityHiveText,readCityHiveIncidentJournal,persistCityHiveIncidentJournal,validateCityHiveIncidentJournal,CITYHIVE_DENIAL_STATUSES} from './collectors/central-cityhive-transport.mjs';
import {sourceErrorForHttp} from './sources/source-error.mjs';
import {collectionSignal,writeCollectionFile} from './core/collection-context.mjs';
const configs=new Map(Object.entries(NEW_ENGLAND_NAMES).map(([id,name])=>[id,Object.freeze({id,label:`${name} seven-cohort research`,tier:'B',active:false,strategy:'retailer_store_inventory',cadence:'shadow-only',
 sources:NEW_ENGLAND_RESEARCH_SOURCES.filter(s=>s.state===id).map(s=>({kind:'html',label:s.sourceLabel,url:s.categoryUrl,precisionOnly:true})),apiCandidates:[]})]));
export const newEnglandResearchSourceForState=state=>configs.get(state)||null;
export const newEnglandResearchLifecycleEntries=()=>Object.fromEntries(Object.entries(NEW_ENGLAND_NAMES).map(([id,name])=>[id,{customerLabel:name,sourceLabel:`${name} named pickup research`,publicStatus:'research_only',shadowEligible:true,lifecycle:'retailer_inventory_research',coverageTier:'sparse_live_store_inventory',refinementLevel:'store',inventoryAlertable:false,watchAlertable:false,customerSummary:'Inactive research at named premises only.'}]));
export async function collectNewEnglandResearchReport(config,bible,{env=process.env,signal,fetchText=fetchReviewedCityHiveText,
 incidentDir=path.resolve('out/source-incidents/new-england-cityhive'),reportDirectory=path.resolve('out/new-england-research',config?.id),persistJournal=persistCityHiveIncidentJournal}={}){
 if(env.BOURBON_SIGNAL_SHADOW_MODE!=='1'||configs.get(config?.id)!==config)throw Error('Exact isolated New England research configuration required');
 const state=config.id,startedAt=new Date().toISOString(),sources=NEW_ENGLAND_RESEARCH_SOURCES.filter(s=>s.state===state),receipts=[],signals=[],sourceReports=[],roadblocks=[],verified=new Set();
 const inherited=collectionSignal(signal),deadline=AbortSignal.timeout(NEW_ENGLAND_PRODUCTION_BUDGETS[state].sourceMs),bounded=inherited?AbortSignal.any([inherited,deadline]):deadline;
 const file=path.join(incidentDir,state+'.json');let journal=await readCityHiveIncidentJournal(file,state,NEW_ENGLAND_RESEARCH_SOURCES),requestCount=0;
 if(journal.inFlight)throw Error('Unresolved New England research attempt requires review');
 for(const source of sources){
  bounded.throwIfAborted();const url=new URL(source.categoryUrl);url.searchParams.delete('subtype');url.searchParams.set('ch-query',source.prioritySearchTerm||'barrel proof');
  let denied=false,status=0,observedAt=null;
  if(journal.hosts[source.hostname]){sourceReports.push({sourceRuntimeId:`research:${state.toLowerCase()}:${source.id}`,label:source.sourceLabel,url:url.href,ok:false,status:journal.hosts[source.hostname].httpStatus,checkedAt:journal.hosts[source.hostname].lastAttemptAt,matchedBottleCount:0,error:'Known denial remains held for review'});continue;}
  journal={...journal,inFlight:{attemptId:randomUUID(),startedAt:new Date().toISOString()}};await persistJournal(file,journal);
  const onResponse=async response=>{
   status=Number(response.status)||0;observedAt ||= new Date().toISOString();
   if(!denied&&CITYHIVE_DENIAL_STATUSES.has(status)){
    denied=true;const at=Date.parse(observedAt),retry=Math.max(0,Number(response.retryAfterSeconds)||0);
    const next={...journal,inFlight:null,hosts:{...journal.hosts,[source.hostname]:{httpStatus:status,lastAttemptAt:observedAt,nextAllowedAt:new Date(Math.min(8640000000000000,Math.max(at+86400000,at+retry*1000))).toISOString()}}};
    try{await persistJournal(file,validateCityHiveIncidentJournal(next,state,NEW_ENGLAND_RESEARCH_SOURCES));journal=next;}
    catch(error){throw sourceErrorForHttp(status,'Denied headers observed; failed incident write leaves durable unresolved latch',{cause:error,details:{incidentWriteFailed:true,retryAfterSeconds:retry}});}
    throw sourceErrorForHttp(status,'New England source denied; no retry or alternate route',{details:{incidentPersisted:true,retryAfterSeconds:retry}});
   }
  };
  try{
   requestCount++;const response=await fetchText(url.href,{reviewedSources:NEW_ENGLAND_RESEARCH_SOURCES,signal:bounded,timeoutMs:10000,maxBytes:2*1024*1024,onResponse});
   await onResponse(response);bounded.throwIfAborted();
   if(response.ok!==true||status!==200||response.url!==url.href)throw Error('Unredirected HTTP200 first-party response required');
   const body=Buffer.from(response.text||'');if(body.length<1||body.length>2*1024*1024)throw Error('Capture body outside source bound');
   const sha256=createHash('sha256').update(body).digest('hex'),artifactPath=`source-captures/${state}-${source.id.replace(/[^a-zA-Z0-9._-]/g,'_')}-${sha256.slice(0,12)}.txt`;
   const parsed=parseNewEnglandResearchInventory(body.toString('utf8'),source,bible,{observedAt,onVerifiedPremise:s=>verified.add(s.storeId)});
   await mkdir(path.dirname(path.join(reportDirectory,artifactPath)),{recursive:true});await writeCollectionFile(path.join(reportDirectory,artifactPath),body,{signal:bounded});
   receipts.push({url:url.href,finalUrl:response.url,status,observedAt,bytes:body.length,sha256,artifactPath});signals.push(...parsed);
   sourceReports.push({sourceRuntimeId:`research:${state.toLowerCase()}:${source.id}`,label:source.sourceLabel,url:url.href,ok:true,status,checkedAt:observedAt,matchedBottleCount:parsed.length,signalType:'retailer_store_inventory_result'});
   journal={...journal,inFlight:null};await persistJournal(file,journal);
  }catch(error){if(!denied){journal={...journal,inFlight:null};await persistJournal(file,journal);}sourceReports.push({sourceRuntimeId:`research:${state.toLowerCase()}:${source.id}`,label:source.sourceLabel,url:url.href,ok:false,status:Number(error.status)||status,checkedAt:observedAt,matchedBottleCount:0,error:error.message});roadblocks.push({state,source:source.sourceLabel,url:url.href,status:Number(error.status)||status,error:error.message});if(bounded.aborted)throw error;}
 }
 const selectedStores=sources.map(s=>s.storeId),complete=receipts.length===sources.length&&selectedStores.every(id=>verified.has(id))&&sourceReports.every(s=>s.ok);
 const finishedAt=new Date().toISOString(),report={state,label:config.label,tier:config.tier,strategy:config.strategy,cadence:config.cadence,startedAt,finishedAt,lastGoodAt:complete?finishedAt:null,status:complete?(signals.length?'useful':'monitored_no_current_inventory'):'blocked',stale:false,signals,sources:sourceReports,sourceResults:sourceReports.map(row=>({sourceId:row.sourceRuntimeId,sourceLabel:row.label,sourceUrl:row.url,ok:row.ok,status:row.ok?'success':'failed',httpStatus:row.status,checkedAt:row.checkedAt||null,error:row.error||null,alertable:false,inventoryAlertable:false,watchAlertable:false})),roadblocks,
 metadata:{scope:'closed_seven_premise_candidate_only',complete,cohortSha256:newEnglandProductionCohortKey(state),selectedStores,verifiedPremises:[...verified],receipts,requestCount,shadowOnly:true,productionActivationAllowed:false,customerDeliveryAllowed:false,
 origin:env.GITHUB_ACTIONS==='true'?{kind:'github_actions',repository:env.GITHUB_REPOSITORY,workflowRunId:env.GITHUB_RUN_ID,commitSha:env.GITHUB_SHA,runAttempt:env.GITHUB_RUN_ATTEMPT||'1'}:{kind:'local_fixture'}}};
 await mkdir(reportDirectory,{recursive:true});await writeCollectionFile(path.join(reportDirectory,'report.json'),JSON.stringify(report,null,2)+'\n',{signal:bounded});return report;
}
