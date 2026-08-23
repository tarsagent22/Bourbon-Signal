import { EMPTY_SIGNAL_FEED_FILTERS, SIGNAL_FRESHNESS_WINDOWS, SIGNAL_RARITY_TIERS, type SignalFeedFilters } from "./signal-feed-filters.ts";

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

function safeFilters(value: unknown): value is SignalFeedFilters {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const filters = value as Record<string, unknown>;
  return Array.isArray(filters.rarities)
    && filters.rarities.every((tier) => SIGNAL_RARITY_TIERS.includes(tier as never))
    && new Set(filters.rarities).size === filters.rarities.length
    && (filters.state === null || (typeof filters.state === "string" && /^[A-Z]{2}$/.test(filters.state)))
    && (filters.freshness === null || SIGNAL_FRESHNESS_WINDOWS.includes(filters.freshness as never))
    && (filters.bottle === null || (typeof filters.bottle === "string" && filters.bottle.length > 0 && filters.bottle.length <= 100));
}

function safeAsOf(value: unknown): value is string {
  return typeof value === "string" && value.length <= 100 && Number.isFinite(Date.parse(value));
}

export function encodeSignalFeedCursor(payload: SignalFeedCursorPayload) {
  if (!safeView(payload.view) || !safeOffset(payload.dropsOffset) || !safeSnapshot(payload.dropSnapshot) || !safeMemberBoundary(payload.memberBoundary) || !safeFilters(payload.filters) || !safeAsOf(payload.asOf)) {
    throw new Error("Invalid Signal feed cursor payload");
  }
  return Buffer.from(JSON.stringify({
    v: 4,
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
    const filters = legacy ? EMPTY_SIGNAL_FEED_FILTERS : parsed.f;
    const asOf = legacy ? new Date(0).toISOString() : parsed.at;
    if ((!legacy && parsed.v !== 4) || !safeView(view) || !safeOffset(parsed.d) || !safeSnapshot(parsed.ds) || !safeMemberBoundary(parsed.mb) || !safeFilters(filters) || !safeAsOf(asOf)) return null;
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
