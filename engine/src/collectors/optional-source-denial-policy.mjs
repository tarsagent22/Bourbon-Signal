import captured from '../../data/source-evidence/optional-denials-20261029.json' with {type:'json'};
import {markSignalStaleNonAlertable} from '../stale-signal-policy.mjs';

const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const OPTIONAL_SOURCE_DENIAL_POLICY=freeze(captured);

function host(url){try{const parsed=new URL(url);return parsed.protocol==='https:'&&!parsed.username&&!parsed.password?parsed.hostname:null;}catch{return null;}}

export function optionalDeniedSourceSkip(stateId,sourceKey,url){
  const route=captured.routes.find(row=>row.state===stateId&&row.sourceKey===sourceKey&&row.hostname===host(url));
  if(!route)return null;
  const report=captured.reports.find(row=>row.state===stateId);
  return {signals:[],requestCount:0,roadblocks:[{
    state:stateId,source:route.label,sourceRuntimeId:route.sourceRuntimeId,url:`https://${route.hostname}${route.requestPath}`,
    status:'source_policy_disabled',policyId:captured.id,sourceKey,attemptCount:0,historicalHttpStatus:route.httpStatus,
    checkedAt:route.attemptWindowFinishedAt,denialEvidence:{workflow:captured.workflow,report,
      attemptWindowStartedAt:route.attemptWindowStartedAt,attemptWindowFinishedAt:route.attemptWindowFinishedAt,
      clockSemantics:route.clockSemantics,httpStatus:route.httpStatus},
    error:`This optional source is parked after captured HTTP ${route.httpStatus}; no request was made.`,
    nextRoute:'Keep the exact denied source parked until a separate reviewed change establishes new access evidence. Healthy source lanes continue.',
  }]};
}

function deniedRouteForSignal(row){
  const state=row.state||row.stateCode,hostname=host(row.sourceUrl);
  return captured.routes.find(route=>route.state===state&&route.rowHosts.includes(hostname)
    &&((row.sourceChain||row.raw?.chain)===route.rowSourceChain||row.sourceLabel===route.label));
}

// Only these exact historical sources are demoted. Their original observation
// clocks survive, and neither missing caches nor force flags reactivate them.
export function retainParkedOptionalSourceRows(result,previous=[]){
  const rows=new Map((result.signals||[]).map(row=>[row.id,row]));
  for(const row of previous)if(deniedRouteForSignal(row)&&!rows.has(row.id))rows.set(row.id,row);
  return {...result,signals:[...rows.values()].map(row=>{
    const route=deniedRouteForSignal(row);if(!route)return row;
    return {...markSignalStaleNonAlertable(row,`source_policy_disabled:${captured.id}`),
      eligibleForDelivery:false,deliveryEligible:false,eligibleForEmail:false,eligibleForSms:false,
      sourcePolicyId:captured.id,historicalHttpStatus:route.httpStatus};
  })};
}
