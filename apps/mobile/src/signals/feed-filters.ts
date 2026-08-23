export const RARITY_FILTER_OPTIONS = [
  { value: "limited", label: "Limited" },
  { value: "allocated", label: "Allocated" },
  { value: "highly_allocated", label: "Highly allocated" },
  { value: "unicorn", label: "Unicorn" },
] as const;

export type SignalFeedView = "market" | "community";
export type SignalRarity = (typeof RARITY_FILTER_OPTIONS)[number]["value"];
export type SignalFreshness = "24h" | "7d" | "30d" | null;

export interface SignalFeedFilters {
  rarities: SignalRarity[];
  state: string;
  freshness: SignalFreshness;
  bottle: string;
}

export const DEFAULT_SIGNAL_FILTERS: SignalFeedFilters = { rarities: [], state: "", freshness: null, bottle: "" };

export function rarityOptionsForView(view: SignalFeedView) {
  return view === "community"
    ? RARITY_FILTER_OPTIONS.filter((option) => option.value !== "highly_allocated")
    : RARITY_FILTER_OPTIONS;
}

export function toggleRarity(filters: SignalFeedFilters, rarity: SignalRarity): SignalFeedFilters {
  const selected = filters.rarities.includes(rarity)
    ? filters.rarities.filter((value) => value !== rarity)
    : [...filters.rarities, rarity].sort((left, right) => RARITY_FILTER_OPTIONS.findIndex((option) => option.value === left) - RARITY_FILTER_OPTIONS.findIndex((option) => option.value === right));
  return { ...filters, rarities: selected };
}

export function activeFilterCount(filters: SignalFeedFilters) {
  return Number(Boolean(filters.state)) + Number(Boolean(filters.freshness)) + Number(Boolean(filters.bottle.trim()));
}

export function filterSummary(filters: SignalFeedFilters) {
  const freshness = filters.freshness === "24h" ? "Last 24 hours" : filters.freshness === "7d" ? "Last 7 days" : filters.freshness === "30d" ? "Last 30 days" : "";
  return [filters.state, freshness, filters.bottle.trim()].filter(Boolean).join(" · ");
}

export function normalizedFilters(filters: SignalFeedFilters): SignalFeedFilters {
  const state = filters.state.trim().toUpperCase().slice(0, 2);
  return { ...filters, state: /^[A-Z]{2}$/.test(state) ? state : "", bottle: filters.bottle.replace(/\s+/g, " ").trim().slice(0, 100) };
}
