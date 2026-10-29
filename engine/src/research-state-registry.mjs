import {groceryResearchSourceForState,groceryResearchLifecycleEntries,collectGroceryResearchReport} from './research-grocery-runtime.mjs';
import {cityHiveResearchSourceForState,cityHiveResearchLifecycleEntries,collectCityHiveResearchReport} from './research-cityhive-runtime.mjs';
import {njMiResearchSourceForState,njMiResearchLifecycleEntries,collectNjMiResearchReport} from './nj-mi-research-runtime.mjs';
import {louisianaAlaskaResearchSourceForState,louisianaAlaskaResearchLifecycleEntries,collectLouisianaAlaskaResearchReport} from './research-louisiana-alaska-grocery-runtime.mjs';
import {newEnglandResearchSourceForState,newEnglandResearchLifecycleEntries,collectNewEnglandResearchReport} from './new-england-research-runtime.mjs';
const families=[
 [newEnglandResearchSourceForState,newEnglandResearchLifecycleEntries,collectNewEnglandResearchReport],
 [louisianaAlaskaResearchSourceForState,louisianaAlaskaResearchLifecycleEntries,collectLouisianaAlaskaResearchReport],
 [njMiResearchSourceForState,njMiResearchLifecycleEntries,collectNjMiResearchReport],
 [groceryResearchSourceForState,groceryResearchLifecycleEntries,collectGroceryResearchReport],
 [cityHiveResearchSourceForState,cityHiveResearchLifecycleEntries,collectCityHiveResearchReport],
];
// The seven closed NE premises replace MA's former single-retailer research
// registration. Direct legacy parser tests remain; no production activation.
export function researchSourceForState(state,{shadowMode=process.env.BOURBON_SIGNAL_SHADOW_MODE==='1'}={}){
 if(!shadowMode)return null;for(const[source]of families){const config=source(state);if(config)return config;}return null;
}
export function withResearchLifecycle(production){
 if(!Array.isArray(production?.activeStates)||!production?.states)throw Error('A production lifecycle is required.');
 for(const state of production.activeStates)if(production.states[state]?.publicStatus!=='active')throw Error('Active production/research registration requires reconciliation: '+state);
 const additions=Object.assign({},...families.map(([,entries])=>entries()));
 for(const state of Object.keys(additions))if(production.activeStates.includes(state)||production.states[state]?.publicStatus==='active')delete additions[state];
 return{...production,activeStates:[...production.activeStates],states:{...production.states,...additions}};
}
export async function collectResearchStateReport(config,bible,options={}){
 for(const[source,,collect]of families)if(config&&source(config.id)===config)return collect(config,bible,options);
 throw Error('Research reports require the registered isolated shadow source.');
}
