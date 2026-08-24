import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import inventory from "../src/data/bourbonBibleInventory.json" with { type: "json" };
import {
  ALABAMA_ALLOCATED_PRODUCT_MATCHES,
  BOTTLE_SCARCITY_SOURCE_REGISTRY,
  BOTTLE_STATE_SCARCITY_OVERRIDES,
  getBottleStateScarcityOverrides,
} from "../src/data/bottle-scarcity-overrides.ts";
import { mergeBottleCatalogSources } from "../src/lib/bottle-catalog-merge.ts";
import { canonicalBottleId } from "../src/data/bottle-identity-redirects.ts";
import {
  normalizeBottleScarcity,
  validateStateScarcityOverrides,
  type StateScarcityOverride,
} from "../src/lib/bottle-scarcity.ts";

const sourceIds = new Set(Object.keys(BOTTLE_SCARCITY_SOURCE_REGISTRY));
assert.ok(sourceIds.size >= 6, "the classification model must keep an explicit authoritative evidence registry");
for (const [id, source] of Object.entries(BOTTLE_SCARCITY_SOURCE_REGISTRY)) {
  assert.match(id, /^[a-z0-9-]+$/);
  assert.match(source.url, /^https:\/\//);
  assert.ok(["official_state", "official_producer", "verified_retailer", "verified_signal"].includes(source.type));
  assert.ok(source.label.length >= 8);
}

let overrideCount = 0;
for (const [bottleId, overrides] of Object.entries(BOTTLE_STATE_SCARCITY_OVERRIDES)) {
  assert.match(bottleId, /^[a-z0-9-]+$/, "state override keys must use canonical bottle IDs");
  const validated = validateStateScarcityOverrides(overrides);
  assert.equal(validated.length, overrides.length);
  for (const override of validated) {
    overrideCount += 1;
    for (const sourceId of override.sourceIds) {
      assert.ok(sourceIds.has(sourceId), `${bottleId}/${override.jurisdiction} references unknown evidence ${sourceId}`);
    }
  }
}
for (const [bottleId, officialProductName] of Object.entries(ALABAMA_ALLOCATED_PRODUCT_MATCHES)) {
  assert.equal(canonicalBottleId(bottleId), bottleId, `${bottleId} must be canonical before Alabama evidence is attached`);
  assert.ok(officialProductName.length >= 8);
  const materialized = getBottleStateScarcityOverrides(bottleId, "regular");
  assert.equal(materialized.filter((item) => item.jurisdiction === "AL").length, 1, `${bottleId} must have one Alabama result`);
  overrideCount += 1;
}
assert.ok(Object.keys(ALABAMA_ALLOCATED_PRODUCT_MATCHES).length >= 35, "the Alabama pilot must cover the reviewed exact matches from the May 2026 official list");
assert.ok(overrideCount >= 37, "the evidence-backed pilot must contain multiple real state classifications");

const alBuffaloTrace = getBottleStateScarcityOverrides("buffalo-trace-bourbon", "regular").find((item) => item.jurisdiction === "AL");
assert.equal(alBuffaloTrace?.tier, "allocated", "Alabama's official master list must be represented as a local override, not a national tier");
assert.equal(alBuffaloTrace?.officialAllocationStatus, "state_allocated");
assert.equal(getBottleStateScarcityOverrides("george-t-stagg", "unicorn").find((item) => item.jurisdiction === "AL")?.tier, "unicorn", "an official allocated list must not downgrade a stronger national baseline");
assert.equal(getBottleStateScarcityOverrides("makers-mark", "regular").some((item) => item.jurisdiction === "AL"), false, "unmatched bottles must not inherit Alabama allocation");
const vaWeller12 = BOTTLE_STATE_SCARCITY_OVERRIDES["weller-12-year"]?.find((item) => item.jurisdiction === "VA");
assert.equal(vaWeller12?.tier, "highly_allocated", "raw curated fixtures remain legacy-compatible while all normalized classifications map to Unicorn");
assert.equal(vaWeller12?.officialAllocationStatus, "lottery");

for (const bottle of inventory as Array<Record<string, unknown>>) {
  const scarcity = normalizeBottleScarcity(bottle);
  assert.ok(["regular", "limited", "allocated", "unicorn"].includes(scarcity.nationalTier));
  assert.notEqual(scarcity.nationalTier, "regional", "regional must only be a distribution attribute");
  assert.notEqual(scarcity.nationalTier, "seasonal", "seasonal must only be a release-cadence attribute");
}

function stateOverride(jurisdiction: string, tier: StateScarcityOverride["tier"], sourceId: string): StateScarcityOverride {
  return {
    jurisdiction,
    tier,
    confidence: "medium",
    reason: `${sourceId} supports this classification.`,
    officialAllocationStatus: "state_allocated",
    verifiedOpportunityCount: 0,
    coverageDenominator: 0,
    evidenceWindow: { start: "2026-01-01", end: "2026-07-31" },
    sourceIds: [sourceId],
    lastReviewedAt: "2026-08-03",
  };
}

const merged = mergeBottleCatalogSources([
  [{
    id: "engine-bt",
    canonicalName: "Buffalo Trace Bourbon",
    availability: "unicorn",
    aliases: ["BT"],
    nationalTier: "unicorn",
    stateOverrides: [stateOverride("VA", "allocated", "engine"), stateOverride("NC", "highly_allocated", "engine")],
    isSignalTracked: true,
  }],
  [{
    id: "buffalo-trace-bourbon",
    canonicalName: "Buffalo Trace Bourbon",
    availability: "common",
    aliases: ["Buffalo Trace"],
    nationalTier: "regular",
    stateOverrides: [stateOverride("AL", "allocated", "official-al"), stateOverride("NC", "allocated", "official-nc")],
    isAlertEligible: true,
  }],
]);
assert.equal(merged.length, 1);
assert.equal(merged[0].nationalTier, "regular", "the higher-authority customer classification must own the national tier");
assert.equal(merged[0].isSignalTracked, true, "engine tracking metadata must survive the merge");
assert.equal(merged[0].isAlertEligible, true, "customer alert eligibility must survive the merge");
assert.deepEqual(
  merged[0].stateOverrides.map((item: StateScarcityOverride) => [item.jurisdiction, item.tier]),
  [["AL", "allocated"], ["NC", "allocated"], ["VA", "allocated"]],
  "non-conflicting jurisdictions must be retained while higher authority resolves a same-state conflict",
);

assert.equal(canonicalBottleId("buffalo-trace"), "buffalo-trace-bourbon");
assert.equal(canonicalBottleId("pappy-van-winkles-family-reserve-20y"), "pappy-van-winkle-20");
assert.equal(canonicalBottleId("stagg-bourbon"), "stagg");
assert.equal(canonicalBottleId("michters-25-year-kentucky-straight-bourbon"), "michters-25y-bourbon");
assert.equal(canonicalBottleId("bb_4e7a2ea067e741fd"), "new-riff-8-year-bourbon");
assert.equal(canonicalBottleId("elijah-craig-barrel-proof-small-batch"), "elijah-craig-barrel-proof");
const identityMerged = mergeBottleCatalogSources<any>([[{
  id: "buffalo-trace",
  canonicalName: "Buffalo Trace",
  availability: "allocated",
  aliases: ["BT"],
  isSignalTracked: true,
  stateOverrides: [stateOverride("VA", "allocated", "engine-va")],
}], [{
  id: "buffalo-trace-bourbon",
  canonicalName: "Buffalo Trace Bourbon",
  availability: "common",
  aliases: ["Buffalo Trace Kentucky Straight Bourbon"],
  stateOverrides: [stateOverride("AL", "allocated", "official-al")],
}]]);
assert.equal(identityMerged.length, 1, "known aliases must collapse before state records are attached");
assert.equal(identityMerged[0].id, "buffalo-trace-bourbon");
assert.deepEqual(identityMerged[0].stateOverrides.map((item: StateScarcityOverride) => item.jurisdiction), ["AL", "VA"]);
const annualIdentityMerged = mergeBottleCatalogSources<any>([[{
  id: "bb_8c124ba38652152c",
  canonicalName: "Old Fitzgerald 8 Year",
  availability: "limited",
  aliases: [],
}], [{
  id: "old-fitzgerald-8y-bottled-in-bond-decanter-2023",
  canonicalName: "Old Fitzgerald 8Y Bottled in Bond Decanter 2023",
  availability: "highly_allocated",
  aliases: [],
}]]);
assert.equal(annualIdentityMerged.length, 1, "an explicit reviewed redirect must outrank generic numeric variant protection");

const bibleSource = readFileSync(new URL("../src/lib/bourbonBible.ts", import.meta.url), "utf8");
assert.match(bibleSource, /normalizeBottleScarcity/);
assert.match(bibleSource, /getBottleStateScarcityOverrides/);
assert.match(bibleSource, /interface BibleBottle extends BottleScarcity/, "every built catalog bottle must carry the complete scarcity contract");
assert.match(bibleSource, /map\(\(bottle\): BibleBottle =>/, "the merge boundary must hydrate every legacy source into the complete scarcity contract");

const routeSource = readFileSync(new URL("../src/app/api/bottle-check/route.ts", import.meta.url), "utf8");
assert.match(routeSource, /resolveBottleScarcity/);
assert.doesNotMatch(routeSource, /LOCAL_SCARCITY_RULES|CONTROLLED_OR_ALLOCATED_MARKETS/, "hardcoded family regexes and blanket market rules must be retired");
assert.doesNotMatch(routeSource, /getStateRarityAdjustment/, "state labels must come from qualified evidence records rather than blanket score lifts");
assert.match(routeSource, /localClassificationEstablished/);
assert.match(routeSource, /classificationSource/);
assert.match(routeSource, /signalConfidence/);
assert.match(routeSource, /classificationConfidence/);
assert.match(routeSource, /classificationSupported/, "low-confidence baselines must not emit definitive scores or buying advice");

const catalogRoute = readFileSync(new URL("../src/app/api/bottle-catalog/route.ts", import.meta.url), "utf8");
for (const field of ["nationalTier", "nationalConfidence", "releaseCadence", "distributionScope", "scarcitySourceIds", "scarcityLastReviewedAt", "stateOverrides"]) {
  assert.match(catalogRoute, new RegExp(`${field}: bottle\\.${field}`), `catalog API must expose ${field}`);
}
assert.match(catalogRoute, /stateOverridesRequireEvidence: true/);
assert.match(catalogRoute, /BOTTLE_SCARCITY_SOURCE_REGISTRY/);

const pageSource = readFileSync(new URL("../src/app/bottle-check/page.tsx", import.meta.url), "utf8");
assert.match(pageSource, /National baseline/);
assert.match(pageSource, /Local classification not established/);
assert.match(pageSource, /resultStateName/);
assert.match(pageSource, /signal\?\.state \|\| submittedState/, "result labels must be bound to the state that produced the result");
assert.doesNotMatch(pageSource, /activeStateName/, "mutable selector state must not relabel an existing result");
assert.match(pageSource, /classificationIsUnderReview/, "the UI must suppress definitive rarity scores for unsupported classifications");
assert.match(pageSource, /releaseBadges/);
assert.doesNotMatch(pageSource, /availabilityLabels/, "Bottle Check must not render the legacy mixed availability taxonomy");
assert.doesNotMatch(pageSource, /scarcityLabels/, "Bottle Check must use the canonical label supplied by the scarcity model");

const packageSource = readFileSync(new URL("../package.json", import.meta.url), "utf8");
assert.match(packageSource, /test:bottle-scarcity/);
assert.match(packageSource, /audit:bottle-scarcity/);

console.log("Unified bottle scarcity integration contract passed.");
