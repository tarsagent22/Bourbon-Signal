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
