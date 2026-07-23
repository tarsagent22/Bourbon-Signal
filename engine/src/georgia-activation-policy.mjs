import { isGeorgiaRetailerInventory } from './georgia-retailer-policy.mjs';

function isGeorgiaRetailerInventoryEvent(row) {
  return row?.state === 'GA'
    && /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(String(row?.eventType || row?.type || ''));
}

export function suppressGeorgiaActivationBaseline(candidates = [], previousSignals = [], currentSignals = [], activationState = {}) {
  const previousHadVerifiedRetailerInventory = activationState?.activated === true
    || previousSignals.some((signal) => isGeorgiaRetailerInventoryEvent(signal) && isGeorgiaRetailerInventory(signal));
  const currentHasVerifiedRetailerInventory = currentSignals.some((signal) => isGeorgiaRetailerInventoryEvent(signal) && isGeorgiaRetailerInventory(signal));
  if (previousHadVerifiedRetailerInventory || !currentHasVerifiedRetailerInventory) return candidates;

  return candidates.map((candidate) => {
    if (!isGeorgiaRetailerInventoryEvent(candidate)) return candidate;
    return {
      ...candidate,
      eligibleForDelivery: false,
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

export function hasVerifiedGeorgiaRetailerInventory(signals = []) {
  return signals.some((signal) => isGeorgiaRetailerInventoryEvent(signal) && isGeorgiaRetailerInventory(signal));
}
