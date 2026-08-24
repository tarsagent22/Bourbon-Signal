import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dropClassificationModule = await import("../src/lib/drop-classification.ts");
const dropsModule = await import("../src/lib/drops.ts");
const {
  buildDropClassificationIndex,
  DROP_FEED_CLASSIFICATION_TIERS,
  getDropClassificationIndex,
  resolveDropClassification,
} = (dropClassificationModule.default || dropClassificationModule) as typeof import("../src/lib/drop-classification.ts");
const { groupDrops, TIER_CONFIG } = (dropsModule.default || dropsModule) as typeof import("../src/lib/drops.ts");

const bottle = {
  id: "weller-12-year",
  canonicalName: "Weller 12 Year",
  aliases: ["W. L. Weller 12 Year"],
  nationalTier: "allocated" as const,
  nationalConfidence: "medium" as const,
  releaseCadence: "ongoing" as const,
  distributionScope: "national" as const,
  classificationReason: "National fixture",
  classificationSource: "curated" as const,
  sourceIds: ["fixture-national"],
  evidenceWindow: { start: "2026-01-01", end: "2026-08-03" },
  lastReviewedAt: "2026-08-03",
  stateOverrides: [
    {
      jurisdiction: "VA",
      tier: "highly_allocated" as const,
      confidence: "high" as const,
      reason: "Virginia fixture",
      officialAllocationStatus: "lottery" as const,
      verifiedOpportunityCount: 1,
      coverageDenominator: 1,
      evidenceWindow: { start: "2026-01-01", end: "2026-08-03" },
      sourceIds: ["fixture-va"],
      lastReviewedAt: "2026-08-03",
    },
  ],
};

const regularBottle = {
  ...bottle,
  id: "everyday-bourbon",
  canonicalName: "Everyday Bourbon",
  aliases: [],
  nationalTier: "regular" as const,
  stateOverrides: [],
};

const index = buildDropClassificationIndex([bottle, regularBottle]);
assert.match(index.version, /^[a-f0-9]{16}$/, "the classification index must expose a stable cursor version");
assert.notEqual(
  index.version,
  buildDropClassificationIndex([{ ...bottle, nationalTier: "unicorn" }, regularBottle]).version,
  "changing a classification must invalidate Drop Feed cursors",
);
assert.notEqual(
  index.version,
  buildDropClassificationIndex([{ ...bottle, aliases: ["Different Alias"] }, regularBottle]).version,
  "changing a lookup alias must invalidate Drop Feed cursors",
);
const cachedBottles = [bottle, regularBottle];
assert.equal(
  getDropClassificationIndex(cachedBottles),
  getDropClassificationIndex(cachedBottles),
  "the request path must reuse the classification index while the Bourbon Bible array is cached",
);

const generatedCatalog = JSON.parse(readFileSync(new URL("../src/data/drop-feed-classification.generated.json", import.meta.url), "utf8"));
const generatedIndexStartedAt = performance.now();
const generatedIndex = buildDropClassificationIndex(generatedCatalog.records);
const generatedIndexMs = performance.now() - generatedIndexStartedAt;
assert.ok(generatedCatalog.records.length >= 1_000, "the generated Drop Feed artifact must contain the full canonical catalog");
assert.ok(generatedIndex.byId.size >= 1_000, "the generated classification index must retain canonical bottle identity");
assert.ok(generatedIndexMs < 250, `the generated classification index must remain fast enough for a cold request (received ${generatedIndexMs.toFixed(1)}ms)`);

const westVirginiaEzra = resolveDropClassification({
  bottle_id: "bb_1799afb0fab6e7bd",
  bottle_name: "Ezra Brooks Stave Finish Spice & Clove",
  state: "WV",
  rarity_tier: "limited",
}, generatedIndex);
assert.equal(westVirginiaEzra.bottleId, "ezra-brooks-stave-finish-spice-and-clove", "the official WV source identity must resolve to the reviewed canonical bottle");
assert.equal(westVirginiaEzra.tier, "limited", "the current WV special release must remain visible without changing its national tier");
assert.equal(westVirginiaEzra.source, "state_override", "WV special-release evidence must remain state-scoped");

const virginia = resolveDropClassification({
  canonicalId: "weller-12-year",
  canonicalName: "Weller 12 Year",
  state: "VA",
  tier: "unicorn",
}, index);
assert.equal(virginia.tier, "unicorn", "state classification must outrank the signal's legacy tier and normalize it");
assert.equal(virginia.source, "state_override");
assert.equal(virginia.state, "VA");
assert.equal(virginia.nationalTier, "allocated");

const northCarolina = resolveDropClassification({
  bottleId: "weller-12-year",
  bottleName: "Weller 12 Year",
  state: "NC",
  rarity_tier: "unicorn",
}, index);
assert.equal(northCarolina.tier, "allocated", "a missing state classification must fall back to the national tier");
assert.equal(northCarolina.source, "national_baseline");

