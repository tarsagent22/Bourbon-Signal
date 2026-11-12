import { createHash } from "node:crypto";
import type { ShipmentBottle, ShipmentUpdate, TimelineRequest, TimelineSource } from "../../../shared/report-timeline.ts";
import { normalizeMemberProfilePreferences } from "../member-profile-preferences.ts";
import { monitoringScopesFromPreferences, trimMonitoringScopesToLimit } from "../monitoring-scopes.ts";
import { candidateMatchesMonitoringScopes } from "../monitoring-scope-matcher.ts";
import { boardForExactMemberStore } from "../nearby-boards.ts";
import type { SightingStoreDirectoryEntry } from "../sighting-store-directory-core.ts";
import type { MemberSighting } from "../sightings.ts";
import { canonicalDropOrderKey, normalizeDropSignal, type CanonicalSignal } from "./signal-contract.ts";

const sources = new Set(["sightings", "stores", "shipments"]);
export function readTimelineRequest(url: URL): TimelineRequest | undefined {
  const mode = url.searchParams.get("timeline");
  const source = url.searchParams.get("source");
  const bottleId = url.searchParams.get("bottleId");
  const older = url.searchParams.get("older");
  if (!mode && !source && !bottleId && !older) return undefined;
  if (mode !== "saved" && mode !== "browse" && mode !== "bottle") throw new Error("Invalid timeline scope.");
  if (source && !sources.has(source)) throw new Error("Invalid report source.");
  if ((mode === "bottle") !== Boolean(bottleId) || (bottleId && !/^[A-Za-z0-9._:-]{1,160}$/.test(bottleId))) throw new Error("Invalid timeline bottle.");
  if (older && older !== "1") throw new Error("Invalid timeline history filter.");
  return { mode, ...(source ? { source: source as TimelineSource } : {}), ...(bottleId ? { bottleId } : {}), ...(older ? { older: true } : {}) };
}

export function writeTimelineRequest(url: URL, timeline: TimelineRequest) {
  url.searchParams.set("timeline", timeline.mode);
  if (timeline.source) url.searchParams.set("source", timeline.source);
  if (timeline.older) url.searchParams.set("older", "1");
  if (timeline.bottleId) url.searchParams.set("bottleId", timeline.bottleId);
}

export function savedTimelineScopes(metadata: Record<string, unknown> | null | undefined, areaLimit: number | null) {
  const saved = trimMonitoringScopesToLimit(monitoringScopesFromPreferences(metadata?.areaPreferences, metadata?.monitoringScopes), areaLimit);
  if (saved.length) return saved;
  const { homeState } = normalizeMemberProfilePreferences(metadata?.memberProfile);
  return homeState ? [{ type: "state" as const, id: "state:" + homeState, state: homeState, label: homeState }] : [];
}

export function savedTimelineMatchesDrop(drop: Record<string, unknown>, scopes: ReturnType<typeof savedTimelineScopes>) {
  return candidateMatchesMonitoringScopes({ ...drop, state: drop.state ?? drop.state_code }, scopes);
}

export function savedTimelineMatchesSighting(sighting: MemberSighting, scopes: ReturnType<typeof savedTimelineScopes>, verified?: SightingStoreDirectoryEntry) {
  const store = {
    state: sighting.storeState || "", city: sighting.storeCity || "", address: sighting.storeAddress,
  };
  const board = boardForExactMemberStore(store);
  const county = verified?.county || board?.filterLabel.match(/^(.+ County) ABC$/i)?.[1];
  if (verified && scopes.some(scope => scope.state === store.state && scope.type === "store"
    && [verified.id, ...(verified.aliases || [])].some(id => scope.id === "store:" + store.state + ":" + id))) return true;
  return candidateMatchesMonitoringScopes({ ...sighting, state: store.state, city: store.city, county, boardName: board?.filterLabel }, scopes);
}

function shipmentKey(signal: CanonicalSignal) {
  const reportedAt = signal.shipment?.reportedAt;
  const time = reportedAt ? Date.parse(reportedAt) : NaN;
  return signal.shipment && Number.isFinite(time) ? JSON.stringify([signal.shipment.boardId, new Date(time).toISOString()]) : null;
}

export function collapseTimelineShipments<T extends Record<string, unknown>>(rows: T[], representativeId?: string) {
  const updates = new Map<string, { representative: string; reportedAt?: string; bottles: Map<string, ShipmentBottle> }>();
  const clocks = new Map<T, string>();
  const drops = rows.filter(row => {
    if ((row.type ?? row.event_type) !== "nc_board_shipment_snapshot" || (row.state ?? row.state_code) !== "NC") return true;
    const signal = normalizeDropSignal(row);
    const key = shipmentKey(signal);
    if (!key) return true;
    const previous = updates.get(key);
    const entry = previous || { representative: signal.id, reportedAt: signal.shipment?.reportedAt, bottles: new Map() };
    if (entry.reportedAt) clocks.set(row, entry.reportedAt);
    const identity = signal.bottle.id || signal.bottle.name;
    if (!entry.bottles.has(identity)) entry.bottles.set(identity, {
      signalId: signal.id, ...signal.bottle, tier: signal.bottle.rarity, quantity: signal.shipment?.quantity,
    });
    if (representativeId && (row.id === representativeId || signal.id.endsWith(":" + representativeId))) entry.representative = signal.id;
    updates.set(key, entry);
    return !previous;
  });
  const shipmentUpdates: Record<string, ShipmentUpdate> = Object.fromEntries([...updates].map(([key, value]) => [
    value.representative, { key, bottles: [...value.bottles.values()] },
  ]));
  if (representativeId) {
    const representativeIds = new Set(Object.keys(shipmentUpdates));
    return { drops: rows.filter(row => {
      if ((row.type ?? row.event_type) !== "nc_board_shipment_snapshot") return false;
      return representativeIds.has(normalizeDropSignal(row).id);
    }), shipmentUpdates };
  }
  if (!clocks.size) return { drops, shipmentUpdates };
  const ordered = drops.map(drop => ({ drop, ...canonicalDropOrderKey(drop, clocks.get(drop)) }))
    .sort((left, right) => {
      const difference = right.time - left.time;
      return Number.isFinite(difference) && difference !== 0 ? difference : left.id.localeCompare(right.id);
    }).map(({ drop }) => drop);
  return { drops: ordered, shipmentUpdates };
}

export function timelineIncludesDrop(row: Record<string, unknown>, timeline: TimelineRequest) {
  if (timeline.bottleId && String(row.bottle_id || row.bottleId || row.canonical_id || row.canonicalId) !== timeline.bottleId) return false;
  if (!timeline.source) return true;
  const signal = normalizeDropSignal(row);
  if (timeline.source === "shipments") return Boolean(signal.shipment);
  return timeline.source === "stores" && signal.kind === "availability" && signal.location.scope === "exact_store" && !signal.shipment;
}

export function stableTimelineScope(timeline: TimelineRequest, scopes: ReturnType<typeof savedTimelineScopes> | null) {
  return createHash("sha256").update(JSON.stringify([timeline, scopes])).digest("hex").slice(0, 16);
}

export function shipmentUpdatesForPage(updates: Record<string, ShipmentUpdate>, rows: Record<string, unknown>[]) {
  return Object.fromEntries(rows.flatMap(row => {
    if ((row.type ?? row.event_type) !== "nc_board_shipment_snapshot") return [];
    const id = normalizeDropSignal(row).id;
    return Object.hasOwn(updates, id) ? [[id, updates[id]]] : [];
  }));
}
