export type RarityTier = "common" | "regional" | "seasonal" | "limited" | "allocated" | "highly_allocated" | "unicorn";

export interface RarityProfile {
  score: number;
  label: string;
}

const RARITY_PROFILES: Record<RarityTier, RarityProfile> = {
  common: { score: 20, label: "Common shelf bottle" },
  regional: { score: 35, label: "Regional availability" },
  seasonal: { score: 45, label: "Seasonal bottle" },
  limited: { score: 58, label: "Limited release" },
  allocated: { score: 72, label: "Allocated bottle" },
  highly_allocated: { score: 86, label: "Extremely hard to find" },
  unicorn: { score: 100, label: "Unicorn bottle" },
};

const UNCLASSIFIED_RARITY_PROFILE: RarityProfile = { score: 20, label: "Rarity not yet classified" };

// Curated market adjustments keep the national tier as the anchor while reflecting
// the tighter allocation dynamics of controlled markets. Each lift stays inside its
// rarity band, so a lower tier can never outrank the next tier.
const STATE_RARITY_LIFT: Record<string, number> = {
  NC: 6,
  VA: 5,
  PA: 5,
  AL: 4,
  "MD-MONTGOMERY": 4,
};

const RARITY_BAND_CEILING: Record<RarityTier, number> = {
  common: 34,
  regional: 44,
  seasonal: 57,
  limited: 71,
  allocated: 85,
  highly_allocated: 99,
  unicorn: 100,
};

export function getStateRarityAdjustment(tier: RarityTier, state?: string) {
  const profile = RARITY_PROFILES[tier];
  if (!profile || !state || tier === "common" || tier === "unicorn") return 0;
  const requestedLift = STATE_RARITY_LIFT[state.trim().toUpperCase()] || 0;
  return Math.max(0, Math.min(requestedLift, RARITY_BAND_CEILING[tier] - profile.score));
}

export function getRarityProfile(tier: RarityTier, state?: string): RarityProfile {
  const profile = RARITY_PROFILES[tier];
  if (!profile) return UNCLASSIFIED_RARITY_PROFILE;
  return { ...profile, score: profile.score + getStateRarityAdjustment(tier, state) };
}
