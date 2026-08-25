export const RARITY_FILTER_OPTIONS = [
  { value: "limited", label: "Limited" },
  { value: "allocated", label: "Allocated" },
  { value: "unicorn", label: "Unicorn" },
] as const;

export type SignalFeedView = "market" | "community";
export type SignalRarity = (typeof RARITY_FILTER_OPTIONS)[number]["value"];
export type SignalFreshness = "24h" | "7d" | "30d" | null;

export interface SignalFeedFilters {
  rarities: SignalRarity[];
  state: string;
  area: string;
  freshness: SignalFreshness;
  bottle: string;
}

export interface SignalAreaDirectory {
  states: Array<{
    code: string;
    label: string;
    areaLabel: "Board" | "City";
    options: Array<{ value: string; label: string }>;
  }>;
}

export const DEFAULT_SIGNAL_FILTERS: SignalFeedFilters = { rarities: [], state: "", area: "", freshness: null, bottle: "" };

export function rarityOptionsForView(view: SignalFeedView) {
  void view;
  return RARITY_FILTER_OPTIONS;
}

export function toggleRarity(filters: SignalFeedFilters, rarity: SignalRarity): SignalFeedFilters {
  const selected = filters.rarities.includes(rarity)
    ? filters.rarities.filter((value) => value !== rarity)
    : [...filters.rarities, rarity].sort((left, right) => RARITY_FILTER_OPTIONS.findIndex((option) => option.value === left) - RARITY_FILTER_OPTIONS.findIndex((option) => option.value === right));
  return { ...filters, rarities: selected };
}

export function filterSignalsByRarity<T extends { bottle: { rarity?: string | null } }>(signals: readonly T[], rarities: readonly SignalRarity[]): T[] {
  if (!rarities.length) return [...signals];
  const selected = new Set<string>(rarities);
  return signals.filter((signal) => selected.has(String(signal.bottle.rarity || "").toLowerCase()));
}

export function serverSignalFilters(filters: SignalFeedFilters): SignalFeedFilters {
  return filters.rarities.length ? { ...filters, rarities: [] } : filters;
}

export function shouldBackfillRarity({
  rarities,
  visibleCount,
  hasMore,
  loading,
  error,
  attempts = 0,
}: {
  rarities: readonly SignalRarity[];
  visibleCount: number;
  hasMore: boolean;
  loading: boolean;
  error: string;
  attempts?: number;
}, minimumVisible = 8, maximumAttempts = 3) {
  return rarities.length > 0 && visibleCount < minimumVisible && hasMore && !loading && !error && attempts < maximumAttempts;
}

export function activeFilterCount(filters: SignalFeedFilters) {
  return Number(Boolean(filters.state)) + Number(Boolean(filters.area)) + Number(Boolean(filters.freshness)) + Number(Boolean(filters.bottle.trim()));
}

export function areaSelectorLabel(state: string) {
  return state.trim().toUpperCase() === "NC" ? "Board" : "City";
}

export function areaOptionsForState(directory: SignalAreaDirectory | null | undefined, state: string) {
  return directory?.states.find((entry) => entry.code === state.trim().toUpperCase())?.options || [];
}

export function filterSummary(filters: SignalFeedFilters, directory?: SignalAreaDirectory | null) {
  const freshness = filters.freshness === "24h" ? "Last 24 hours" : filters.freshness === "7d" ? "Last 7 days" : filters.freshness === "30d" ? "Last 30 days" : "";
  const stateEntry = directory?.states.find((entry) => entry.code === filters.state);
  const state = filters.state ? (stateEntry ? `State: ${stateEntry.label}` : `State: ${filters.state}`) : "";
  const area = filters.area ? `${stateEntry?.areaLabel || areaSelectorLabel(filters.state)}: ${filters.area}` : "";
  return [state, area, freshness, filters.bottle.trim()].filter(Boolean).join(" · ");
}

export function normalizedFilters(filters: SignalFeedFilters, directory?: SignalAreaDirectory | null): SignalFeedFilters {
  const state = filters.state.trim().toUpperCase().slice(0, 2);
  const normalizedState = /^[A-Z]{2}$/.test(state) ? state : "";
  const area = normalizedState ? filters.area.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  const allowedAreas = areaOptionsForState(directory, normalizedState);
  return {
    ...filters,
    state: normalizedState,
    area: directory && normalizedState === "NC" && area && !allowedAreas.some((option) => option.value === area) ? "" : area,
    bottle: filters.bottle.replace(/\s+/g, " ").trim().slice(0, 100),
  };
}
