import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import policy from '../../data/source-evidence/georgia-goto-group-hold-20261029/policy.json' with {type:'json'};
import {GEORGIA_GOTOLIQUOR_STORES} from './georgia-retailer-surfaces.mjs';
import {markSignalStaleNonAlertable} from '../stale-signal-policy.mjs';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const GEORGIA_GOTO_GROUP_HOLD_POLICY=freeze(policy);
const group=()=>GEORGIA_GOTOLIQUOR_STORES.map(store=>({id:store.id,chain:store.chain,hostname:store.hostname,url:store.categoryUrl,label:store.sourceLabel}));
export function georgiaGoToGroupHold(state){
 if(state!=='GA')return null;
 assert.equal(createHash('sha256').update(JSON.stringify(group())).digest('hex'),policy.cohortSha256,'Changed GoTo source group requires renewed policy review before HTTP');
 return{signals:[],requestCount:0,metadata:{policyId:policy.id,reviewRequired:true,requestCount:0},roadblocks:[{
  state:'GA',source:'Georgia GoToLiquorStore exact-store inventory platform',sourceRuntimeId:'precision:ga',status:'source_policy_disabled',
  policyId:policy.id,reviewRequired:true,automaticExpiryAllowed:false,minimumReviewAt:policy.minimumReviewAt,
  requestCount:0,attemptCount:0,historicalHttpStatus:403,checkedAt:policy.report.sourceWindowFinishedAt,url:policy.observedUrls[0],
  denialEvidence:{workflow:policy.workflow,report:policy.report,earlierObservation:policy.earlierObservation,
    observedUrls:policy.observedUrls,observedSources:policy.observedSources,attemptedProbeCount:policy.attemptedProbeCount,
    skippedProbeCount:policy.skippedProbeCount,evidenceLimits:policy.evidenceLimits,scope:policy.scope},
  error:'This configured GoToLiquorStore lane is held for review after two captured representative HTTP403 failures; no request was made and the twelve skipped sources are not claimed denied.',
  nextRoute:'Keep this closed lane held until a separate reviewed access change. Do not try another configured merchant, hostname or cache as fresh stock. Independent Georgia CityHive and Lightspeed lanes remain permitted.'}]};
}
export function isHeldGeorgiaGoToRow(row){
 return (row?.state||row?.stateCode)==='GA'&&policy.closedGroup.some(source=>source.chain===(row.sourceChain||row.raw?.chain))
  &&row.eventType!=='retailer_store_location';
}
export function retainGeorgiaGoToHoldRows(result,previous=[]){
 const rows=new Map((result.signals||[]).map(row=>[row.id,row]));for(const row of previous)if(isHeldGeorgiaGoToRow(row)&&!rows.has(row.id))rows.set(row.id,row);
 return{...result,signals:[...rows.values()].map(row=>!isHeldGeorgiaGoToRow(row)?row:{...markSignalStaleNonAlertable(row,policy.id),
  eligibleForOnSite:false,eligibleForDropFeed:false,eligibleForWatch:false,eligibleForDelivery:false,deliveryEligible:false,
  eligibleForEmail:false,eligibleForSms:false,sourcePolicyId:policy.id,reviewRequired:true,historicalHttpStatus:403})};
}
