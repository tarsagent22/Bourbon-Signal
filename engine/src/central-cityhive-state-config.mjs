import { CENTRAL_CITYHIVE_EXPANSION_SOURCES } from './collectors/central-cityhive-expansion.mjs';

const names=Object.freeze({WI:'Wisconsin',OK:'Oklahoma'});
export const CENTRAL_CITYHIVE_STATE_CONFIGS=Object.freeze(Object.entries(names).map(([id,name])=>{
  const sources=CENTRAL_CITYHIVE_EXPANSION_SOURCES.filter(source=>source.state===id);
  return Object.freeze({id,label:`Selected ${name} first-party retailer inventory`,tier:'B',
    strategy:'retailer_store_inventory',cadence:'30-60m',rareSignalTarget:true,
    value:`Exact-premises pickup availability at ${sources.length} reviewed ${name} retailers. Coverage is limited to these stores; exact shelf counts are not published.`,
    precisionSource:{name:`${name} reviewed retailer precision collector`,url:sources[0].categoryUrl},
    sources:sources.map(source=>({kind:'html',name:source.sourceLabel,label:source.sourceLabel,url:source.categoryUrl,precisionOnly:true})),apiCandidates:[],
  });
}));
