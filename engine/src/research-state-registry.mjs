import path from 'node:path';
import { oregonResearchSourceForState, collectOregonResearchReport } from './research-oregon-runtime.mjs';
import { groceryResearchSourceForState, groceryResearchLifecycleEntries, collectGroceryResearchReport } from './research-grocery-runtime.mjs';
import { MA_JULIOS_PROBE_URLS } from './collectors/massachusetts-retailer-surfaces.mjs';
import { collectMassachusettsJulios } from './collectors/massachusetts-retailer-collector.mjs';
import { cityHiveResearchSourceForState, cityHiveResearchLifecycleEntries, collectCityHiveResearchReport } from './research-cityhive-runtime.mjs';

import {njMiResearchSourceForState,njMiResearchLifecycleEntries,collectNjMiResearchReport} from './nj-mi-research-runtime.mjs';
import {michiganLiquorsResearchSourceForState,michiganLiquorsResearchLifecycleEntries,collectMichiganLiquorsResearchReport} from './research-michigan-liquors-runtime.mjs';
import { louisianaAlaskaResearchSourceForState, louisianaAlaskaResearchLifecycleEntries, collectLouisianaAlaskaResearchReport } from './research-louisiana-alaska-grocery-runtime.mjs';
import {collectPearsonsDcResearchReport} from './collectors/pearsons-dc-research.mjs';

// Research registrations never rewrite production lifecycle/source files or
// historical promotion evidence. Activation requires a separate reviewed change.
const MASSACHUSETTS = Object.freeze({
  id: 'MA', label: 'Massachusetts retailer research', tier: 'B', active: false,
  strategy: 'retailer_store_inventory', cadence: 'shadow-only',
  value: "Isolated Julio's Westborough pickup research; no customer activation.",
  sources: MA_JULIOS_PROBE_URLS.map(url => ({ kind: 'html', url, precisionOnly: true })),
  apiCandidates: [],
});

export function researchSourceForState(state, { shadowMode = process.env.BOURBON_SIGNAL_SHADOW_MODE === '1' } = {}) {
  if (!shadowMode) return null;
  if (state === 'MA') return MASSACHUSETTS;
  if (state === 'DC') return cityHiveResearchSourceForState('DC');
  return oregonResearchSourceForState(state)
    || michiganLiquorsResearchSourceForState(state)
    || louisianaAlaskaResearchSourceForState(state)
    || njMiResearchSourceForState(state)
    || groceryResearchSourceForState(state)
    || cityHiveResearchSourceForState(state);
}

export function withResearchLifecycle(production) {
  if (!Array.isArray(production?.activeStates) || !production?.states) throw new Error('A production lifecycle is required.');
  if (production.activeStates.includes('MA') || production.states.MA) throw new Error('MA production/research registration requires reconciliation.');
  const additions = {
    ...michiganLiquorsResearchLifecycleEntries(), ...louisianaAlaskaResearchLifecycleEntries(),
    ...cityHiveResearchLifecycleEntries(), ...groceryResearchLifecycleEntries(), ...njMiResearchLifecycleEntries(),
  };
  for(const state of Object.keys(additions))if(production.activeStates.includes(state)||production.states[state]?.publicStatus==='active') {
    delete additions[state];
  }
  return {
    ...production, activeStates: [...production.activeStates], states: {
      ...production.states,
      ...additions,
      MA: { customerLabel: 'Massachusetts', sourceLabel: 'Massachusetts retailer research',
        publicStatus: 'research_only', shadowEligible: true, lifecycle: 'retailer_inventory_research',
        coverageTier: 'blocked', refinementLevel: 'store', inventoryAlertable: false, watchAlertable: false },
    },
  };
}

