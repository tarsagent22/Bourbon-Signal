import { createHash } from 'node:crypto';

const RESTOCK_COOLDOWN_MS = 48 * 60 * 60 * 1000;
const AVAILABILITY_RESET_MS = 12 * 60 * 60 * 1000;

function normalizedText(value) {
  return typeof value === 'string'
    ? value.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
}

function finiteQuantity(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function elapsed(from, to) {
  if (!from) return 0;
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  return Number.isFinite(fromMs) && Number.isFinite(toMs) ? Math.max(0, toMs - fromMs) : 0;
}

export function alertLifecycleIdentity(locationKey, candidates) {
  const bottles = Array.from(new Set(candidates
    .map((candidate) => normalizedText(candidate.bottle) || normalizedText(candidate.canonicalName) || normalizedText(candidate.rawName))
    .filter(Boolean)))
    .sort();
  const digest = createHash('sha256')
    .update([normalizedText(locationKey), ...bottles].join('|'))
    .digest('hex')
    .slice(0, 24);
  return `alert-lifecycle:${digest}`;
}

export function updateMatchingOnSiteInventory(records, observation) {
  const bottle = normalizedText(observation.bottleName);
  const store = normalizedText(observation.storeLabel);
  let updated = false;
  const next = records.map((record) => {
    if (normalizedText(record?.bottleName) !== bottle || normalizedText(record?.storeLabel) !== store) return record;
    if (record.quantity === observation.quantity) return record;
    updated = true;
    return { ...record, quantity: observation.quantity };
  });
  return { records: next, updated };
}

export function evaluateAlertLifecycle(previous, observation) {
  const quantity = finiteQuantity(observation.quantity);
  if (!previous) {
    return {
      shouldOpenDelivery: quantity > 0,
      reason: 'new_availability',
      state: {
        alertVersion: 1,
        lastObservedQuantity: quantity,
        lastObservedAt: observation.observedAt,
        lastAlertedQuantity: quantity,
        lastAlertedAt: observation.observedAt,
        unavailableSince: quantity > 0 ? null : observation.observedAt,
      },
    };
  }

  const state = {
    ...previous,
    lastObservedQuantity: quantity,
    lastObservedAt: observation.observedAt,
    unavailableSince: quantity <= 0 ? previous.unavailableSince || observation.observedAt : previous.unavailableSince || null,
  };

  if (quantity <= 0) {
    return { shouldOpenDelivery: false, reason: quantity === previous.lastObservedQuantity ? 'unchanged' : 'inventory_decrease', state };
  }
  if (previous.lastObservedQuantity <= 0 && previous.unavailableSince) {
    if (elapsed(previous.unavailableSince, observation.observedAt) < AVAILABILITY_RESET_MS) {
      return { shouldOpenDelivery: false, reason: 'availability_reset_cooldown', state };
    }
    return {
      shouldOpenDelivery: true,
      reason: 'available_again',
      state: { ...state, alertVersion: previous.alertVersion + 1, lastAlertedQuantity: quantity, lastAlertedAt: observation.observedAt, unavailableSince: null },
    };
  }
  if (quantity === previous.lastObservedQuantity) {
    return { shouldOpenDelivery: false, reason: 'unchanged', state: { ...state, unavailableSince: null } };
  }
  if (quantity < previous.lastObservedQuantity) {
    return { shouldOpenDelivery: false, reason: 'inventory_decrease', state: { ...state, unavailableSince: null } };
  }

  const materialIncrease = quantity - previous.lastAlertedQuantity >= Math.max(3, Math.ceil(previous.lastAlertedQuantity * 0.5));
  if (!materialIncrease) {
    return { shouldOpenDelivery: false, reason: 'increase_not_material', state: { ...state, unavailableSince: null } };
  }
  if (elapsed(previous.lastAlertedAt, observation.observedAt) < RESTOCK_COOLDOWN_MS) {
    return { shouldOpenDelivery: false, reason: 'restock_cooldown', state: { ...state, unavailableSince: null } };
  }
  return {
    shouldOpenDelivery: true,
    reason: 'material_restock',
    state: { ...state, alertVersion: previous.alertVersion + 1, lastAlertedQuantity: quantity, lastAlertedAt: observation.observedAt, unavailableSince: null },
  };
}
