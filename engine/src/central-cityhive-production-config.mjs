import {createHash} from 'node:crypto';
import {CENTRAL_CITYHIVE_PRODUCTION_SOURCES} from './collectors/central-cityhive-premises.mjs';
import {PEARSONS_DC_SOURCE} from './collectors/pearsons-dc-research.mjs';
export const CENTRAL_CITYHIVE_PRODUCTION_STATES=Object.freeze(['WI','OK','RI','KS','AR','MO','DC']);
export const CENTRAL_CITYHIVE_PRODUCTION_BUDGETS=Object.freeze({
  WI:Object.freeze({sourceMs:90_000,stateMs:150_000,maxRequests:5}),
  OK:Object.freeze({sourceMs:180_000,stateMs:240_000,maxRequests:10}),
  RI:Object.freeze({sourceMs:90_000,stateMs:150_000,maxRequests:7}),
  KS:Object.freeze({sourceMs:25_000,stateMs:30_000,maxRequests:6,requestTimeoutMs:3_000}),
  AR:Object.freeze({sourceMs:112_000,stateMs:125_000,maxRequests:10}),
  MO:Object.freeze({sourceMs:230_000,stateMs:240_000,maxRequests:20}),
  DC:Object.freeze({sourceMs:60_000,stateMs:120_000,maxRequests:4,maxStateRequests:5,pearsonsSourceMs:15_000,pearsonsMaxRequests:1}),
});
export const centralCityHiveProductionRuntimeId=state=>`${state.toLowerCase()}:central-cityhive`;
export const centralCityHiveProductionSourceIds=state=>state==='DC'
  ? Object.freeze([centralCityHiveProductionRuntimeId(state),'dc:pearsons-shopify'])
  : Object.freeze([centralCityHiveProductionRuntimeId(state)]);
export function centralCityHiveProductionCohortKey(state){
  if(!CENTRAL_CITYHIVE_PRODUCTION_STATES.includes(state))throw new Error('Unreviewed production CityHive state');
  const sources=CENTRAL_CITYHIVE_PRODUCTION_SOURCES.filter(source=>source.state===state);
  const payload=state==='DC'?['central-cityhive-onsite-v1',state,sources,{id:'pearsons-dc-production-v1',...PEARSONS_DC_SOURCE}]
    :['central-cityhive-onsite-v1',state,sources];
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
