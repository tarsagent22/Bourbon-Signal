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
const closestReports = new WeakMap<object, { at: number; result: NearbyResult }>();
export function nearestMappedReport(owner: object, reports: NearbyStore["signals"]) {
  const ids = new Set(reports.filter(report => report.location.scope === "exact_store" && !report.shipment).map(report => report.id));
  const entry = closestReports.get(owner);
  const stores = entry && Date.now() - entry.at < 10 * 60_000 ? [...entry.result.stores, ...(entry.result.sightingPins || [])] : [];
  const distances = stores
    .filter(store => !store.approximateLocation && store.signals.some(report => ids.has(report.id)))
    .map(store => store.distance);
  return distances.length ? Math.min(...distances) : undefined;
}

export function mappedBoardMemberDistance(owner: object, boardId: string | undefined, memberId: string) {
  const entry = closestReports.get(owner);
  if (!entry || Date.now() - entry.at >= 10 * 60_000) return undefined;
  const member = entry.result.boards?.find(board => board.id === boardId)?.members?.find(row => row.id === memberId);
  return member?.approximateLocation ? undefined : member?.distance;
}

export function nearestMappedBoardMember(owner: object, boardId: string | undefined) {
  const entry = closestReports.get(owner);
  if (!entry || Date.now() - entry.at >= 10 * 60_000) return undefined;
  const distances = entry.result.boards?.find(board => board.id === boardId)?.members
    ?.flatMap(member => !member.approximateLocation && member.distance != null ? [member.distance] : []) || [];
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
  if (!result.partial && !result.previewLocked) closestReports.set(owner, { at: now, result });
}
export function clearNearbyPreview(owner: object) {
  previews.delete(owner);
  closestReports.delete(owner);
}
