import { isIndianaRetailerInventory } from './indiana-retailer-policy.mjs';

export function hasPositiveInventoryEvidence(signal, quantity = 0) {
  if (signal?.state === 'IN' && /^(cityhive_store_inventory|retailer_store_inventory)/i.test(String(signal.eventType || signal.type || ''))) return isIndianaRetailerInventory(signal);
  if (Number(quantity) > 0) return true;
  if (signal?.sourceAvailabilityVerified !== true) return false;
  return /(?:^|\b)(?:in_stock|limited|available|on_hand|pickup|order)(?:\b|$)/i.test(
    String(signal.availabilityStatus || signal.availabilityLabel || ''),
  );
}