const groupedStates = groupDrops([
  {
    timestamp: "2026-08-03T12:00:00.000Z",
    event_type: "new_shipment",
    brand_name: "Weller 12 Year",
    rarity_tier: "allocated",
    classification_source: "national_baseline",
    classification_state: "NC",
    classification_bottle_id: "weller-12-year",
    national_tier: "allocated",
    state: "NC",
    state_code: "NC",
    board_name: "NC Board",
    is_user_facing_drop: true,
  },
  {
    timestamp: "2026-08-03T12:00:00.000Z",
    event_type: "new_shipment",
    brand_name: "Weller 12 Year",
    rarity_tier: "highly_allocated",
    classification_source: "state_override",
    classification_state: "VA",
    classification_bottle_id: "weller-12-year",
    national_tier: "allocated",
    state: "VA",
    state_code: "VA",
    board_name: "VA Store",
    is_user_facing_drop: true,
  },
]);
assert.equal(groupedStates.length, 2, "same-bottle signals from different states must never share a card group");
assert.deepEqual(
  groupedStates.map((drop) => [drop.state, drop.rarity_tier, drop.classificationState]).sort(),
  [["NC", "allocated", "NC"], ["VA", "unicorn", "VA"]],
  "each state card must retain its own resolved classification",
);
assert.equal(northCarolina.state, "NC");

const aliasMatch = resolveDropClassification({
  rawName: "W. L. Weller 12 Year",
  state: "VA",
  tier: "limited",
}, index);
assert.equal(aliasMatch.bottleId, "weller-12-year", "aliases must resolve before state evidence attaches");
assert.equal(aliasMatch.tier, "unicorn");

const signalFallback = resolveDropClassification({
  rawName: "Unknown Fixture Bottle",
  state: "VA",
  tier: "limited",
}, index);
assert.equal(signalFallback.tier, "limited");
assert.equal(signalFallback.source, "signal", "unmatched signals must preserve their existing tier instead of borrowing another bottle's classification");

const regular = resolveDropClassification({
  canonicalId: "everyday-bourbon",
  state: "NC",
  tier: "limited",
}, index);
assert.equal(regular.tier, "regular", "the resolver may identify a regular bottle so the public eligibility gate can exclude it");
assert.equal(regular.source, "national_baseline");
assert.equal(TIER_CONFIG.regular, undefined, "the Drop Feed must not expose a Regular presentation");
assert.deepEqual(DROP_FEED_CLASSIFICATION_TIERS, ["unicorn", "allocated", "limited"]);
assert.equal(DROP_FEED_CLASSIFICATION_TIERS.includes("regular" as never), false, "Regular must not become a Drop Feed filter tier");

const apiSource = readFileSync(new URL("../src/app/api/drops/route.ts", import.meta.url), "utf8");
const evidenceSource = readFileSync(new URL("../src/lib/public-drop-evidence.ts", import.meta.url), "utf8");
const dropsSource = readFileSync(new URL("../src/lib/drops.ts", import.meta.url), "utf8");
const feedSource = readFileSync(new URL("../src/components/sections/DropFeed.tsx", import.meta.url), "utf8");
const retailerSource = readFileSync(new URL("../src/lib/retailer-signal-feed.ts", import.meta.url), "utf8");
const packageSource = readFileSync(new URL("../package.json", import.meta.url), "utf8");
const generatorSource = readFileSync(new URL("./generate-drop-feed-classification.mts", import.meta.url), "utf8");

assert.doesNotMatch(generatorSource, /localeCompare/, "generated classification order must not depend on host locale");
assert.match(generatorSource, /compareCodeUnits/, "generated classification order must use a byte-stable comparator");
assert.match(generatorSource, /getStaticBourbonBible/, "generated classification must exclude machine-local durable catalog records");
assert.match(apiSource, /DROP_FEED_CLASSIFICATION_TIERS/, "API filters must share the canonical feed tier set");
assert.match(apiSource, /resolveDropClassification/, "API must resolve classifications before returning cards");
assert.match(apiSource, /classification_source/, "API cards must preserve whether the tier came from state or national evidence");
assert.doesNotMatch(apiSource, /retailerTierForAvailability|submission\.availability/, "free-form retailer availability text must never control scarcity classification");
assert.match(apiSource, /classification:\$\{classificationIndex\.version\}/, "pagination snapshots must include the classification version");
assert.match(evidenceSource, /"unicorn", "highly_allocated", "allocated", "limited"/, "Highly Allocated must be eligible while Regular remains excluded");
assert.match(dropsSource, /highly_allocated:[\s\S]*?label: "UNICORN"/, "legacy card data must render as Unicorn");
assert.match(apiSource, /tier === "highly_allocated" \? "unicorn"/, "legacy API filters and records must normalize to Unicorn");
assert.match(feedSource, /TIER_CARD_HIGHLIGHTS[\s\S]*?highly_allocated:/, "Signal Cards must have a dedicated Highly Allocated highlight");
assert.match(feedSource, /classificationSource === "state_override"[\s\S]*?in \$\{stateLabel\}/, "expanded cards must explain state-specific classifications");
assert.match(feedSource, /National classification used because no \$\{stateLabel\} classification is available\./, "expanded cards must explain national fallback only in details");
assert.doesNotMatch(feedSource, /tier: "highly_allocated", label:/, "Highly Allocated must not remain a customer-facing filter");
assert.doesNotMatch(feedSource, /tier: "regular"/, "Drop Feed must not add a Regular filter");
assert.match(packageSource, /"test:drop-feed-classification"/, "the classification contract must be exposed as a package script");

console.log("Drop Feed classification contract passed.");
