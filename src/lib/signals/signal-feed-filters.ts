import { canonicalSignalFeedAreaSelection } from "../feed-area-options.ts";

export const SIGNAL_RARITY_TIERS = ["limited", "allocated", "unicorn"] as const;
export type SignalRarityTier = (typeof SIGNAL_RARITY_TIERS)[number];
export const SIGNAL_FRESHNESS_WINDOWS = ["24h", "7d", "30d"] as const;
export type SignalFreshnessWindow = (typeof SIGNAL_FRESHNESS_WINDOWS)[number];

export interface SignalFeedFilters {
  rarities: SignalRarityTier[];
  state: string | null;
  area: string | null;
  freshness: SignalFreshnessWindow | null;
  bottle: string | null;
}

export const EMPTY_SIGNAL_FEED_FILTERS: SignalFeedFilters = {
  rarities: [],
  state: null,
  area: null,
  freshness: null,
  bottle: null,
};

const raritySet = new Set<string>(SIGNAL_RARITY_TIERS);
const freshnessSet = new Set<string>(SIGNAL_FRESHNESS_WINDOWS);

export function normalizeSignalRarities(values: Iterable<string>): SignalRarityTier[] {
  const normalized = [...values]
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim().toLowerCase().replace(/[\s-]+/g, "_"))
    .map((value) => value === "highly_allocated" ? "unicorn" : value)
    .filter(Boolean);
  if (normalized.some((value) => !raritySet.has(value))) throw new Error("tiers contains an unsupported rarity");
  return [...new Set(normalized as SignalRarityTier[])].sort((left, right) => SIGNAL_RARITY_TIERS.indexOf(left) - SIGNAL_RARITY_TIERS.indexOf(right));
}

export function parseSignalFeedFilters(url: URL): SignalFeedFilters {
  const rawState = (url.searchParams.get("state") || "").trim().toUpperCase();
  if (rawState && !/^[A-Z]{2}$/.test(rawState)) throw new Error("state must be a two-letter code");
  const rawArea = (url.searchParams.get("area") || "").replace(/\s+/g, " ").trim();
  if (rawArea && !rawState) throw new Error("area requires a state");
  if (rawArea.length > 120 || /[\u0000-\u001F\u007F]/.test(rawArea)) throw new Error("area is invalid");
  const area = rawArea ? canonicalSignalFeedAreaSelection(rawState, rawArea) : null;
  if (rawArea && !area) throw new Error("area is not supported for the selected state");
  const rawFreshness = (url.searchParams.get("freshness") || "").trim().toLowerCase();
  if (rawFreshness && !freshnessSet.has(rawFreshness)) throw new Error("freshness must be 24h, 7d, or 30d");
  const rawBottle = (url.searchParams.get("bottle") || "").replace(/\s+/g, " ").trim();
  if (rawBottle.length > 100) throw new Error("bottle must be at most 100 characters");
  return {
    rarities: normalizeSignalRarities(url.searchParams.getAll("tiers")),
    state: rawState || null,
    area,
    freshness: (rawFreshness || null) as SignalFreshnessWindow | null,
    bottle: rawBottle || null,
  };
}

export function sameSignalFeedFilters(left: SignalFeedFilters, right: SignalFeedFilters) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function signalFilterSince(filters: SignalFeedFilters, asOf: string) {
  const duration = filters.freshness === "24h" ? 24 : filters.freshness === "7d" ? 7 * 24 : filters.freshness === "30d" ? 30 * 24 : 0;
  if (!duration) return null;
  const anchor = Date.parse(asOf);
  return Number.isFinite(anchor) ? new Date(anchor - duration * 60 * 60 * 1_000).toISOString() : null;
}

export function isSignalRarityTier(value: unknown): value is SignalRarityTier {
  return typeof value === "string" && raritySet.has(value);
}

export function normalizeSignalRarityTier(value: unknown): SignalRarityTier | undefined {
  const normalized = typeof value === "string" ? value.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
  const canonical = normalized === "highly_allocated" ? "unicorn" : normalized;
  return isSignalRarityTier(canonical) ? canonical : undefined;
}
