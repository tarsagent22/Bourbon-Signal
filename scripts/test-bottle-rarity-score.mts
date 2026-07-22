import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getRarityProfile } from "../src/lib/bottle-rarity-score.ts";
import { mergeBottleCatalogSources } from "../src/lib/bottle-catalog-merge.ts";

const tiers = [
  "common",
  "regional",
  "seasonal",
  "limited",
  "allocated",
  "highly_allocated",
  "unicorn",
] as const;

const scores = tiers.map((tier) => getRarityProfile(tier).score);
assert.deepEqual(scores, [20, 35, 45, 58, 72, 86, 100], "rarity tiers must map to stable, intuitive score anchors");
for (let index = 1; index < scores.length; index += 1) {
  assert.ok(scores[index] > scores[index - 1], `${tiers[index]} must always outrank ${tiers[index - 1]}`);
}
assert.equal(getRarityProfile("unicorn").label, "Unicorn bottle");
assert.equal(getRarityProfile("highly_allocated").label, "Extremely hard to find");
assert.equal(getRarityProfile("allocated").label, "Allocated bottle");
assert.deepEqual(getRarityProfile("not_a_tier" as never), { score: 20, label: "Rarity not yet classified" }, "malformed catalog tiers must fail safely instead of crashing or implying rarity");

const inventory = JSON.parse(readFileSync(new URL("../src/data/bourbonBibleInventory.json", import.meta.url), "utf8")) as Array<Record<string, unknown>>;
const eagleRare25 = inventory.find((bottle) => bottle.id === "eagle-rare-25y");
assert.ok(eagleRare25, "Eagle Rare 25 must remain in the Bottle Check catalog");
assert.equal(eagleRare25.availability, "unicorn", "Eagle Rare 25 must be classified as a unicorn, not merely allocated");
assert.equal(eagleRare25.buyerVerdict, "special_find", "Eagle Rare 25 must use the top rarity guidance tier");
assert.ok(getRarityProfile("unicorn").score > getRarityProfile("highly_allocated").score, "Eagle Rare 25 must outrank Eagle Rare 12's highly allocated tier");

const mergedEagleRare12 = mergeBottleCatalogSources([
  [{ id: "engine-er12", canonicalName: "Eagle Rare 12 Year", availability: "unicorn", aliases: ["ER12"], isSignalTracked: true, isAlertEligible: true }],
  [{ id: "eagle-rare-12", canonicalName: "Eagle Rare 12 Year", availability: "highly_allocated", aliases: ["Eagle Rare 12"], isSignalTracked: true, isAlertEligible: true }],
]);
assert.equal(mergedEagleRare12.length, 1, "the same canonical bottle must not survive as conflicting source-specific duplicates");
assert.equal(mergedEagleRare12[0].id, "eagle-rare-12", "the higher-priority curated record must own the merged identity");
assert.equal(mergedEagleRare12[0].availability, "highly_allocated", "engine alert tiers must not overwrite curated rarity tiers");
assert.deepEqual(new Set(mergedEagleRare12[0].aliases), new Set(["ER12", "Eagle Rare 12", "Eagle Rare 12 Year"]), "merged records must retain useful aliases");

const mergedWeller12 = mergeBottleCatalogSources([
  [{ id: "engine-w12", canonicalName: "Weller 12Y", availability: "unicorn", aliases: ["W.L. Weller 12 Year"], isSignalTracked: true }],
  [{ id: "weller-12-year", canonicalName: "W.L. Weller 12 Year", availability: "highly_allocated", aliases: ["Weller 12", "Weller Twelve"] }],
]);
assert.equal(mergedWeller12.length, 1, "canonical and alias variants must merge across sources");
assert.equal(mergedWeller12[0].availability, "highly_allocated", "variant matching must still preserve the higher-authority profile");

