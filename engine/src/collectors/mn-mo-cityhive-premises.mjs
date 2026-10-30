import registry from '../../data/mn-mo-cityhive-premises.json' with {type:'json'};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
freeze(registry);
export const MN_MO_NATIVE_SOURCES=registry.sources;
export const MN_MO_CORE_STORE_IDS=registry.coreStoreIds;
export const MN_MO_COHORTS=registry.cohorts;
export const MN_MO_PROFILES=Object.freeze(['core5','positive16']);
export function mnMoSourcesForState(state,profile='core5'){
 if(!['MN','MO'].includes(state)||!MN_MO_PROFILES.includes(profile))return[];
 return MN_MO_NATIVE_SOURCES.filter(s=>s.state===state&&(profile==='positive16'||MN_MO_CORE_STORE_IDS.includes(s.storeId)));
}
export const mnMoCohortInputs=(state,profile='core5')=>['mn-mo-native-cityhive-v1',profile,state,mnMoSourcesForState(state,profile)];
export const mnMoResearchRuntimeId=(source,profile='core5')=>`research:${source.state.toLowerCase()}:mn-mo-cityhive:${profile}:${source.merchantId}`;
