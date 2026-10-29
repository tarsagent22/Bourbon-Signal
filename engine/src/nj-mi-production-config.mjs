import {createHash} from 'node:crypto';
import {NJ_MI_CANDIDATE_PREMISES,NJ_MI_RESEARCH_NAMES} from './collectors/nj-mi-research-premises.mjs';
export const NJ_MI_PRODUCTION_STATES=Object.freeze(['NJ','MI']);
export const NJ_MI_PRODUCTION_BUDGETS=Object.freeze({NJ:Object.freeze({sourceMs:60_000,stateMs:120_000,maxRequests:4}),MI:Object.freeze({sourceMs:20_000,stateMs:60_000,maxRequests:1})});
export const njMiProductionRuntimeId=state=>`${state.toLowerCase()}:nj-mi-cityhive`;
export function njMiProductionCohortKey(state){
  if(!NJ_MI_PRODUCTION_STATES.includes(state))throw Error('Unreviewed NJ/MI production state');
  return createHash('sha256').update(JSON.stringify(['nj-mi-cityhive-onsite-v1',state,NJ_MI_CANDIDATE_PREMISES.filter(source=>source.state===state)])).digest('hex');
}
export const NJ_MI_PRODUCTION_CONFIGS=Object.freeze(NJ_MI_PRODUCTION_STATES.map(id=>{
  const name=NJ_MI_RESEARCH_NAMES[id],sources=NJ_MI_CANDIDATE_PREMISES.filter(source=>source.state===id);
  return Object.freeze({id,label:`Selected ${name} first-party retailer inventory`,tier:'B',active:false,
    disabledReason:'Inactive until three source shadows, two canaries, owned preview and immutable workflow provenance are admitted.',
    strategy:'retailer_store_inventory',cadence:'30m',rareSignalTarget:true,
    value:`Exact-premises pickup availability at ${sources.length} reviewed ${name} stores only. Shelf quantities are not published.`,
    precisionSource:{name:`${name} reviewed retailer precision collector`,url:sources[0].categoryUrl},
    sources:sources.map(source=>({kind:'html',name:source.sourceLabel,label:source.sourceLabel,url:source.categoryUrl,precisionOnly:true})),apiCandidates:[]});
}));
