import type { MemberProfile } from "../api/types";
import type { SignalFeedFilters } from "./feed-filters";

export function canUseDetailedFeedFilters(tier: MemberProfile["profile"]["membership"]["tier"] | undefined) {
  return tier === "barrel" || tier === "bottled-in-bond";
}

export function allowedFeedFilters(filters: SignalFeedFilters, tier: MemberProfile["profile"]["membership"]["tier"] | undefined): SignalFeedFilters {
  return canUseDetailedFeedFilters(tier) ? filters : { ...filters, area: "", bottle: "", freshness: null };
}