const distinctEagleRareAges = mergeBottleCatalogSources([[
  { id: "er10", canonicalName: "Eagle Rare 10 Year", availability: "allocated", aliases: ["ER10", "Eagle Rare"] },
  { id: "er12", canonicalName: "Eagle Rare 12 Year", availability: "highly_allocated", aliases: ["ER12", "Eagle Rare"] },
]]);
assert.equal(distinctEagleRareAges.length, 2, "identity normalization must not collapse distinct age-stated expressions");

const distinctPappyAges = mergeBottleCatalogSources([[
  { id: "pappy-15", canonicalName: "Pappy Van Winkle 15 Year", availability: "unicorn", aliases: ["Pappy"] },
  { id: "pappy-20", canonicalName: "Pappy Van Winkle 20 Year", availability: "unicorn", aliases: ["Pappy"] },
]]);
assert.equal(distinctPappyAges.length, 2, "a shared broad alias must not collapse distinct expressions");

const distinctWellerEditions = mergeBottleCatalogSources([[
  { id: "weller-special-reserve", canonicalName: "Weller Special Reserve", availability: "allocated", aliases: ["Weller Green", "Weller SR"] },
  { id: "weller-special-reserve-sib", canonicalName: "Weller Special Reserve Single Barrel Select", availability: "limited", aliases: ["Weller Green", "Weller SR"] },
]]);
assert.equal(distinctWellerEditions.length, 2, "shared multi-word nicknames must not collapse distinct bottle editions");

const engineEagleRare25 = { ...eagleRare25, id: "engine-er25", canonicalName: "Eagle Rare 25 Year", availability: "allocated", aliases: ["Eagle Rare 25Y"], isSignalTracked: true } as never;
const mergedEagleRare25 = mergeBottleCatalogSources([[engineEagleRare25], [eagleRare25 as never]]);
assert.equal(mergedEagleRare25[0].availability, "unicorn", "inventory editorial rarity must override engine alert priority for ER25");
assert.equal(mergedEagleRare25[0].isSignalTracked, true, "engine tracking metadata must survive the editorial override");

const bibleSource = readFileSync(new URL("../src/lib/bourbonBible.ts", import.meta.url), "utf8");
assert.match(bibleSource, /signalBottle\("eagle-rare-12",[\s\S]*?"highly_allocated"/, "Eagle Rare 12 must retain its curated highly allocated profile");
assert.match(bibleSource, /mergeBottleCatalogSources\(\[\s*await readEngineBibleBottles\(\),\s*readInventoryBibleBottles\(\),\s*SEED_BOTTLES,\s*\]\)/, "engine alert data must be applied before customer-facing inventory and curated rarity profiles");

const routeSource = readFileSync(new URL("../src/app/api/bottle-check/route.ts", import.meta.url), "utf8");
assert.match(routeSource, /getRarityProfile\(marketAvailability\.availability\)/, "Bottle Check must derive score from the final rarity tier");
assert.match(routeSource, /const rarityScore = rarityProfile\.score/, "Bottle Check must expose the tier-anchored rarity score");
assert.match(routeSource, /scoreStatus: "bible_baseline" \| "local_adjusted"/, "the existing API status enum must remain backward compatible");
assert.doesNotMatch(routeSource, /proofBoost|ageBoost|alertBoost|recencyBoost|opportunityBoost|scarcityLift|abundancePenalty/, "proof, age, alert internals, and sightings must not distort rarity scores");

const pageSource = readFileSync(new URL("../src/app/bottle-check/page.tsx", import.meta.url), "utf8");
assert.match(pageSource, />Rarity Score</, "the UI must name the metric honestly");
assert.match(pageSource, /if \(score >= 86\) return "hot";[\s\S]*?if \(score >= 58\) return "warm";[\s\S]*?if \(score >= 35\) return "medium";/, "score colors must align with the rarity tier anchors");
assert.match(pageSource, /signal\.scoreBasis/, "the UI must explain the score basis returned by the API");
assert.doesNotMatch(pageSource, />Bottle Score</, "the ambiguous Bottle Score label must be retired");

console.log("Bottle Check rarity-score contract passed.");
