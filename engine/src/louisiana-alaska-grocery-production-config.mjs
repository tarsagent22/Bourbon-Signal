import {createHash} from 'node:crypto';
import {LOUISIANA_ALASKA_GROCERY_SOURCES,LOUISIANA_ALASKA_RESOLVER_ZIPS} from './collectors/louisiana-alaska-grocery-premises.mjs';

export const LOUISIANA_ALASKA_GROCERY_PRODUCTION_STATES=Object.freeze(['LA','AK']);
export const LOUISIANA_ALASKA_GROCERY_REQUEST_TIMEOUT_MS=5_000;
export const LOUISIANA_ALASKA_GROCERY_BUDGETS=Object.freeze({
  LA:Object.freeze({sourceMs:240_000,stateMs:360_000,maxRequests:43,requestTimeoutMs:LOUISIANA_ALASKA_GROCERY_REQUEST_TIMEOUT_MS,interRequestDelayMs:400}),
  AK:Object.freeze({sourceMs:300_000,stateMs:420_000,maxRequests:53,requestTimeoutMs:LOUISIANA_ALASKA_GROCERY_REQUEST_TIMEOUT_MS,interRequestDelayMs:400}),
});
const names={LA:'Louisiana',AK:'Alaska'};
export const louisianaAlaskaGroceryRuntimeId=state=>`${state.toLowerCase()}:grocery-xapi`;
export function louisianaAlaskaGroceryCohortKey(state){
  if(!LOUISIANA_ALASKA_GROCERY_PRODUCTION_STATES.includes(state))throw new Error('Unreviewed production grocery state');
  const sources=LOUISIANA_ALASKA_GROCERY_SOURCES.filter(source=>source.stateCode===state);
  return createHash('sha256').update(JSON.stringify(['louisiana-alaska-grocery-onsite-v1',state,LOUISIANA_ALASKA_RESOLVER_ZIPS[state],sources.map(source=>[
    source.id,source.host,source.banner,source.resolverDomainName||source.banner,source.merchantId,source.storeId,
    source.name,source.address,source.city,source.zip,source.lat,source.lng,
  ])])).digest('hex');
}
export const LOUISIANA_ALASKA_GROCERY_PRODUCTION_CONFIGS=Object.freeze(LOUISIANA_ALASKA_GROCERY_PRODUCTION_STATES.map(state=>Object.freeze({
  id:state,label:`${names[state]} reviewed exact-store grocery inventory`,tier:'B',strategy:'retailer_store_inventory',cadence:'30m',
  value:'Exact first-party in-store availability at the closed reviewed premise cohort. Exact quantities remain distinct from binary availability. All alerts stay disabled.',
  rareSignalTarget:true,
  sources:Object.freeze([...new Set(LOUISIANA_ALASKA_GROCERY_SOURCES.filter(source=>source.stateCode===state).map(source=>source.host))]
    .map(host=>Object.freeze({kind:'api',url:`https://${host}/abs/pub/xapi/search/substitute`,precisionOnly:true}))),apiCandidates:Object.freeze([]),
})));
