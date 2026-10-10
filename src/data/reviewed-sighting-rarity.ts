// Expression-level editorial baselines, independent of local stock evidence.
// Exact IDs only: a familiar brand must never classify a different release.
export const REVIEWED_SIGHTING_RARITY = {
  "bb_9a5c1a3d1ce97178": {
    availability: "unicorn", nationalTier: "unicorn", nationalConfidence: "medium",
    scarcitySourceIds: ["eht-cured-oak-special-release"], scarcityLastReviewedAt: "2026-10-10",
    sourceUrl: "https://www.buffalotracedistillery.com/our-brands/e-h-taylor-jr/e-h-taylor-jr-cured-oak/",
  },
  "stagg-26b": {
    // A batch identifier does not turn the existing Stagg expression into a
    // different rarity. Follow the app's reviewed Stagg baseline.
    availability: "unicorn", nationalTier: "unicorn", nationalConfidence: "low",
    scarcitySourceIds: [], scarcityLastReviewedAt: "2026-10-10",
    sourceUrl: "https://www.bourbonsignal.com/api/bottle-catalog?view=picker",
  },
  "high-west-midwinter-night-dram-act-13-scene-7": {
    availability: "allocated", nationalTier: "allocated", nationalConfidence: "medium", releaseCadence: "annual",
    scarcitySourceIds: ["high-west-midwinter-act-13"], scarcityLastReviewedAt: "2026-10-10",
    sourceUrl: "https://ship.highwest.com/collections/limited-release",
  },
  "penelope-riviera-cask-finish": {
    availability: "limited", nationalTier: "limited", nationalConfidence: "high", releaseCadence: "batch",
    scarcitySourceIds: ["penelope-cooper-series"], scarcityLastReviewedAt: "2026-10-10",
    sourceUrl: "https://shop.penelopebourbon.com/collections/cooper-series",
  },
  "penelope-estate-collection-founders-reserve": {
    availability: "limited", nationalTier: "limited", nationalConfidence: "high", releaseCadence: "batch",
    scarcitySourceIds: ["penelope-estate-collection"], scarcityLastReviewedAt: "2026-10-10",
    sourceUrl: "https://shop.penelopebourbon.com/collections/founders-reserve",
  },
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