export async function collectResearchStateReport(config, bible, options = {}) {
  if (config && config === oregonResearchSourceForState(config.id)) return collectOregonResearchReport(config, bible, options);
  if(config&&config===michiganLiquorsResearchSourceForState(config.id))return collectMichiganLiquorsResearchReport(config,bible,options);
  if (config && config === louisianaAlaskaResearchSourceForState(config.id)) return collectLouisianaAlaskaResearchReport(config, bible, options);
  if(config&&config===groceryResearchSourceForState(config.id))return collectGroceryResearchReport(config,bible,options);
  if(config&&config===njMiResearchSourceForState(config.id))return collectNjMiResearchReport(config,bible,options);
  if (config && config === cityHiveResearchSourceForState(config.id)) {
    if(config.id!=='DC')return collectCityHiveResearchReport(config,bible,options);
    const city=await collectCityHiveResearchReport(config,bible,options);
    if(city.metadata?.complete!==true)return{...city,metadata:{...city.metadata,complete:false,pearsons:null,shadowOnly:true,productionActivationAllowed:false,customerDeliveryAllowed:false}};
    const env=options.env||process.env;
    const reportFile=env.BOURBON_SIGNAL_STATE_OUT_FILE;
    const reportDirectory=options.reportDirectory||(reportFile?path.dirname(reportFile):null);
    const captureRoot=options.captureRoot||(reportDirectory?path.join(reportDirectory,'source-captures'):undefined);
    const pearson=await collectPearsonsDcResearchReport(config,bible,{...options,...(captureRoot?{captureRoot}:{})});
    const complete=city.metadata?.complete===true&&pearson.metadata?.complete===true;
    const signals=complete?[...(city.signals||[]),...(pearson.signals||[])]:[];
    return{...city,status:complete?(signals.length?'useful':'no_trusted_inventory'):'partial_useful',lastGoodAt:complete?[city.lastGoodAt,pearson.lastGoodAt].filter(Boolean).sort()[0]||null:null,
      signals,sources:[...(city.sources||[]),...(pearson.sources||[])],sourceResults:[...(city.sourceResults||[]),...(pearson.sourceResults||[])],
      roadblocks:[...(city.roadblocks||[]),...(pearson.roadblocks||[])],
      metadata:{...city.metadata,cityhive:city.metadata,pearsons:pearson.metadata,complete,shadowOnly:true,productionActivationAllowed:false,customerDeliveryAllowed:false,
        requestCount:Number(city.metadata?.requestCount||0)+Number(pearson.metadata?.requestCount||0),allDeliveryDisabled:true}};
  }
  if (process.env.BOURBON_SIGNAL_SHADOW_MODE !== '1' || config !== MASSACHUSETTS) {
    throw new Error('Research reports require the registered isolated shadow source.');
  }
  const startedAt = new Date().toISOString();
  const [result, cityHive] = await Promise.all([
    collectMassachusettsJulios(config, bible, options),
    options.includeCityHiveResearch === false ? null : collectCityHiveResearchReport(cityHiveResearchSourceForState('MA'), bible, options),
  ]);
  const finishedAt = new Date().toISOString();
  const healthyJulios = result.sourceReports.length > 0 && result.sourceReports.every(source => source.ok);
  const healthy = healthyJulios && (cityHive === null || cityHive.metadata.complete === true);
  const signals = [...result.signals, ...(cityHive?.signals ?? [])];
  return {
    state: config.id, label: config.label, tier: config.tier, strategy: config.strategy, cadence: config.cadence,
    startedAt, finishedAt, lastGoodAt: healthy ? finishedAt : null,
    status: signals.length ? healthy ? 'useful' : 'partial_useful' : 'no_trusted_inventory',
    stale: false, signals, sources: [...result.sourceReports, ...(cityHive?.sources ?? [])],
    sourceResults: [...result.sourceResults, ...(cityHive?.sourceResults ?? [])], roadblocks: [...result.roadblocks, ...(cityHive?.roadblocks ?? [])],
    metadata: { ...cityHive?.metadata, complete: healthy, shadowOnly: true, productionActivationAllowed: false, customerDeliveryAllowed: false },
  };
}
