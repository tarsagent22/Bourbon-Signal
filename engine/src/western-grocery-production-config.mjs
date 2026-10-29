import {createHash} from 'node:crypto';
import {WESTERN_GROCERY_EXPANSION_SOURCES,WESTERN_GROCERY_RESOLVER_ZIPS} from './collectors/western-grocery-premises.mjs';

export const WESTERN_GROCERY_PRODUCTION_STATES=Object.freeze(['WA','NM']);
export const WESTERN_GROCERY_BUDGETS=Object.freeze({WA:Object.freeze({sourceMs:600_000,stateMs:720_000}),NM:Object.freeze({sourceMs:180_000,stateMs:300_000})});
const names={WA:'Washington',NM:'New Mexico'};
export const westernGroceryRuntimeId=state=>`${state.toLowerCase()}:grocery-xapi`;
export function westernGroceryCohortKey(state){
  if(!WESTERN_GROCERY_PRODUCTION_STATES.includes(state))throw new Error('Unreviewed production grocery state');
  const sources=WESTERN_GROCERY_EXPANSION_SOURCES.filter(source=>source.stateCode===state);
  return createHash('sha256').update(JSON.stringify(['western-grocery-onsite-v1',state,WESTERN_GROCERY_RESOLVER_ZIPS[state],sources.map(source=>[
    source.id,source.host,source.banner,source.resolverDomainName||source.banner,source.merchantId,source.storeId,
    source.name,source.address,source.city,source.zip,source.lat,source.lng,
  ])])).digest('hex');
}
export const WESTERN_GROCERY_PRODUCTION_CONFIGS=Object.freeze(WESTERN_GROCERY_PRODUCTION_STATES.map(state=>Object.freeze({
  id:state,label:`${names[state]} reviewed exact-store grocery inventory`,tier:'B',strategy:'retailer_store_inventory',cadence:'30m',
  value:'Exact first-party in-store availability at the closed reviewed premise cohort. Exact quantities remain distinct from binary availability. All alerts stay disabled.',
  rareSignalTarget:true,
  sources:Object.freeze([...new Set(WESTERN_GROCERY_EXPANSION_SOURCES.filter(source=>source.stateCode===state).map(source=>source.host))]
    .map(host=>Object.freeze({kind:'api',url:`https://${host}/abs/pub/xapi/search/substitute`,precisionOnly:true}))),apiCandidates:Object.freeze([]),
})));
