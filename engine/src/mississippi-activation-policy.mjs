import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { isMississippiRetailerInventory } from './mississippi-retailer-policy.mjs';

export const MISSISSIPPI_SOURCE_CONFIG_DIGEST = createHash('sha256')
  .update('registry\0').update(readFileSync(new URL('../data/mississippi-retailer-registry.json', import.meta.url)))
  .update('\0program\0').update(readFileSync(new URL('../../src/config/mississippi-program.json', import.meta.url)))
  .update('\0lifecycle\0').update(readFileSync(new URL('../../src/config/state-lifecycle.json', import.meta.url)))
  .digest('hex');

function isMississippiRetailerEvent(row) {
  return row?.state === 'MS'
    && /^(?:cityhive_store_inventory_result|retailer_store_inventory_result)$/iu.test(String(row?.eventType || row?.type || ''));
}

export function hasVerifiedMississippiRetailerInventory(signals = []) {
  return signals.some((signal) => isMississippiRetailerEvent(signal) && isMississippiRetailerInventory(signal));
}

export function hasPersistedMississippiActivationBaseline(activationState = {}) {
  return activationState?.markerVersion === 'bourbon-signal/ms-activation-baseline@1'
    && activationState?.state === 'MS'
    && activationState?.baselineEstablished === true
    && activationState.sourceConfigDigest === MISSISSIPPI_SOURCE_CONFIG_DIGEST
    && Number.isFinite(Date.parse(String(activationState?.lifecycleActivatedAt || '')));
}

export function suppressMississippiActivationBaseline(candidates = [], _previousSignals = [], currentSignals = [], activationState = {}) {
  const baselineEstablished = hasPersistedMississippiActivationBaseline(activationState);
  const currentHasInventory = hasVerifiedMississippiRetailerInventory(currentSignals);
  if (baselineEstablished || !currentHasInventory) return candidates;
  return candidates.map((candidate) => {
    if (!isMississippiRetailerEvent(candidate)) return candidate;
    return {
      ...candidate,
      eligibleForDelivery: false,
      eligibleForOnSite: true,
      eligibleForEmail: false,
      eligibleForSms: false,
      priorityClass: 'hold',
      deliveryChannel: 'onsite_candidate',
      sendRecommendation: 'display_on_site_until_change_detected',
      blockers: [...new Set([...(candidate.blockers || []), 'state_activation_baseline'])],
      cautions: [...new Set([...(candidate.cautions || []), 'outbound_requires_later_source_change'])],
      stateActivationBaseline: true,
    };
  });
}

export function silenceMississippiResearchCandidates(candidates = []) {
  return candidates.map((candidate) => {
    if (!isMississippiRetailerEvent(candidate)) return candidate;
    return {
      ...candidate,
      eligibleForDelivery: false,
      eligibleForOnSite: false,
      eligibleForEmail: false,
      eligibleForSms: false,
      action: 'do_not_alert_context_only',
      priorityClass: 'hold',
      deliveryChannel: null,
      sendRecommendation: 'research_only_no_publication',
      blockers: [...new Set([...(candidate.blockers || []), 'state_research_only'])],
    };
  });
}
