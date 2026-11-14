import { oregonResearchSourceForState, collectOregonResearchReport } from './research-oregon-runtime.mjs';
import { groceryResearchSourceForState, groceryResearchLifecycleEntries, collectGroceryResearchReport } from './research-grocery-runtime.mjs';
import { MA_JULIOS_PROBE_URLS } from './collectors/massachusetts-retailer-surfaces.mjs';
import { collectMassachusettsJulios } from './collectors/massachusetts-retailer-collector.mjs';
import { cityHiveResearchSourceForState, cityHiveResearchLifecycleEntries, collectCityHiveResearchReport } from './research-cityhive-runtime.mjs';

import {njMiResearchSourceForState,njMiResearchLifecycleEntries,collectNjMiResearchReport} from './nj-mi-research-runtime.mjs';
import {michiganLiquorsResearchSourceForState,michiganLiquorsResearchLifecycleEntries,collectMichiganLiquorsResearchReport} from './research-michigan-liquors-runtime.mjs';
import { louisianaAlaskaResearchSourceForState, louisianaAlaskaResearchLifecycleEntries, collectLouisianaAlaskaResearchReport } from './research-louisiana-alaska-grocery-runtime.mjs';

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
    ...cityHiveResearchLifecycleEntries(), ...groceryResearchLifecycleEntries(), ...njMiResearchLifecycleEntries(),
    ...michiganLiquorsResearchLifecycleEntries(), ...louisianaAlaskaResearchLifecycleEntries(),
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
  if (config && config === cityHiveResearchSourceForState(config.id)) return collectCityHiveResearchReport(config,bible,options);
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
