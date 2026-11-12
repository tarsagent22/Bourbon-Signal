import type { NearbyResult, NearbyStore } from "../../../../shared/nearby";
const DAY = 86_400_000;
export function nearbyPinAge(store: NearbyStore, now = Date.now()) {
  const recent = Math.max(...store.signals.map(signal => {
    const value = Date.parse(signal.shipment?.reportedAt || signal.timing.lastCheckedAt || signal.timing.displayAt);
    return Number.isFinite(value) && value <= now ? value : -Infinity;
  }));
  return (now - recent) / DAY;
}

export function nearbyPinBottleCount(store: NearbyStore) {
  return new Set(store.signals.map(signal => signal.bottle.id || signal.bottle.name)).size;
}

export function mapFeedRows(stores: NearbyStore[]) {
  return stores.flatMap((store) =>
    store.signals.map((signal) => ({
      key: `${store.id}:${signal.id}`,
      store,
      signal,
    })),
  );
}
// Memory only, scoped to the authenticated API instance (including membership revision).
// A preview never replaces revalidation, and no coordinates are written to disk.
const closestReports = new WeakMap<object, { at: number; result: NearbyResult }>();
export function nearestMappedReport(owner: object, reports: NearbyStore["signals"]) {
  const ids = new Set(reports.map(report => report.bottle.id).filter(Boolean));
  const entry = closestReports.get(owner);
  const states = new Set(reports.map(report => report.location.state).filter(Boolean));
  const stores = entry && Date.now() - entry.at < 10 * 60_000 ? entry.result.stores : [];
  const distances = stores.filter(store => (!states.size || states.has(store.state)) && !store.approximateLocation && store.signals.some(report => report.bottle.id && ids.has(report.bottle.id))).map(store => store.distance);
  return distances.length ? Math.min(...distances) : undefined;
}

const previews = new WeakMap<
  object,
  Map<string, { at: number; result: NearbyResult }>
>();
export function readNearbyPreview(
  owner: object,
  key: string,
  now = Date.now(),
) {
  const entry = previews.get(owner)?.get(key);
  return entry && now - entry.at < 10 * 60_000 ? entry.result : null;
}
export function saveNearbyPreview(
  owner: object,
  key: string,
  result: NearbyResult,
  now = Date.now(),
) {
  const entries = previews.get(owner) || new Map();
  entries.delete(key);
  entries.set(key, { at: now, result });
  while (entries.size > 6) entries.delete(entries.keys().next().value!);
  previews.set(owner, entries);
  if (!result.partial && !result.previewLocked) closestReports.set(owner, { at: now, result });
}
export function clearNearbyPreview(owner: object) {
  previews.delete(owner);
  closestReports.delete(owner);
}
