import minnesotaExpansion from '../../data/minnesota-cityhive-expansion-sources.json' with {type:'json'};
import midwestExpansion from '../../data/midwest-cityhive-expansion-sources.json' with {type:'json'};
import additionalExpansion from '../../data/additional-cityhive-expansion-sources.json' with {type:'json'};
import marylandResearch from '../../data/md-cityhive-research-sources.json' with {type:'json'};
import rhodeIslandResearch from '../../data/ri-cityhive-research-sources.json' with {type:'json'};
import arkansasResearch from '../../data/ar-cityhive-research-sources.json' with {type:'json'};

export const MINNESOTA_CITYHIVE_EXPANSION_SOURCES=Object.freeze(minnesotaExpansion.stores.map(Object.freeze));
export const MIDWEST_CITYHIVE_EXPANSION_SOURCES=Object.freeze(midwestExpansion.stores.map(Object.freeze));
export const ADDITIONAL_CITYHIVE_EXPANSION_SOURCES=Object.freeze(additionalExpansion.stores.map(Object.freeze));
export const MARYLAND_CITYHIVE_RESEARCH_SOURCES=Object.freeze(marylandResearch.stores.map(Object.freeze));
export const RHODE_ISLAND_CITYHIVE_RESEARCH_SOURCES=Object.freeze(rhodeIslandResearch.stores.map(Object.freeze));
export const ARKANSAS_CITYHIVE_RESEARCH_SOURCES=Object.freeze(arkansasResearch.stores.map(Object.freeze));
export const WYOMING_CITYHIVE_RESEARCH_SOURCES = Object.freeze([Object.freeze({
  id: 'northridge-liquor', chainId: 'northridge-liquor', platform: 'cityhive',
  name: 'Northridge Liquor', state: 'WY', stateCode: 'WY',
  merchantId: '62b39ad7846bf750d15d5daf', storeId: 'northridge-liquor:62b39ad7846bf750d15d5daf',
  hostname: 'northridgediscountliquors.com', baseUrl: 'https://northridgediscountliquors.com',
  address: '1660 N 4th St, Laramie, WY 82072, USA', city: 'Laramie', zip: '82072',
  lat: 41.3274875, lng: -105.5911323, sourceLabel: 'Northridge Liquor first-party pickup inventory',
  categoryUrl: 'https://northridgediscountliquors.com/shop/?ch-query=barrel%20proof&merchant-id=62b39ad7846bf750d15d5daf',
  prioritySearchTerms: Object.freeze(['barrel proof']),
})]);
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
  ...WYOMING_CITYHIVE_RESEARCH_SOURCES,
]);
