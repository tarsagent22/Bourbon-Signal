import minnesotaExpansion from '../../data/minnesota-cityhive-expansion-sources.json' with {type:'json'};
import midwestExpansion from '../../data/midwest-cityhive-expansion-sources.json' with {type:'json'};
import additionalExpansion from '../../data/additional-cityhive-expansion-sources.json' with {type:'json'};
import marylandResearch from '../../data/md-cityhive-research-sources.json' with {type:'json'};
import rhodeIslandResearch from '../../data/ri-cityhive-research-sources.json' with {type:'json'};

export const MINNESOTA_CITYHIVE_EXPANSION_SOURCES=Object.freeze(minnesotaExpansion.stores.map(Object.freeze));
export const MIDWEST_CITYHIVE_EXPANSION_SOURCES=Object.freeze(midwestExpansion.stores.map(Object.freeze));
export const ADDITIONAL_CITYHIVE_EXPANSION_SOURCES=Object.freeze(additionalExpansion.stores.map(Object.freeze));
export const MARYLAND_CITYHIVE_RESEARCH_SOURCES=Object.freeze(marylandResearch.stores.map(Object.freeze));
export const RHODE_ISLAND_CITYHIVE_RESEARCH_SOURCES=Object.freeze(rhodeIslandResearch.stores.map(Object.freeze));
// Reviewed, research-only rows for unactivated state shadows. Keep
// this list separate from the production registry and its pinned cohort.
export const CENTRAL_CITYHIVE_RESEARCH_SOURCES=Object.freeze([
  ...MINNESOTA_CITYHIVE_EXPANSION_SOURCES,
  ...MIDWEST_CITYHIVE_EXPANSION_SOURCES.filter(source=>source.state==='MO'),
  ...ADDITIONAL_CITYHIVE_EXPANSION_SOURCES.filter(source=>source.state==='MA'),
  ...ADDITIONAL_CITYHIVE_EXPANSION_SOURCES.filter(source=>['CT','DE','HI','KS'].includes(source.state)),
  ...MARYLAND_CITYHIVE_RESEARCH_SOURCES,
  ...RHODE_ISLAND_CITYHIVE_RESEARCH_SOURCES,
]);
