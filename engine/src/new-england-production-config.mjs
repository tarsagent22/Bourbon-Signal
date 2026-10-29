import {createHash} from 'node:crypto';
import {NEW_ENGLAND_RESEARCH_SOURCES,NEW_ENGLAND_NAMES,newEnglandCohortInputs} from './collectors/new-england-premises.mjs';
export const NEW_ENGLAND_PRODUCTION_STATES=Object.freeze(['MA','CT','RI']);
export const NEW_ENGLAND_PRODUCTION_BUDGETS=Object.freeze({MA:Object.freeze({sourceMs:40_000,stateMs:90_000,maxRequests:2}),CT:Object.freeze({sourceMs:50_000,stateMs:90_000,maxRequests:3}),RI:Object.freeze({sourceMs:40_000,stateMs:90_000,maxRequests:2})});
export const newEnglandProductionRuntimeId=state=>`${state.toLowerCase()}:new-england-cityhive`;
export function newEnglandProductionCohortKey(state){
  if(!NEW_ENGLAND_PRODUCTION_STATES.includes(state))throw Error('Unreviewed New England production state');
  return createHash('sha256').update(JSON.stringify(newEnglandCohortInputs(state))).digest('hex');
}
export const NEW_ENGLAND_PRODUCTION_CONFIGS=Object.freeze(NEW_ENGLAND_PRODUCTION_STATES.map(id=>{
  const sources=NEW_ENGLAND_RESEARCH_SOURCES.filter(source=>source.state===id),name=NEW_ENGLAND_NAMES[id];
  return Object.freeze({id,label:`Selected ${name} first-party retailer inventory`,tier:'B',
    strategy:'retailer_store_inventory',cadence:'30m',rareSignalTarget:true,
    value:`Pickup availability at ${sources.length} named ${name} stores only; binary availability is not a shelf count.`,
    precisionSource:{name:`${name} reviewed retailer precision collector`,url:sources[0].categoryUrl},
    sources:sources.map(source=>({kind:'html',name:source.sourceLabel,label:source.sourceLabel,url:source.categoryUrl,precisionOnly:true})),apiCandidates:[]});
}));
