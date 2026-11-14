import { CENTRAL_CITYHIVE_PRODUCTION_SOURCES } from './collectors/central-cityhive-premises.mjs';
import { PEARSONS_DC_SOURCE } from './collectors/pearsons-dc-research.mjs';

const names=Object.freeze({WI:'Wisconsin',OK:'Oklahoma',RI:'Rhode Island',WY:'Wyoming',DC:'District of Columbia'});
export const CENTRAL_CITYHIVE_STATE_CONFIGS=Object.freeze(Object.entries(names).map(([id,name])=>{
  const sources=CENTRAL_CITYHIVE_PRODUCTION_SOURCES.filter(source=>source.state===id);
  const reviewed=[...sources,...(id==='DC'?[{...PEARSONS_DC_SOURCE,sourceLabel:PEARSONS_DC_SOURCE.sourceLabel,
    categoryUrl:PEARSONS_DC_SOURCE.productUrl}]:[])];
  return Object.freeze({id,label:`Selected ${name} first-party retailer inventory`,tier:'B',
    strategy:'retailer_store_inventory',cadence:'30-60m',rareSignalTarget:true,
    value:`Exact-premises pickup availability at ${reviewed.length} reviewed ${name} retailers. Coverage is limited to these stores; exact shelf counts are not published.`,
    precisionSource:{name:`${name} reviewed retailer precision collector`,url:sources[0].categoryUrl},
    sources:reviewed.map(source=>({kind:'html',name:source.sourceLabel,label:source.sourceLabel,url:source.categoryUrl,precisionOnly:true})),apiCandidates:[],
  });
}));
