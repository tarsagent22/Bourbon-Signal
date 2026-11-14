import { oregonResearchSourceForState, collectOregonResearchReport } from './research-oregon-runtime.mjs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { beginMassachusettsPairedSourceAttempt, finishMassachusettsPairedSourceAttempt } from './ma-paired-source-guard.mjs';
import { groceryResearchSourceForState, groceryResearchLifecycleEntries, collectGroceryResearchReport } from './research-grocery-runtime.mjs';
import { MA_JULIOS_PROBE_URLS } from './collectors/massachusetts-retailer-surfaces.mjs';
import { collectMassachusettsJulios } from './collectors/massachusetts-retailer-collector.mjs';
import { MA_ESPLANDA_PRODUCTS, collectMassachusettsEsplanda } from './collectors/massachusetts-esplanda.mjs';
import { cityHiveResearchSourceForState, cityHiveResearchLifecycleEntries, collectCityHiveResearchReport } from './research-cityhive-runtime.mjs';

import {njMiResearchSourceForState,njMiResearchLifecycleEntries,collectNjMiResearchReport} from './nj-mi-research-runtime.mjs';
import {michiganLiquorsResearchSourceForState,michiganLiquorsResearchLifecycleEntries,collectMichiganLiquorsResearchReport} from './research-michigan-liquors-runtime.mjs';
import { louisianaAlaskaResearchSourceForState, louisianaAlaskaResearchLifecycleEntries, collectLouisianaAlaskaResearchReport } from './research-louisiana-alaska-grocery-runtime.mjs';

function shadowWorkflowOrigin(env = process.env) {
  return env.GITHUB_ACTIONS === 'true' && /^[0-9]+$/.test(env.GITHUB_RUN_ID || '')
    && /^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '')
    ? { kind: 'github_actions', repository: env.GITHUB_REPOSITORY, workflowRunId: env.GITHUB_RUN_ID,
      commitSha: env.GITHUB_SHA, runAttempt: env.GITHUB_RUN_ATTEMPT || '1' }
    : { kind: 'local_research_not_workflow_issued' };
}

