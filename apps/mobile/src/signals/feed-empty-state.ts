import type { SignalFeedFilters, SignalFeedView } from "./feed-filters";
export function feedEmptyState(view: SignalFeedView, filters: SignalFeedFilters) {
  const search = filters.bottle.trim();
  if (search) return { title: `No matches for “${search}”`, detail: "Try another bottle or store name.", actionLabel: "Clear search", action: "search" as const };
  if (filters.freshness) return { title: "No reports in this time range", detail: "Older reports may be available.", actionLabel: "Show older reports", action: "time" as const };
  if (filters.rarities.length) return { title: "No bottles match these tiers", detail: "Try including the other bottle tiers.", actionLabel: "Show all tiers", action: "rarity" as const };
  if (filters.area) return { title: "No reports in this area", detail: "Check the rest of the state for reports.", actionLabel: "Show entire state", action: "area" as const };
  if (filters.state) return { title: "No reports in this state", detail: "Check other states for reports.", actionLabel: "Show all states", action: "state" as const };
  return view === "community"
    ? { title: "No member sightings yet", detail: "Found a bottle? Post where you saw it.", actionLabel: "Post a sighting", action: "post" as const }
    : { title: "No bottle reports yet", detail: "Check Community for member sightings.", actionLabel: "Browse Community", action: "community" as const };
}
