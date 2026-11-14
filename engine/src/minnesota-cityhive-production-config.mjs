import {MINNESOTA_CITYHIVE_EXPANSION_SOURCES} from './collectors/central-cityhive-research-premises.mjs';

export const MINNESOTA_CITYHIVE_PRODUCTION_STATE='MN';
export const MINNESOTA_CITYHIVE_PRODUCTION_RUNTIME_ID='mn:central-cityhive';
export const MINNESOTA_CITYHIVE_PRODUCTION_BATCH_SIZE=7;
export const MINNESOTA_CITYHIVE_PRODUCTION_BUDGET=Object.freeze({sourceMs:180_000,stateMs:240_000,maxRequests:14});
export const MINNESOTA_CITYHIVE_PRODUCTION_SOURCES=Object.freeze(MINNESOTA_CITYHIVE_EXPANSION_SOURCES.map(source=>Object.freeze({...source})));
export const MINNESOTA_CITYHIVE_PRODUCTION_STORE_IDS=Object.freeze(MINNESOTA_CITYHIVE_PRODUCTION_SOURCES.map(source=>source.storeId));
// Fixed review pin, recomputed in the Node test so pure policy imports stay free
// of Node crypto and cannot become a runtime-derived source authorization.
export const MINNESOTA_CITYHIVE_PRODUCTION_COHORT_SHA256='f8966ff41632ffe3d8f9dc06136bcaa453c7e0177cd3bc991dbd96baae197c74';

export function selectMinnesotaProductionSources(cursor=0){
  if(!Number.isSafeInteger(cursor)||cursor<0||cursor>=MINNESOTA_CITYHIVE_PRODUCTION_SOURCES.length)throw Error('Minnesota CityHive cursor is invalid');
  return Object.freeze(Array.from({length:Math.min(MINNESOTA_CITYHIVE_PRODUCTION_BATCH_SIZE,MINNESOTA_CITYHIVE_PRODUCTION_SOURCES.length)},(_,offset)=>
    MINNESOTA_CITYHIVE_PRODUCTION_SOURCES[(cursor+offset)%MINNESOTA_CITYHIVE_PRODUCTION_SOURCES.length]));
}

export function nextMinnesotaProductionCursor(cursor){
  if(!Number.isSafeInteger(cursor)||cursor<0||cursor>=MINNESOTA_CITYHIVE_PRODUCTION_SOURCES.length)throw Error('Minnesota CityHive cursor is invalid');
  return (cursor+MINNESOTA_CITYHIVE_PRODUCTION_BATCH_SIZE)%MINNESOTA_CITYHIVE_PRODUCTION_SOURCES.length;
}
