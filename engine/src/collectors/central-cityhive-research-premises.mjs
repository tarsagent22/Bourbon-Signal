import minnesotaExpansion from '../../data/minnesota-cityhive-expansion-sources.json' with {type:'json'};
import midwestExpansion from '../../data/midwest-cityhive-expansion-sources.json' with {type:'json'};
import additionalExpansion from '../../data/additional-cityhive-expansion-sources.json' with {type:'json'};
import marylandResearch from '../../data/md-cityhive-reviewed-sources.json' with {type:'json'};
import rhodeIslandResearch from '../../data/ri-cityhive-research-sources.json' with {type:'json'};
import arkansasResearch from '../../data/ar-cityhive-research-sources.json' with {type:'json'};
import meBevResearch from '../../data/mi-megabev-cityhive-research-candidates.json' with {type:'json'};

export const MINNESOTA_CITYHIVE_EXPANSION_SOURCES=Object.freeze(minnesotaExpansion.stores.map(Object.freeze));
export const MIDWEST_CITYHIVE_EXPANSION_SOURCES=Object.freeze(midwestExpansion.stores.map(Object.freeze));
export const ADDITIONAL_CITYHIVE_EXPANSION_SOURCES=Object.freeze(additionalExpansion.stores.map(Object.freeze));
export const MARYLAND_CITYHIVE_REVIEWED_SOURCES=Object.freeze(marylandResearch.stores.map(Object.freeze));
export const MARYLAND_CITYHIVE_RESEARCH_SOURCES=MARYLAND_CITYHIVE_REVIEWED_SOURCES;
export const RHODE_ISLAND_CITYHIVE_RESEARCH_SOURCES=Object.freeze(rhodeIslandResearch.stores.map(Object.freeze));
export const ARKANSAS_CITYHIVE_RESEARCH_SOURCES=Object.freeze(arkansasResearch.stores.map(Object.freeze));
const MEGABEV_BASE_URL='https://megabev.com';
export const MEGABEV_CITYHIVE_RESEARCH_SOURCES=Object.freeze(meBevResearch.stores.map(store=>Object.freeze({
  id:store.id,name:store.name,state:store.state,stateCode:store.state,platform:'cityhive',baseUrl:MEGABEV_BASE_URL,
  hostname:'megabev.com',merchantId:store.merchantId,address:store.address,city:store.city,zip:store.zip,
  lat:store.latitude,lng:store.longitude,storeId:`${store.id}:${store.merchantId}`,
  sourceLabel:`${store.name} first-party pickup inventory`,categoryUrl:`${MEGABEV_BASE_URL}/shop/`,
  prioritySearchTerms:Object.freeze(meBevResearch.firstPassSearchTerms),
})));
export const MEGABEV_CITYHIVE_INITIAL_RESEARCH_SOURCES=Object.freeze(MEGABEV_CITYHIVE_RESEARCH_SOURCES
  .filter(source=>meBevResearch.firstPassMerchantIds.includes(source.merchantId)));
// Reviewed, research-only rows for unactivated state shadows. Keep
// this list separate from the production registry and its pinned cohort.
export const CENTRAL_CITYHIVE_RESEARCH_SOURCES=Object.freeze([
  ...MINNESOTA_CITYHIVE_EXPANSION_SOURCES,
  ...MIDWEST_CITYHIVE_EXPANSION_SOURCES.filter(source=>source.state==='MO'),
  ...ADDITIONAL_CITYHIVE_EXPANSION_SOURCES.filter(source=>source.state==='MA'),
  ...ADDITIONAL_CITYHIVE_EXPANSION_SOURCES.filter(source=>['CT','DE','HI','KS'].includes(source.state)),
  ...MARYLAND_CITYHIVE_RESEARCH_SOURCES,
  ...RHODE_ISLAND_CITYHIVE_RESEARCH_SOURCES,
  ...ARKANSAS_CITYHIVE_RESEARCH_SOURCES,
]);
