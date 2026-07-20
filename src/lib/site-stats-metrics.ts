export type SiteStateStats = {
  drops: number;
  stores: number;
  bottles: number;
  exactStoreDrops: number;
  exactStores: number;
};

type JsonRecord = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function ensure(acc: Record<string, SiteStateStats>, state: string) {
  acc[state] ??= { drops: 0, stores: 0, bottles: 0, exactStoreDrops: 0, exactStores: 0 };
  return acc[state];
}

export function buildStateStats(drops: JsonRecord[] = [], stores: JsonRecord[] = [], bottles: JsonRecord[] = []) {
  const byState: Record<string, SiteStateStats> = {};
  const exactStoreIdsByState = new Map<string, Set<string>>();

  for (const drop of drops) {
    const state = text(drop.state);
    if (!state) continue;
    const metrics = ensure(byState, state);
    metrics.drops += 1;
    const precision = text(drop.locationPrecision ?? drop.location_precision).toLowerCase();
    const eventType = text(drop.type ?? drop.eventType ?? drop.event_type).toLowerCase();
    if (precision !== 'store_level' || !eventType.includes('inventory')) continue;
    metrics.exactStoreDrops += 1;
    const storeId = text(drop.storeId ?? drop.store_id);
    if (!storeId) continue;
    if (!exactStoreIdsByState.has(state)) exactStoreIdsByState.set(state, new Set());
    exactStoreIdsByState.get(state)?.add(storeId);
  }

  exactStoreIdsByState.forEach((storeIds, state) => {
    ensure(byState, state).exactStores = storeIds.size;
  });

  for (const store of stores) {
    const state = text(store.state);
    if (state) ensure(byState, state).stores += 1;
  }

  for (const bottle of bottles) {
    const states = Array.isArray(bottle.states) ? bottle.states.map(String) : [];
    for (const state of states) ensure(byState, state).bottles += 1;
  }

  return byState;
}
