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

assert.equal(getRarityProfile("allocated", "NC").score, 72, "a state alone must not apply a blanket scarcity lift");
assert.equal(getRarityProfile("allocated", "VA").score, 72, "market variation must come from a bottle-specific evidence record");
assert.equal(getRarityProfile("allocated", "KY").score, 72, "states without qualified local evidence retain the national anchor");
assert.equal(getRarityProfile("common", "NC").score, 20, "ordinary shelf bottles must not become scarce merely because a state uses controlled distribution");
assert.equal(getRarityProfile("unicorn", "NC").score, 100, "national unicorns remain bounded at the rarity scale maximum");
const northCarolinaScores = tiers.map((tier) => getRarityProfile(tier, "NC").score);
for (let index = 1; index < northCarolinaScores.length; index += 1) {
  assert.ok(northCarolinaScores[index] > northCarolinaScores[index - 1], `${tiers[index]} must still outrank ${tiers[index - 1]} after state adjustment`);
}

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
assert.match(bibleSource, /const approvedBottles: BibleBottleInput\[\] = await listApprovedBottles\(\)\.catch\([\s\S]*?mergeBottleCatalogSources\(\[\s*await readEngineBibleBottles\(\),\s*readInventoryBibleBottles\(\),\s*approvedBottles,\s*SEED_BOTTLES,\s*\]\)/, "engine alert data must remain lower authority than customer-facing inventory, approved additions, and curated rarity profiles");

const routeSource = readFileSync(new URL("../src/app/api/bottle-check/route.ts", import.meta.url), "utf8");
assert.match(routeSource, /resolveBottleScarcity/, "Bottle Check must resolve the selected market through evidence-backed scarcity records");
assert.match(routeSource, /scarcityTierToAvailability\(scarcity\.nationalTier\)/, "Bottle Check must preserve the national baseline when explaining local evidence");
assert.match(routeSource, /National baseline:/, "score copy must distinguish the national baseline from a local classification");
assert.match(routeSource, /const rarityScore = classificationSupported \? rarityProfile\.score : 20/, "Bottle Check must expose a tier-bounded rarity score only when the classification is supported");
assert.match(routeSource, /scoreStatus: "bible_baseline" \| "local_adjusted"/, "the existing API status enum must remain backward compatible");
assert.doesNotMatch(routeSource, /proofBoost|ageBoost|alertBoost|recencyBoost|opportunityBoost|abundancePenalty/, "proof, age, alert internals, and sightings must not distort rarity scores");

const pageSource = readFileSync(new URL("../src/app/bottle-check/page.tsx", import.meta.url), "utf8");
assert.match(pageSource, /classificationIsUnderReview \? "Evidence status" : "Rarity Score"/, "the UI must name the verified metric honestly and suppress it while evidence is under review");
assert.match(pageSource, /classificationIsUnderReview \? "—" : signal\.rarityScore/, "unsupported classifications must not display a definitive numeric rarity score");
assert.match(pageSource, /classificationIsUnderReview \? "This bottle's scarcity tier is still being sourced\. Use recent local sightings and price context; do not treat the current tier as verified\." : \(signal\?\.verdict \|\| bottle\.guidance\)/, "the primary in-store read must independently suppress purchase advice while evidence is under review");
assert.match(pageSource, /classificationIsUnderReview \? "Purchase guidance is withheld until this classification has enough evidence\." : bottle\.guidance/, "unsupported classifications must not leak assertive editorial purchase guidance");
assert.match(pageSource, /if \(score >= 86\) return "hot";[\s\S]*?if \(score >= 58\) return "warm";[\s\S]*?if \(score >= 35\) return "medium";/, "score colors must align with the rarity tier anchors");
assert.match(pageSource, /signal\.scoreBasis/, "the UI must explain the score basis returned by the API");
assert.doesNotMatch(pageSource, />Bottle Score</, "the ambiguous Bottle Score label must be retired");

console.log("Bottle Check rarity-score contract passed.");
