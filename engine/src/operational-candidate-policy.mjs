export function hasPositiveInventoryEvidence(signal, quantity = 0) {
  if (Number(quantity) > 0) return true;
  if (signal?.sourceAvailabilityVerified !== true) return false;
  return /(?:^|\b)(?:in_stock|limited|available|on_hand|pickup|order)(?:\b|$)/i.test(
    String(signal.availabilityStatus || signal.availabilityLabel || ''),
  );
}
