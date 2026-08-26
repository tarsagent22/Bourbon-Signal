import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("Cellar add uses a dedicated native route and server-ranked search", () => {
  const layout = read("app/(app)/_layout.tsx");
  const cellar = read("app/(app)/(tabs)/cellar.tsx");
  const add = read("app/(app)/cellar/add.tsx");
  assert.match(layout, /cellar\/add/);
  assert.match(cellar, /router\.push\(["']\/\(app\)\/cellar\/add["']\)/);
  assert.match(add, /listRadarBottles\(\{[^}]*query/);
  assert.match(add, /updateMemberPreferences/);
  assert.match(add, /collectionPreferences\.version/);
  assert.doesNotMatch(add, /Signals|\(tabs\).*index/);
});

test("native add uses plain copy, simplified lifecycle, acquisition, context, and progressive cues", () => {
  const add = read("app/(app)/cellar/add.tsx");
  for (const label of ["Add to Cellar", "Search bourbon or whiskey", "I own it", "I opened it", "I just tasted it", "Quantity", "Price paid", "Store", "Bar", "Bottle share", "Friend", "Event", "Other", "Can.t find it\?", "Add this bottle", "Near matches", "More cues"]) assert.match(add, new RegExp(label));
  assert.doesNotMatch(add, /canonical (?:bottle|library|Radar)|Purchase date|purchaseDate/i);
  assert.match(add, /submitBottleContribution/);
  assert.match(add, /createCustomCollectionBottle/);
  assert.doesNotMatch(add, /RECENT IN YOUR CELLAR/);
  assert.match(add, /Acquisition details/);
  assert.match(add, /saved\.collectionPreferences\.version/);
  assert.match(add, /contribution\.id/);
  assert.match(add, /submitBottleContribution\([\s\S]*entry\.bottleId/, "custom bottle submission uses its stable local bottle id for server idempotency");
  assert.match(add, /contributionSaved[\s\S]*bottleContributionId === contributionId[\s\S]*durableReceipts/, "receipt clearing requires the confirmed preference response to contain the contribution id");
  assert.match(add, /<ScoreSlider/);
  assert.doesNotMatch(add, /split\(["']\s*,\s*["']\)/, "taste tags are toggles, not comma-separated input");
});

test("Cellar uses a responsive grid, tastings mode, compact refinement, and simplified editor", () => {
  const cellar = read("app/(app)/(tabs)/cellar.tsx");
  for (const label of ["My bottles", "Tastings", "Refine", "All owned", "Open now", "Sealed backups", "Recently rated", "Just tasted", "Finished", "Inventory", "My tasting", "Acquisition", "More options", "Open a bottle", "Add another", "Finished an open bottle", "Correct quantities", "More cues"]) assert.match(cellar, new RegExp(label));
  assert.match(cellar, /numColumns/);
  assert.match(cellar, /tileWidth/);
  assert.match(cellar, /useWindowDimensions/);
  assert.match(cellar, /<CellarBottleSilhouette/);
  assert.match(cellar, /<ScoreSlider/);
  assert.match(cellar, /accessibilityRole="button" onPress=\{onPress\}/);
  assert.doesNotMatch(cellar, /Purchase date|purchaseDate/i);
  for (const label of ["Not sure", "Buy again", "Wouldn.t", "Acquisition details", "Bar", "Bottle share", "Friend", "Event", "Other"]) assert.match(cellar, new RegExp(label));
  assert.doesNotMatch(cellar, /Boolean\(bottle\.wouldBuyAgain\)/);
  assert.match(cellar, /activeCollectionRefinementCount/);
  assert.match(cellar, /contribution\.id/);
  assert.match(cellar, /pendingCanonicalMatch[\s\S]*submitBottleContribution/, "pending bottle reports retry in the background without blocking local Cellar data");
  assert.match(cellar, /submitBottleContribution\([\s\S]*bottle\.bottleId/, "background retries reuse the stable local bottle id for server idempotency");
});

test("Cellar silhouette is universal and bottle-specific PNGs are not referenced", () => {
  const silhouette = read("src/components/CellarBottleSilhouette.tsx");
  assert.doesNotMatch(silhouette, /require\(|Image|bottleId|canonicalKey|assets\/cellar/);
  assert.match(silhouette, /width:\s*44/);
  assert.match(silhouette, /height:\s*62/);
});