// Research registrations never rewrite production lifecycle/source files or
// historical promotion evidence. Activation requires a separate reviewed change.
const MASSACHUSETTS = Object.freeze({
  id: 'MA', label: 'Massachusetts retailer research', tier: 'B', active: false,
  strategy: 'retailer_store_inventory', cadence: 'shadow-only',
  value: "Isolated Julio's Westborough pickup research; no customer activation.",
  sources: [...MA_JULIOS_PROBE_URLS.map(url => ({ kind: 'html', url, precisionOnly: true })),
    ...MA_ESPLANDA_PRODUCTS.map(source => ({ kind: 'html', url: source.requestUrl, precisionOnly: true, optIn: 'includeEsplandaResearch' }))],
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
  if (process.env.BOURBON_SIGNAL_MA_ESPLANDA_ONLY === '1') {
    const reportDirectory = options.reportDirectory || (process.env.BOURBON_SIGNAL_STATE_OUT_FILE
      ? path.dirname(process.env.BOURBON_SIGNAL_STATE_OUT_FILE) : undefined);
    const result = await collectMassachusettsEsplanda(config, bible, { ...options, reportDirectory, shadowMode: true });
    const healthy = result.sourceReports.length === MA_ESPLANDA_PRODUCTS.length && result.sourceReports.every(source => source.ok);
    const finishedAt = new Date().toISOString();
    return {
      state: config.id, label: 'Massachusetts Esplanda pickup research', tier: config.tier, strategy: config.strategy,
      cadence: config.cadence, startedAt, finishedAt, lastGoodAt: healthy ? finishedAt : null,
      status: result.signals.length ? healthy ? 'useful' : 'partial_useful' : 'no_trusted_inventory',
      stale: false, signals: result.signals, sources: result.sourceReports, sourceResults: result.sourceResults,
      roadblocks: result.roadblocks, metadata: { complete: healthy, shadowOnly: true,
        sourceSet: 'massachusetts-esplanda-only', origin: shadowWorkflowOrigin(),
        productionActivationAllowed: false, customerDeliveryAllowed: false },
    };
  }
  const pairedSources = process.env.BOURBON_SIGNAL_MA_PAIRED_SOURCE === '1';
  const pairedRequestBudget = MA_JULIOS_PROBE_URLS.length
    + (cityHiveResearchSourceForState('MA')?.sources?.length || 0) + MA_ESPLANDA_PRODUCTS.length;
  if (pairedSources && pairedRequestBudget !== 7) {
    throw new Error('MA paired collection is bounded to the reviewed two CityHive, two Julio, and three Esplanda requests.');
  }
  const attempt = pairedSources ? await beginMassachusettsPairedSourceAttempt({
    file: process.env.BOURBON_SIGNAL_MA_PAIRED_ATTEMPT_FILE || undefined,
  }) : null;
  const reportDirectory = options.reportDirectory || (process.env.BOURBON_SIGNAL_STATE_OUT_FILE
    ? path.dirname(process.env.BOURBON_SIGNAL_STATE_OUT_FILE) : undefined);
  const [result, cityHive, esplanda] = await Promise.all([
    collectMassachusettsJulios(config, bible, options),
    options.includeCityHiveResearch === false && !pairedSources ? null : collectCityHiveResearchReport(cityHiveResearchSourceForState('MA'), bible, options),
    options.includeEsplandaResearch === true || pairedSources
      ? collectMassachusettsEsplanda(config, bible, { ...options, reportDirectory, shadowMode: true }) : null,
  ]);
  const finishedAt = new Date().toISOString();
  const healthyJulios = result.sourceReports.length > 0 && result.sourceReports.every(source => source.ok);
  const healthy = healthyJulios && (cityHive === null || cityHive.metadata.complete === true)
    && (esplanda === null || esplanda.sourceReports.length === MA_ESPLANDA_PRODUCTS.length && esplanda.sourceReports.every(source => source.ok))
    && (!pairedSources || result.sourceReports.length + (cityHive?.sources?.length || 0) + (esplanda?.sourceReports?.length || 0) === pairedRequestBudget);
  const signals = [...result.signals, ...(cityHive?.signals ?? []), ...(esplanda?.signals ?? [])];
  const report = {
    state: config.id, label: config.label, tier: config.tier, strategy: config.strategy, cadence: config.cadence,
    startedAt, finishedAt, lastGoodAt: healthy ? finishedAt : null,
    status: signals.length ? healthy ? 'useful' : 'partial_useful' : 'no_trusted_inventory',
    stale: false, signals, sources: [...result.sourceReports, ...(cityHive?.sources ?? []), ...(esplanda?.sourceReports ?? [])],
    sourceResults: [...result.sourceResults, ...(cityHive?.sourceResults ?? []), ...(esplanda?.sourceResults ?? [])],
    roadblocks: [...result.roadblocks, ...(cityHive?.roadblocks ?? []), ...(esplanda?.roadblocks ?? [])],
    metadata: { ...cityHive?.metadata, complete: healthy, shadowOnly: true, productionActivationAllowed: false, customerDeliveryAllowed: false,
    ...(pairedSources ? { sourceSet: 'massachusetts-paired-sources', pairedSourceMode: true,
      pairedSourceAttemptAt: attempt.lastAttemptAt, requestBudget: { maxSourceRequests: pairedRequestBudget,
        actualSourceRequests: [...result.sourceReports, ...(cityHive?.sources ?? []), ...(esplanda?.sourceReports ?? [])].length } } : {}) },
  };
  if (attempt) {
    const reportSha256 = createHash('sha256').update(JSON.stringify(report)).digest('hex');
    await finishMassachusettsPairedSourceAttempt({
      file: process.env.BOURBON_SIGNAL_MA_PAIRED_ATTEMPT_FILE || undefined,
      attemptAt: attempt.lastAttemptAt, report, reportSha256,
    });
  }
  return report;
}
