export type AlertLifecycleReason =
  | 'new_availability'
  | 'unchanged'
  | 'inventory_decrease'
  | 'increase_not_material'
  | 'restock_cooldown'
  | 'availability_reset_cooldown'
  | 'material_restock'
  | 'available_again';

export interface AlertLifecycleState {
  alertVersion: number;
  lastObservedQuantity: number;
  lastObservedAt: string;
  lastAlertedQuantity: number;
  lastAlertedAt: string;
  unavailableSince?: string | null;
}

export interface AlertLifecycleObservation {
  quantity: number;
  observedAt: string;
}

export interface AlertLifecycleDecision {
  shouldOpenDelivery: boolean;
  reason: AlertLifecycleReason;
  state: AlertLifecycleState;
}

export interface AlertLifecycleCandidate {
  bottle?: unknown;
  canonicalName?: unknown;
  rawName?: unknown;
}

export function alertLifecycleIdentity(locationKey: string, candidates: AlertLifecycleCandidate[]): string;
export function updateMatchingOnSiteInventory<T extends { bottleName?: unknown; storeLabel?: unknown; quantity?: unknown }>(
  records: T[],
  observation: { bottleName: string; storeLabel: string; quantity: number | null },
): { records: T[]; updated: boolean };
export function evaluateAlertLifecycle(previous: AlertLifecycleState | null, observation: AlertLifecycleObservation): AlertLifecycleDecision;
