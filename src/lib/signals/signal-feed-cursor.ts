import { EMPTY_SIGNAL_FEED_FILTERS, SIGNAL_FRESHNESS_WINDOWS, normalizeSignalRarities, type SignalFeedFilters } from "./signal-feed-filters.ts";
import { canonicalSignalFeedAreaSelection } from "../feed-area-options.ts";

export type SignalFeedView = "all" | "market" | "community";

export interface SignalFeedCursorPayload {
  view: SignalFeedView;
  dropsOffset: number;
  dropSnapshot: string | null;
  memberBoundary: { createdAt: string; id: string } | null;
  filters: SignalFeedFilters;
  asOf: string;
}

function safeView(value: unknown): value is SignalFeedView {
  return value === "all" || value === "market" || value === "community";
}

function safeOffset(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 100_000;
}

function safeSnapshot(value: unknown) {
  return value === null || (typeof value === "string" && value.length > 0 && value.length <= 500);
}

function safeMemberBoundary(value: unknown): value is { createdAt: string; id: string } | null {
  if (value === null) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const boundary = value as Record<string, unknown>;
  return typeof boundary.createdAt === "string"
    && boundary.createdAt.length <= 100
    && Number.isFinite(Date.parse(boundary.createdAt))
    && typeof boundary.id === "string"
    && /^[A-Za-z0-9._:-]{1,160}$/.test(boundary.id);
}

function normalizedCursorFilters(value: unknown, allowMissingArea = false): SignalFeedFilters | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const filters = value as Record<string, unknown>;
  if (!Array.isArray(filters.rarities) || !filters.rarities.every((tier) => typeof tier === "string")) return null;
  let rarities: SignalFeedFilters["rarities"];
  try {
    rarities = normalizeSignalRarities(filters.rarities as string[]);
  } catch {
    return null;
  }
  const state = filters.state;
  if (!(state === null || (typeof state === "string" && /^[A-Z]{2}$/.test(state)))) return null;
  const rawArea = allowMissingArea && filters.area === undefined ? null : filters.area;
  if (!(rawArea === null || (typeof rawArea === "string" && rawArea.length > 0 && rawArea.length <= 120))) return null;
  const area = rawArea === null ? null : canonicalSignalFeedAreaSelection(state as string | null, rawArea);
  if (rawArea !== null && !area) return null;
  if (!(filters.freshness === null || SIGNAL_FRESHNESS_WINDOWS.includes(filters.freshness as never))) return null;
  if (!(filters.bottle === null || (typeof filters.bottle === "string" && filters.bottle.length > 0 && filters.bottle.length <= 100))) return null;
  return {
    rarities,
    state: state as string | null,
    area,
    freshness: filters.freshness as SignalFeedFilters["freshness"],
    bottle: filters.bottle as string | null,
  };
}

function safeAsOf(value: unknown): value is string {
  return typeof value === "string" && value.length <= 100 && Number.isFinite(Date.parse(value));
}

export function encodeSignalFeedCursor(payload: SignalFeedCursorPayload) {
  const filters = normalizedCursorFilters(payload.filters);
  if (!safeView(payload.view) || !safeOffset(payload.dropsOffset) || !safeSnapshot(payload.dropSnapshot) || !safeMemberBoundary(payload.memberBoundary) || !filters || JSON.stringify(filters) !== JSON.stringify(payload.filters) || !safeAsOf(payload.asOf)) {
    throw new Error("Invalid Signal feed cursor payload");
  }
  return Buffer.from(JSON.stringify({
    v: 5,
    fv: payload.view,
    d: payload.dropsOffset,
    ds: payload.dropSnapshot,
    mb: payload.memberBoundary,
    f: payload.filters,
    at: payload.asOf,
  }), "utf8").toString("base64url");
}

export function decodeSignalFeedCursor(value: string | null | undefined): SignalFeedCursorPayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    const view = parsed.v === 2 ? "all" : parsed.fv;
    const legacy = parsed.v === 2 || parsed.v === 3;
    const filters = legacy ? EMPTY_SIGNAL_FEED_FILTERS : normalizedCursorFilters(parsed.f, parsed.v === 4);
    const asOf = legacy ? new Date(0).toISOString() : parsed.at;
    if ((!legacy && parsed.v !== 4 && parsed.v !== 5) || !safeView(view) || !safeOffset(parsed.d) || !safeSnapshot(parsed.ds) || !safeMemberBoundary(parsed.mb) || !filters || !safeAsOf(asOf)) return null;
    return {
      view,
      dropsOffset: Number(parsed.d),
      dropSnapshot: parsed.ds as string | null,
      memberBoundary: parsed.mb as SignalFeedCursorPayload["memberBoundary"],
      filters,
      asOf,
    };
  } catch {
    return null;
  }
}
