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
export const NORTH_DAKOTA_CITYHIVE_RESEARCH_SOURCES = Object.freeze([Object.freeze({
  id: 'rock-bottle-shop:67c8a2e465e7a028cb538073',
  chainId: 'rock-bottle-shop',
  name: 'The Rock Bottle Shop',
  state: 'ND',
  stateCode: 'ND',
  platform: 'cityhive',
  baseUrl: 'https://rockbottleshop.com',
  hostname: 'rockbottleshop.com',
  merchantId: '67c8a2e465e7a028cb538073',
  address: '1730 13th Ave N, Grand Forks, ND 58203, USA',
  city: 'Grand Forks',
  zip: '58203',
  storeId: 'rock-bottle-shop:67c8a2e465e7a028cb538073',
  sourceLabel: 'The Rock Bottle Shop first-party pickup inventory',
  categoryUrl: 'https://rockbottleshop.com/shop/?subtype=Bourbon&merchant-id=67c8a2e465e7a028cb538073',
  lat: 47.9325365,
  lng: -97.05130249999999,
  prioritySearchTerms: Object.freeze(['bourbon']),
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
  ...NORTH_DAKOTA_CITYHIVE_RESEARCH_SOURCES,
]);
