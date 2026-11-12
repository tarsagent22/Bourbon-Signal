import type { FeedReportSummary } from "../../../shared/feed-report-summary.ts";
import { normalizeDropSignal } from "./signal-contract.ts";

type Drop = Record<string, unknown>;

function identity(drop: Drop) {
  return String(drop.bottle_id || drop.bottleId || drop.canonical_id || drop.canonicalId || "").trim();
}

export function summarizePagedBottleReports(filtered: readonly Drop[], page: readonly Drop[]) {
  const keys = new Set(page.map(identity).filter(Boolean));
  const groups = new Map<string, { stores: Set<string>; shipments: Set<string>; other: Set<string>; latestAt: string }>();
  for (const drop of filtered) {
    const id = identity(drop);
    if (!keys.has(id)) continue;
    const signal = normalizeDropSignal(drop);
    if (signal.kind !== "availability") continue;
    const summary = groups.get(id) || { stores: new Set<string>(), shipments: new Set<string>(), other: new Set<string>(), latestAt: "" };
    const store = signal.location.store;
    if (signal.shipment) {
      summary.shipments.add(JSON.stringify([signal.shipment.boardId, signal.shipment.reportedAt || signal.timing.displayAt]));
    } else if (signal.location.scope === "exact_store" && store?.id) {
      summary.stores.add(JSON.stringify([signal.location.state, store.id]));
    } else {
      summary.other.add(signal.id);
    }
    const at = signal.shipment?.reportedAt || signal.timing.lastCheckedAt || signal.timing.displayAt;
    if (Number.isFinite(Date.parse(at)) && (!summary.latestAt || Date.parse(at) > Date.parse(summary.latestAt))) summary.latestAt = at;
    groups.set(id, summary);
  }
  return Object.fromEntries([...groups].map(([id, row]): [string, FeedReportSummary] => [id, {
    stores: row.stores.size, shipments: row.shipments.size, otherReports: row.other.size, latestAt: row.latestAt,
  }]));
}
