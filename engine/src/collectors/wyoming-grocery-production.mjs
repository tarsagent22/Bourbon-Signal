import { createHash } from 'node:crypto';
import path from 'node:path';
import manifest from '../../data/state-integration/WY.json' with { type: 'json' };
import { collectWyomingGroceryObservation } from '../research-wyoming-grocery-runtime.mjs';
import { evaluateStateControl, validateImmutablePromotionEvidence } from '../reliability-policy.mjs';
import { STATE_LIFECYCLE_CONFIG } from '../state-lifecycle.mjs';
import { createSourceAdapter } from '../sources/source-adapter.mjs';
import { runSourceAdapters } from '../sources/source-runner.mjs';
import { summarizeSourceResult } from '../sources/source-result.mjs';
import {
  WYOMING_GROCERY_HOST, WYOMING_GROCERY_LABEL, WYOMING_GROCERY_PRODUCTION_RUNTIME,
  WYOMING_GROCERY_STORES, isWyomingGroceryProductionInventory,
} from '../wyoming-grocery-policy.mjs';

const endpoint = `https://${WYOMING_GROCERY_HOST}/abs/pub/xapi/search/substitute`;
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const WYOMING_GROCERY_COHORT = sha(WYOMING_GROCERY_STORES);
export const WYOMING_GROCERY_CONFIG = Object.freeze({
  id: 'WY', label: WYOMING_GROCERY_LABEL, tier: 'B', strategy: 'retailer_store_inventory', cadence: '30-60m',
  sources: [{ kind: 'api', url: endpoint, precisionOnly: true }], apiCandidates: [],
});

export function wyomingGrocerySourceConfigHash(candidate = manifest) {
  const sections = ['lifecycle','collector','storeIdentity','sourceSemantics','customerPaths'];
  return sha(Object.fromEntries(sections.map(key => [key, candidate[key]])));
}

export function wyomingGroceryProductionAllowed(config, candidate, env) {
  const entry = config?.states?.WY;
  const evidence = entry?.promotionEvidence;
  const immutable = evidence?.immutableEvidence;
  const control = evaluateStateControl('WY', env);
  return Boolean(config.activeStates?.includes('WY') && entry?.publicStatus === 'active' && entry.promotionStage === 'active'
    && entry.inventoryAlertable === false && entry.watchAlertable === false && control.collect && control.publishCandidate
    && candidate?.state === 'WY' && candidate.lifecycle?.publicStatus === 'active' && candidate.lifecycle.refinementLevel === 'store'
    && candidate.sourceSemantics?.inventoryAlertable === false && candidate.sourceSemantics.watchAlertable === false
    && candidate.collector?.cohortSha256 === WYOMING_GROCERY_COHORT
    && JSON.stringify(candidate.collector.sourceIds) === JSON.stringify([WYOMING_GROCERY_PRODUCTION_RUNTIME])
    && evidence?.verticalSliceManifest === 'engine/data/state-integration/WY.json'
    && evidence.fixtureContract === 'engine/data/state-fixtures/WY.json'
    && validateImmutablePromotionEvidence('WY', evidence)
    && immutable.provenance.repository === 'tarsagent22/Bourbon-Signal'
    && immutable.sourceConfigHash === wyomingGrocerySourceConfigHash(candidate)
    && JSON.stringify(immutable) === JSON.stringify(candidate.evidence?.immutablePromotionEvidence));
}

export async function collectWyomingGroceryProductionState(config, bible, options = {}) {
  const { env = process.env, lifecycleConfig = STATE_LIFECYCLE_CONFIG, promotionManifest = manifest } = options;
  const startedAt = new Date().toISOString();
  const base = { state: 'WY', label: config.label, tier: config.tier, strategy: config.strategy, cadence: config.cadence,
    startedAt, stale: false };
  if (!wyomingGroceryProductionAllowed(lifecycleConfig, promotionManifest, env)) {
    return { ...base, finishedAt: new Date().toISOString(), lastGoodAt: null, status: 'not_promoted', signals: [],
      sources: [], sourceResults: [], roadblocks: [], metadata: { blockedByPromotion: true, requestCount: 0 } };
  }
  const adapter = createSourceAdapter({
    id: WYOMING_GROCERY_PRODUCTION_RUNTIME, label: WYOMING_GROCERY_LABEL, url: endpoint,
    metadata: { stateId: 'WY', lane: 'promoted_grocery_onsite' },
    async execute(_context, { signal }) {
      const observation = await collectWyomingGroceryObservation(bible, {
        ...options.wyomingSourceOptions, env, retainCaptureBodies: false,
        incidentFile: options.wyomingSourceOptions?.incidentFile
          ?? path.resolve('out/source-incidents/western-grocery/WY-albertsons.json'),
        signal: options.signal ? AbortSignal.any([options.signal, signal]) : signal,
      });
      signal.throwIfAborted();
      const signals = observation.signals.map(row => ({
        ...row, sourceRuntimeId: WYOMING_GROCERY_PRODUCTION_RUNTIME, eligibleForOnSite: true, eligibleForDropFeed: true,
        sourceProductBinding: { ...row.sourceProductBinding, shadowOnly: false, productionOnSiteOnly: true },
      }));
      if (!signals.every(isWyomingGroceryProductionInventory)) throw new Error('Wyoming production output lost its exact store or product proof');
      return { metadata: observation.metadata, signals, observedAt: observation.lastGoodAt };
    },
    recordCount: value => value.signals.length,
    validate: value => value?.metadata?.complete === true || 'Incomplete Wyoming retailer observation',
  });
  const run = await runSourceAdapters([adapter], {}, {
    ...options.sourceRunnerOptions, previousResults: options.previousSourceResults, circuitBreaker: options.sourceCircuitBreaker,
    concurrency: 1, perDomain: 1, schedule: false, maxAttempts: 1, timeoutMs: 155_000,
  });
  const source = run.results[0];
  const value = source.ok ? source.value : null;
  return { ...base, finishedAt: new Date().toISOString(), lastGoodAt: value?.observedAt ?? null,
    status: value ? value.signals.length ? 'useful' : 'monitored_no_current_inventory' : 'blocked',
    signals: value?.signals ?? [], sources: [{ sourceRuntimeId: WYOMING_GROCERY_PRODUCTION_RUNTIME,
      label: WYOMING_GROCERY_LABEL, url: endpoint, ok: source.ok, status: source.error?.status ?? (source.ok ? 200 : source.status),
      matchedBottleCount: value?.signals.length ?? 0, error: source.error?.message ?? null }],
    sourceResults: [{ ...summarizeSourceResult(source), alertable: false }], sourceCircuitState: run.circuitState,
    roadblocks: source.ok ? [] : [{ state: 'WY', source: WYOMING_GROCERY_LABEL, status: source.error?.status ?? source.status,
      error: source.error?.message ?? 'Wyoming grocery source failed' }],
    metadata: { grocery: value?.metadata ?? null, requestCount: value?.metadata.receipts.length ?? 0, allDeliveryDisabled: true },
  };
}
