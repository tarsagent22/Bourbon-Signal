// Expression-level editorial baselines, independent of local stock evidence.
// Exact IDs only: a familiar brand must never classify a different release.
export const REVIEWED_SIGHTING_RARITY = {
  "blade-and-bow-solera-reserve-12y": {
    availability: "limited", nationalTier: "limited", nationalConfidence: "high", releaseCadence: "annual",
    scarcitySourceIds: ["blade-bow-solera-12-annual-release"], scarcityLastReviewedAt: "2026-10-10",
    sourceUrl: "https://www.multivu.com/diageo/9404251-en-blade-and-bow-unveils-new-limited-annual-expression-12-year-old-solera-reserve",
  },
  "penelope-estate-collection-single-barrel": {
    availability: "limited", nationalTier: "limited", nationalConfidence: "medium", releaseCadence: "batch",
    scarcitySourceIds: ["penelope-estate-single-barrel"], scarcityLastReviewedAt: "2026-10-10",
    sourceUrl: "https://penelopebourbon.com/estate-collection/",
  },
} as const;

export const REVIEWED_SIGHTING_ALIASES: Record<string, string[]> = {
  "old forester single barrel barrel strength rye": ["Old Forester Single Barrel Rye Barrel Strength"],
};

// The current catalog entry does not identify a Michter's expression.
export const AMBIGUOUS_SIGHTING_BOTTLE_IDS = new Set(["michters-barrel"]);
