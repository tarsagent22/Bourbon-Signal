import assert from "node:assert/strict";
import {
  SCARCITY_TIERS,
  getScarcityBadges,
  getPublicScarcityLabel,
  getScarcityTierPresentation,
  mergeStateScarcityOverrides,
  normalizeBottleScarcity,
  resolveBottleScarcity,
  validateStateScarcityOverrides,
  type StateScarcityOverride,
} from "../src/lib/bottle-scarcity.ts";

function override(values: Partial<StateScarcityOverride> & Pick<StateScarcityOverride, "jurisdiction" | "tier">): StateScarcityOverride {
  return {
    jurisdiction: values.jurisdiction,
    tier: values.tier,
    confidence: values.confidence || "medium",
    reason: values.reason || "Official allocation evidence and verified local opportunities support this classification.",
    officialAllocationStatus: values.officialAllocationStatus || "state_allocated",
    verifiedOpportunityCount: values.verifiedOpportunityCount ?? 0,
    coverageDenominator: values.coverageDenominator ?? 0,
    evidenceWindow: values.evidenceWindow || { start: "2026-01-01", end: "2026-07-31" },
    sourceIds: values.sourceIds || ["official-state-source"],
    lastReviewedAt: values.lastReviewedAt || "2026-08-03",
  };
}

assert.deepEqual(
  SCARCITY_TIERS,
  ["regular", "limited", "allocated", "highly_allocated", "unicorn"],
  "the public scarcity model must have one canonical five-level ladder",
);
assert.equal(getScarcityTierPresentation("regular").label, "Regular availability");
assert.equal(getScarcityTierPresentation("limited").label, "Limited availability");
assert.equal(getScarcityTierPresentation("allocated").label, "Allocated");
assert.equal(getScarcityTierPresentation("highly_allocated").label, "Unicorn");
assert.equal(getScarcityTierPresentation("unicorn").label, "Unicorn");

const regional = normalizeBottleScarcity({
  availability: "regional",
  source: "NC ABC quarterly price list",
});
assert.equal(regional.nationalTier, "regular", "regional distribution must not masquerade as a scarcity tier");
assert.equal(regional.distributionScope, "regional");
assert.equal(regional.releaseCadence, "unknown");
assert.equal(regional.nationalConfidence, "low", "single-state inventory evidence cannot imply a strong national classification");
assert.deepEqual(getScarcityBadges(regional), ["Regional distribution"]);

const seasonal = normalizeBottleScarcity({ availability: "seasonal" });
assert.equal(seasonal.nationalTier, "limited", "seasonal bottles may be limited without creating a parallel scarcity tier");
assert.equal(seasonal.releaseCadence, "seasonal");
assert.deepEqual(getScarcityBadges(seasonal), ["Seasonal release"]);
assert.equal(getPublicScarcityLabel(normalizeBottleScarcity({ availability: "allocated" })), "Scarcity under review", "unsupported hunt tiers must not make a definitive public claim");
assert.equal(getPublicScarcityLabel(normalizeBottleScarcity({ availability: "common" })), "Regular availability");

const curated = normalizeBottleScarcity({
  availability: "highly_allocated",
  nationalTier: "highly_allocated",
  nationalConfidence: "high",
  releaseCadence: "annual",
  distributionScope: "national",
  scarcitySourceIds: ["producer-release", "official-lottery"],
  scarcityLastReviewedAt: "2026-08-03",
});
assert.equal(curated.nationalTier, "unicorn");
assert.equal(curated.nationalConfidence, "high");
assert.deepEqual(getScarcityBadges(curated), ["Annual release"]);
assert.equal(getPublicScarcityLabel(curated), "Unicorn");

assert.throws(
  () => validateStateScarcityOverrides([
    override({ jurisdiction: "NC", tier: "allocated" }),
    override({ jurisdiction: "nc", tier: "highly_allocated" }),
  ]),
  /duplicate state scarcity override/i,
  "a bottle must never contain overlapping records for the same jurisdiction",
);

assert.throws(
  () => validateStateScarcityOverrides([
    override({
      jurisdiction: "SC",
      tier: "allocated",
      officialAllocationStatus: "unknown",
      coverageDenominator: 0,
      verifiedOpportunityCount: 3,
    }),
  ]),
  /coverage denominator/i,
  "observational state classifications require a denominator rather than raw sightings",
);

const stateFallback = override({ jurisdiction: "MD", tier: "allocated", reason: "Maryland state evidence." });
const countyOverride = override({ jurisdiction: "MD-MONTGOMERY", tier: "highly_allocated", reason: "Montgomery County evidence." });
const lowConfidence = override({ jurisdiction: "VA", tier: "highly_allocated", confidence: "low" });
const scarcity = normalizeBottleScarcity({
  availability: "limited",
  nationalTier: "limited",
  nationalConfidence: "medium",
  releaseCadence: "batch",
  distributionScope: "national",
  scarcitySourceIds: ["producer-release"],
  scarcityLastReviewedAt: "2026-08-03",
  stateOverrides: [stateFallback, countyOverride, lowConfidence],
});

const montgomery = resolveBottleScarcity(scarcity, "md-montgomery");
assert.equal(montgomery.marketTier, "unicorn", "the exact jurisdiction must outrank its state fallback");
assert.equal(montgomery.classificationSource, "state_override");
assert.equal(montgomery.localClassificationEstablished, true);
assert.equal(montgomery.reason, "Montgomery County evidence.");

const maryland = resolveBottleScarcity(scarcity, "MD-PRINCE-GEORGES");
assert.equal(maryland.marketTier, "allocated", "a state record may act as the fallback for a more specific jurisdiction");
assert.equal(maryland.classificationSource, "state_override");

const virginia = resolveBottleScarcity(scarcity, "VA");
assert.equal(virginia.marketTier, "limited", "low-confidence local evidence must not overwrite the national baseline");
assert.equal(virginia.classificationSource, "national_baseline");
assert.equal(virginia.localClassificationEstablished, false);
assert.equal(virginia.localLabel, "Local classification not established");

const merged = mergeStateScarcityOverrides(
  [override({ jurisdiction: "NC", tier: "allocated", reason: "Lower-authority engine classification.", sourceIds: ["engine"] })],
  [override({ jurisdiction: "NC", tier: "highly_allocated", reason: "Curated classification.", sourceIds: ["official-nc"] })],
);
assert.equal(merged.length, 1, "authority merging must emit one record per jurisdiction");
assert.equal(merged[0].tier, "unicorn", "the higher-authority source must own the local classification");
assert.deepEqual(merged[0].sourceIds, ["official-nc"], "evidence from a displaced conflicting tier must not leak into the winner");

console.log("Unified bottle scarcity classification contract passed.");
