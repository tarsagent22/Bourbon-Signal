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

export function getRarityProfile(tier: RarityTier): RarityProfile {
  return RARITY_PROFILES[tier] ?? UNCLASSIFIED_RARITY_PROFILE;
}
