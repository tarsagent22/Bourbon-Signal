import { signalAvailabilityIsCurrent } from "../api/presentation";
import type { Signal } from "../api/types";

export interface FeedReportGroup {
  key: string;
  reports: Signal[];
}

const SIGHTING_WINDOW = 7 * 24 * 60 * 60 * 1000;

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
