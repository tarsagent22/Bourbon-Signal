import {
  RHODE_ISLAND_CITYHIVE_RESEARCH_SOURCES,
  WYOMING_CITYHIVE_RESEARCH_SOURCES,
  DC_CITYHIVE_RESEARCH_SOURCES,
} from './central-cityhive-research-premises.mjs';

function source(id,name,state,baseUrl,merchantId,address,city,zip){
  return Object.freeze({id,name,state,stateCode:state,platform:'cityhive',baseUrl,
    hostname:new URL(baseUrl).hostname,merchantId,address,city,zip,
    storeId:`${id}:${merchantId}`,sourceLabel:`${name} first-party pickup inventory`,
    categoryUrl:`${baseUrl}/shop/?subtype=Bourbon&merchant-id=${merchantId}`});
}

// One pure reviewed-premise registry for collection and customer validation.
// Registration is research only; this file grants no production activation.
export const CENTRAL_CITYHIVE_EXPANSION_SOURCES=Object.freeze([
  source('liquorguys-wauwatosa','Liquorguys','WI','https://liquorguys.com','634464e2ec82c44b45abf3ef',
    '11728 W North Ave, Wauwatosa, WI 53226, USA','Wauwatosa','53226'),
  source('yucatan-liquor-okc','Yucatan Liquor','OK','https://yucatanliquor.com','67fe7b7c8a5eea0bf6837355',
    '9109 S May Ave, Oklahoma City, OK 73159, USA','Oklahoma City','73159'),
  source('byrons-liquor-okc',"Byron's Liquor Warehouse",'OK','https://byronsliquor.com','6060f5bded7ffb6a9c4c64b8',
    '2322 N Broadway Ave, Oklahoma City, OK 73103, USA','Oklahoma City','73103'),
]);

export const CENTRAL_CITYHIVE_PRODUCTION_SOURCES = Object.freeze([
  ...CENTRAL_CITYHIVE_EXPANSION_SOURCES,
  ...RHODE_ISLAND_CITYHIVE_RESEARCH_SOURCES,
  ...WYOMING_CITYHIVE_RESEARCH_SOURCES,
  ...DC_CITYHIVE_RESEARCH_SOURCES,
]);

// Reviewed cohort pins, recomputed by server-side admission and tested against
// this registry. Pure customer policy must not import Node hashing or collectors.
export const CENTRAL_CITYHIVE_PRODUCTION_COHORTS=Object.freeze({
  WI:'1da638a6f97c3a85778b304023bb800c88e65de06df54d7b7aef29f7a0ae5ba9',
  OK:'6dde5f60f9bca6e0450fa8509cbd5074899c1dc453f9e45b3f43fd9a46d790c1',
  RI:'09e296469e2067fcb39ecd501b2b2e43eecd41e54f400590d7cb4245e7539219',
  // Dormant routes; activation remains blocked by lifecycle, cohort and immutable promotion gates.
  WY:'793eea0ddd03784050e948570c314a080cca94bd441d3e83f08daa319c4a0349',
  DC:'a77104e97d3ff8e1c3d89a7ffaed16944a3c679d01b4db283bcca67103e95579',
});
