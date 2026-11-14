import {createHash} from 'node:crypto';
import {CENTRAL_CITYHIVE_PRODUCTION_SOURCES} from './collectors/central-cityhive-premises.mjs';
import deEcwid from '../data/de-ecwid-research-source.json' with {type:'json'};
export const CENTRAL_CITYHIVE_PRODUCTION_STATES=Object.freeze(['WI','OK','RI','KS','AR','MO','MD','DE']);
export const CENTRAL_CITYHIVE_PRODUCTION_BUDGETS=Object.freeze({
  WI:Object.freeze({sourceMs:90_000,stateMs:150_000,maxRequests:5}),
  OK:Object.freeze({sourceMs:180_000,stateMs:240_000,maxRequests:10}),
  RI:Object.freeze({sourceMs:90_000,stateMs:150_000,maxRequests:7}),
  KS:Object.freeze({sourceMs:25_000,stateMs:30_000,maxRequests:6,requestTimeoutMs:3_000}),
  AR:Object.freeze({sourceMs:112_000,stateMs:125_000,maxRequests:10}),
  MO:Object.freeze({sourceMs:230_000,stateMs:240_000,maxRequests:20}),
  MD:Object.freeze({sourceMs:50_000,stateMs:60_000,maxRequests:8,requestTimeoutMs:4_000}),
  DE:Object.freeze({sourceMs:40_000,stateMs:55_000,maxRequests:6,requestTimeoutMs:4_000}),
});
export const centralCityHiveProductionRuntimeId=state=>`${state.toLowerCase()}:central-cityhive`;
export function centralCityHiveProductionCohortKey(state){
  if(!CENTRAL_CITYHIVE_PRODUCTION_STATES.includes(state))throw new Error('Unreviewed production CityHive state');
  const cohort=['central-cityhive-onsite-v1',state,CENTRAL_CITYHIVE_PRODUCTION_SOURCES.filter(source=>source.state===state)];
  if(state==='DE')cohort.push({platform:'ecwid-first-party-pickup',source:deEcwid.source,product:deEcwid.product,
    runtimeId:`de:ecwid-pickup`,quantitySemantics:'binary_retailer_orderable_no_exact_count'});
  return createHash('sha256').update(JSON.stringify(cohort)).digest('hex');
}
