import type { NearbyResult, NearbyStore } from "../../../../shared/nearby";
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
  return entry && now - entry.at < 30_000 ? entry.result : null;
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
}
export function clearNearbyPreview(owner: object) {
  previews.delete(owner);
}
