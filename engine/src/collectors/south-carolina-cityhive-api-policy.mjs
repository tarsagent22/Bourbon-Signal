import policy from '../../data/source-evidence/sc-cityhive-api-hold-20261029/policy.json' with {type:'json'};
import {markSignalStaleNonAlertable} from '../stale-signal-policy.mjs';

const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const SC_CITYHIVE_API_HOLD_POLICY=freeze(policy);
export const SC_CITYHIVE_PUBLIC_API_URL=policy.requestedRoute.url;
function hold(source=null){
  return {ok:false,status:'source_policy_disabled',policyId:policy.id,reviewRequired:true,
    automaticExpiryAllowed:false,minimumReviewAt:policy.minimumReviewAt,requestCount:0,attemptCount:0,
    publicUrl:policy.requestedRoute.url,historicalHttpStatus:policy.historicalHttpStatus,
    checkedAt:policy.report.attemptWindowFinishedAt,
    error:'The recorded CityHive API route is held for review after captured HTTP429; no request was made.',
    ...(source?{sourceKey:source.id,source:source.label}:{}),
    denialEvidence:{workflow:policy.workflow,report:policy.report,evidenceLimits:policy.evidenceLimits},
    nextRoute:'Keep the exact API route and affected registered sources held until a separate reviewed access change. Do not retry or use another storefront for the held sources.'};
}
export function southCarolinaCityHiveApiRouteHold(url=SC_CITYHIVE_PUBLIC_API_URL){
  try{const parsed=new URL(url),route=policy.requestedRoute;
    return parsed.protocol===route.protocol&&parsed.hostname===route.hostname&&parsed.pathname===route.pathname
      &&!parsed.port&&!parsed.username&&!parsed.password?hold():null;
  }catch{return null;}
}
export function southCarolinaCityHiveSourceHold(source){
  const matched=policy.affectedSources.find(row=>row.id===source?.id);
  if(!matched)return null;
  try{return new URL(source.baseUrl).hostname===matched.hostname?hold(matched):null;}catch{return null;}
}
export function isHeldSouthCarolinaCityHiveRow(row){
  return (row?.state||row?.stateCode)==='SC'&&policy.affectedSources.some(source=>source.id===(row.sourceChain||row.raw?.chain));
}
export function retainHeldSouthCarolinaCityHiveRow(row){
  return {...markSignalStaleNonAlertable(row,policy.id),eligibleForOnSite:false,eligibleForDropFeed:false,
    eligibleForWatch:false,eligibleForDelivery:false,deliveryEligible:false,eligibleForEmail:false,eligibleForSms:false,
    sourcePolicyId:policy.id,reviewRequired:true,historicalHttpStatus:policy.historicalHttpStatus};
}
export function isHeldSouthCarolinaCityHiveRoadblock(row){
  return policy.affectedSources.some(source=>row?.source===source.label||row?.sourceKey===source.id)
    ||Boolean(row?.url&&southCarolinaCityHiveApiRouteHold(row.url));
}
