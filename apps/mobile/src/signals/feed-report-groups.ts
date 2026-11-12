import { signalAvailabilityIsCurrent } from "../api/presentation";
import type { Signal } from "../api/types";

export interface FeedReportGroup {
  key: string;
  reports: Signal[];
}

export const SIGHTING_WINDOW = 48 * 60 * 60 * 1000;

export function loadedBottleReports(reports: Signal[]) {
  const unique = new Map<string, Signal>();
  for (const report of reports) {
    const store = report.location.store;
    const key = report.shipment
      ? JSON.stringify(["shipment", report.shipment.boardId, report.shipment.reportedAt || report.timing.displayAt])
      : report.location.scope === "exact_store" && store?.id
        ? JSON.stringify(["store", store.state || report.location.state, store.id])
        : report.id;
    if (!unique.has(key)) unique.set(key, report);
  }
  return [...unique.values()];
}

export function formatBottleReportCounts(summary: NonNullable<Signal["groupSummary"]>) {
  return [[summary.stores, "store"], [summary.shipments, "shipment"], [summary.otherReports, "other report"]]
    .filter(([count]) => Number.isSafeInteger(count) && Number(count) > 0)
    .map(([count, noun]) => String(count) + " " + noun + (count === 1 ? "" : "s"))
    .join(" · ");
}

export function groupFeedReports(signals: Signal[], view: "market" | "community", showOlderSightings: boolean, now = Date.now()) {
  const groups = new Map<string, FeedReportGroup>();
  for (const signal of signals) {
    if (view === "community" && !showOlderSightings && Date.parse(signal.timing.displayAt) < now - SIGHTING_WINDOW) continue;
    const groupable = view === "market" && signal.kind === "availability" && signal.bottle.id;
    const key = groupable ? JSON.stringify(["bottle", signal.bottle.id]) : JSON.stringify(["report", signal.id]);
    const group = groups.get(key);
    if (group) group.reports.push(signal);
    else groups.set(key, { key, reports: [signal] });
  }
  return [...groups.values()];
}

export function reportGroupSummary(reports: Signal[], now = new Date()) {
  const stores = new Map<string, Signal>();
  for (const report of reports) {
    const store = report.location.store;
    if (report.location.scope !== "exact_store" || !store?.id || report.shipment) continue;
    const key = JSON.stringify([store.state || report.location.state, store.id]);
    if (!stores.has(key)) stores.set(key, report);
  }
  const storeCount = stores.size;
  const otherCount = reports.length - storeCount;
  const storeReports = [...stores.values()];
  const states = new Set(storeReports.map(report => report.location.store?.state || report.location.state));
  const state = states.size === 1 ? [...states][0] : undefined;
  const quantity = storeReports[0]?.availability?.quantity;
  const sharedQuantity = storeCount > 1 && quantity != null && quantity > 0
    && storeReports.every(report => signalAvailabilityIsCurrent(report, now) && report.availability?.quantity === quantity);
  return [
    storeCount ? [storeCount, state, storeCount === 1 ? "store" : "stores"].filter(Boolean).join(" ") : "",
    sharedQuantity ? `${quantity} reported at each` : "",
    otherCount ? `${otherCount} ${storeCount ? "other " : ""}${otherCount === 1 ? "report" : "reports"}` : "",
  ].filter(Boolean).join(" · ");
}
