import config from '../../src/config/state-lifecycle.json' with { type: 'json' };

export const STATE_LIFECYCLE_CONFIG = config;
export const STATE_LIFECYCLE = STATE_LIFECYCLE_CONFIG.states || {};
export const CUSTOMER_ACTIVE_STATE_IDS = new Set(STATE_LIFECYCLE_CONFIG.activeStates || []);

export function getStateLifecycle(state) {
  return STATE_LIFECYCLE[state] || null;
}

export function lifecycleAllowsInventoryAlert(state) {
  const lifecycle = getStateLifecycle(state);
  return Boolean(lifecycle && lifecycle.publicStatus === 'active' && lifecycle.inventoryAlertable !== false);
}

export function lifecycleAllowsWatchAlert(state) {
  const lifecycle = getStateLifecycle(state);
  return Boolean(lifecycle && lifecycle.publicStatus === 'active' && lifecycle.watchAlertable !== false);
}

export function lifecycleExpectsCustomerVisibleDrops(state) {
  const lifecycle = getStateLifecycle(state);
  if (!lifecycle || lifecycle.publicStatus !== 'active') return true;
  return lifecycle.coverageTier !== 'aggregate_inventory_watch';
}

export function customerStateLabel(state, fallback = state) {
  return getStateLifecycle(state)?.customerLabel || fallback || state;
}

export function sourceStateLabel(state, fallback = state) {
  return getStateLifecycle(state)?.sourceLabel || fallback || state;
}

export function customerAreaLabel(state) {
  return getStateLifecycle(state)?.customerAreaLabel || null;
}
