import captured from '../../data/source-evidence/optional-suspensions-20261029/policy.json' with {type:'json'};
import {markSignalStaleNonAlertable} from '../stale-signal-policy.mjs';
import {SOURCE_RESULT_CONTRACT_VERSION} from '../sources/source-result.mjs';

const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const OPTIONAL_SOURCE_SUSPENSIONS=freeze(captured);
function exactUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
function findRoute(state,sourceKey,url){const exact=exactUrl(url);return exact&&captured.routes.find(row=>row.state===state&&row.sourceKey===sourceKey&&row.url===exact);}
function roadblock(route){
  const report=captured.reports.find(row=>row.id===route.reportId),workflow=captured.workflows.find(row=>row.runId===report.workflowRunId);
  return{state:route.state,source:route.label,sourceRuntimeId:route.sourceRuntimeId,url:route.url,status:'source_policy_disabled',
    policyId:captured.id,sourceKey:route.sourceKey,attemptCount:0,historicalHttpStatus:route.httpStatus,checkedAt:route.attemptWindowFinishedAt,
    denialEvidence:{workflow,report,attemptWindowStartedAt:route.attemptWindowStartedAt,attemptWindowFinishedAt:route.attemptWindowFinishedAt,
      clockSemantics:route.clockSemantics,httpStatus:route.httpStatus,...(route.representativeFailureContext?{evidenceScope:route.evidenceScope,
        representativeFailureContext:route.representativeFailureContext}:{})},
    error:`This optional source is suspended after captured HTTP ${route.httpStatus}; no request was made.`,
    nextRoute:'Keep this exact source suspended until a separate reviewed change supplies new access evidence. Healthy sibling sources continue.'};
}
export function optionalSuspensionSkip(state,sourceKey,url){const route=findRoute(state,sourceKey,url);return route?{signals:[],requestCount:0,roadblocks:[roadblock(route)]}:null;}
export function optionalSuspendedFetch(state,url){
  const exact=exactUrl(url),route=exact&&captured.routes.find(row=>row.kind==='configured'&&row.state===state&&row.url===exact);
  if(!route)return null;const block=roadblock(route);
  return{ok:false,status:'source_policy_disabled',url:exact,contentType:'source-runtime-policy-skip',text:'',error:block.error,
    policyId:captured.id,requestCount:0,historicalHttpStatus:route.httpStatus,checkedAt:route.attemptWindowFinishedAt,denialEvidence:block.denialEvidence};
}
function suspendedRow(row){
  return captured.routes.find(route=>{
    if((row.state||row.stateCode)!==route.state)return false;const url=exactUrl(row.sourceUrl);if(!url)return false;
    if(route.kind==='configured')return row.sourceRuntimeId===route.sourceRuntimeId&&url===route.url;
    return route.rowHosts.includes(new URL(url).hostname)&&route.rowSourceChains.includes(row.sourceChain||row.raw?.chain);
  });
}
export function retainSuspendedOptionalRows(result,previous=[]){
  const rows=new Map((result.signals||[]).map(row=>[row.id,row]));for(const row of previous)if(suspendedRow(row)&&!rows.has(row.id))rows.set(row.id,row);
  return{...result,signals:[...rows.values()].map(row=>{const route=suspendedRow(row);return !route?row:{...markSignalStaleNonAlertable(row,`source_policy_disabled:${captured.id}`),
    eligibleForDelivery:false,deliveryEligible:false,eligibleForEmail:false,eligibleForSms:false,sourcePolicyId:captured.id,historicalHttpStatus:route.httpStatus};})};
}
export function optionalSuspendedConfiguredSourceSkip(config,source,sourceId,{nowAt=new Date().toISOString(),previous}={}){
  const route=findRoute(config?.id,sourceId,source?.url);if(!route||route.kind!=='configured'||source.precisionOnly)return null;
  const block=roadblock(route),signals=retainSuspendedOptionalRows({signals:previous?.value?.signals||[],roadblocks:[]}).signals;
  return{signals,roadblocks:[block],sourceReport:{sourceRuntimeId:sourceId,label:source.label,url:source.url,ok:false,stale:true,
    sourceRuntimeStatus:'disabled',status:'source_policy_disabled',historicalHttpStatus:route.httpStatus,checkedAt:route.attemptWindowFinishedAt,
    lastGoodAt:previous?.lastGoodAt||null,reachabilityEligible:false,signalProducingEligible:false,contentType:'source-runtime-policy-skip',
    bytes:0,elapsedMs:0,signalType:'source_policy_disabled',matchedBottleCount:0,pdfLinkCount:0,error:block.error},
    sourceResult:{contractVersion:SOURCE_RESULT_CONTRACT_VERSION,sourceId,sourceLabel:source.label,sourceUrl:source.url,status:'disabled',ok:false,
      stale:true,quarantined:false,alertable:false,attemptCount:0,startedAt:nowAt,finishedAt:nowAt,checkedAt:route.attemptWindowFinishedAt,
      lastGoodAt:previous?.lastGoodAt||null,recordsInspected:null,metadata:{policyId:captured.id,denialEvidence:block.denialEvidence},error:null,
      sourceMetadata:{stateId:config.id,lane:'configured',policyId:captured.id},attempts:[],schedule:{sourceId,decision:'policy_disabled'}}};
}
