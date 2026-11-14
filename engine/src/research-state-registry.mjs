import path from 'node:path';
import { oregonResearchSourceForState, collectOregonResearchReport } from './research-oregon-runtime.mjs';
import { groceryResearchSourceForState, groceryResearchLifecycleEntries, collectGroceryResearchReport } from './research-grocery-runtime.mjs';
import { MA_JULIOS_PROBE_URLS } from './collectors/massachusetts-retailer-surfaces.mjs';
import { collectMassachusettsJulios } from './collectors/massachusetts-retailer-collector.mjs';
import { cityHiveResearchSourceForState, cityHiveResearchLifecycleEntries, collectCityHiveResearchReport } from './research-cityhive-runtime.mjs';

import {njMiResearchSourceForState,njMiResearchLifecycleEntries,collectNjMiResearchReport} from './nj-mi-research-runtime.mjs';
import {michiganLiquorsResearchSourceForState,michiganLiquorsResearchLifecycleEntries,collectMichiganLiquorsResearchReport} from './research-michigan-liquors-runtime.mjs';
import { louisianaAlaskaResearchSourceForState, louisianaAlaskaResearchLifecycleEntries, collectLouisianaAlaskaResearchReport } from './research-louisiana-alaska-grocery-runtime.mjs';
import { plainsRetailResearchSourceForState, plainsRetailResearchLifecycleEntries, collectPlainsRetailResearchReport } from './research-plains-retail-runtime.mjs';
import { collectPearsonsDcResearchReport } from './collectors/pearsons-dc-research.mjs';

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
  if (state === 'DC') return cityHiveResearchSourceForState(state);
  return oregonResearchSourceForState(state)
    || michiganLiquorsResearchSourceForState(state)
    || louisianaAlaskaResearchSourceForState(state)
    || njMiResearchSourceForState(state)
    || groceryResearchSourceForState(state)
    || plainsRetailResearchSourceForState(state)
    || cityHiveResearchSourceForState(state);
}

export function withResearchLifecycle(production) {
  if (!Array.isArray(production?.activeStates) || !production?.states) throw new Error('A production lifecycle is required.');
  if (production.activeStates.includes('MA') || production.states.MA) throw new Error('MA production/research registration requires reconciliation.');
  const additions = {
    ...cityHiveResearchLifecycleEntries(), ...groceryResearchLifecycleEntries(), ...njMiResearchLifecycleEntries(),
    ...michiganLiquorsResearchLifecycleEntries(), ...louisianaAlaskaResearchLifecycleEntries(),
    ...plainsRetailResearchLifecycleEntries(),
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
  if(config&&config===plainsRetailResearchSourceForState(config.id))return collectPlainsRetailResearchReport(config,bible,options);
  if (config && config === cityHiveResearchSourceForState(config.id)) {
    if (config.id !== 'DC') return collectCityHiveResearchReport(config,bible,options);
    return collectDistrictOfColumbiaResearchReport(config,bible,options);
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

async function collectDistrictOfColumbiaResearchReport(config,bible,options={}) {
  const cityHive = await collectCityHiveResearchReport(config,bible,options);
  const cityHiveDenied = (cityHive.sources || []).some(row => [401,403,429,435].includes(Number(row.status)));
  let pearsons;
  if (cityHiveDenied) {
    const sourceRuntimeId='research:dc:pearsons-shopify', checkedAt=new Date().toISOString();
    pearsons={signals:[],sources:[{sourceRuntimeId,label:"Pearson's Wine & Spirits DC first-party storefront pickup offer",
      url:'https://pearsonswine.com/products/blantons-single-barrel-bourbon-750ml',ok:false,status:0,checkedAt,
      error:'Skipped because a DC CityHive source returned a denial; strict stop prevented additional retailer requests.',
      signalType:'retailer_store_inventory_result',matchedBottleCount:0}],
      sourceResults:[{sourceId:sourceRuntimeId,sourceUrl:'https://pearsonswine.com/products/blantons-single-barrel-bourbon-750ml',
        ok:false,status:'skipped_after_denial',checkedAt,alertable:false,inventoryAlertable:false,watchAlertable:false}],
      roadblocks:[{state:'DC',source:'Pearson’s Wine & Spirits',status:'skipped_after_denial',
        error:'A DC CityHive permission/rate denial stopped the remaining retailer collection for this run.'}],
      metadata:{complete:false,shadowOnly:true,productionActivationAllowed:false,customerDeliveryAllowed:false}};
  } else {
    const env=options.env||process.env;
    const reportDirectory=options.reportDirectory||(env.BOURBON_SIGNAL_STATE_OUT_FILE
      ?path.dirname(env.BOURBON_SIGNAL_STATE_OUT_FILE):path.resolve('out','research-cityhive','DC'));
    pearsons=await collectPearsonsDcResearchReport(config,bible,{...options,env:options.env||process.env,
      reportDirectory,captureRoot:options.captureRoot||path.join(reportDirectory,'source-captures')});
  }
  const signals=[...(cityHive.signals||[]),...(pearsons.signals||[])];
  const sources=[...(cityHive.sources||[]),...(pearsons.sources||[])];
  const sourceResults=[...(cityHive.sourceResults||[]),...(pearsons.sourceResults||[])];
  const roadblocks=[...(cityHive.roadblocks||[]),...(pearsons.roadblocks||[])];
  const complete=cityHive.metadata?.complete===true&&pearsons.metadata?.complete===true&&sources.length===3&&sources.every(row=>row.ok===true);
  const startedAt=[cityHive.startedAt,pearsons.startedAt].filter(Boolean).sort()[0]||new Date().toISOString();
  const finishedAt=[cityHive.finishedAt,pearsons.finishedAt].filter(Boolean).sort().at(-1)||new Date().toISOString();
  return{state:'DC',label:'District of Columbia first-party retailer research',tier:'B',strategy:'retailer_store_inventory',cadence:'shadow-only',
    startedAt,finishedAt,lastGoodAt:complete?finishedAt:null,status:signals.length?(complete?'useful':'partial_useful'):'no_trusted_inventory',
    stale:false,signals,sources,sourceResults,roadblocks,
    metadata:{...cityHive.metadata,complete,shadowOnly:true,productionActivationAllowed:false,customerDeliveryAllowed:false,
      sourceAttempts:{...(cityHive.metadata?.sourceAttempts||{}),...(pearsons.metadata?.sourceAttempts||{})},
      receipts:[...(cityHive.metadata?.receipts||[]),...(pearsons.metadata?.receipts||[])],
      pearsonsSourceClock:pearsons.metadata?.sourceClock||null,pearsonsNextDueAt:pearsons.metadata?.nextDueAt||null}};
}
