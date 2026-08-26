import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("Cellar add uses a dedicated native route, local indexed search, and duplicate-safe upsert", () => {
  const layout = read("app/(app)/_layout.tsx");
  const cellar = read("app/(app)/(tabs)/cellar.tsx");
  const add = read("app/(app)/cellar/add.tsx");
  assert.match(layout, /cellar\/add/);
  assert.match(cellar, /router\.push\(["']\/\(app\)\/cellar\/add["']\)/);
  assert.match(add, /listBottleCatalog\(\)/, "the complete canonical catalog is prefetched once instead of queried on every keystroke");
  assert.match(add, /useMemo\(\(\) => createBottleSearchIndex\(catalog\), \[catalog\]\)/, "the complete catalog is normalized once per catalog load");
  assert.match(add, /rankBottleCatalog/);
  assert.match(add, /collectionMatchForOption/);
  assert.match(add, /exactCustomBottleMatchIndex/);
  assert.match(add, /reconcilePendingCustom:\s*selectedSource === "catalog"/);
  assert.match(add, /upsertCollectionBottle/);
  assert.doesNotMatch(add, /setTimeout\([\s\S]*listRadarBottles/, "typing never waits for a debounced network request");
  assert.match(add, /Recently in your Cellar/);
  assert.match(add, /Already owned|Tasted only/);
  assert.match(add, /updateMemberPreferences/);
  assert.match(add, /collectionPreferences\.version/);
});

test("native add keeps the simple owned-or-tasted flow and progressive optional details", () => {
  const add = read("app/(app)/cellar/add.tsx");
  for (const label of ["Add to Cellar", "Search bourbon or whiskey", "Add a bottle", "Rate a whiskey", "Quantity", "Price paid", "Store", "Can.t find it\?", "Add this whiskey", "Near matches", "More cues"]) assert.match(add, new RegExp(label));
  assert.doesNotMatch(add, /canonical (?:bottle|library|Radar)|Purchase date|purchaseDate/i);
  assert.match(add, /submitBottleContribution/);
  assert.match(add, /createCustomCollectionBottle/);
  assert.match(add, /<ScoreSlider/);
  assert.doesNotMatch(add, /A real 0\.0 stays different from unrated/);
});

test("Cellar is one responsive grid with bottle and Glencairn states", () => {
  const cellar = read("app/(app)/(tabs)/cellar.tsx");
  for (const label of ["Refine", "All", "Owned", "Tasted only", "Rated", "Unrated", "Open now", "Sealed", "In my Cellar", "My rating", "Add bottle", "Keep as tasted only", "Open one", "Mark one finished", "Acquisition", "Bottle details", "More cues"]) assert.match(cellar, new RegExp(label));
  assert.match(cellar, /numColumns/);
  assert.match(cellar, /tileWidth/);
  assert.match(cellar, /useWindowDimensions/);
  assert.match(cellar, /<CellarBottleSilhouette/);
  assert.match(cellar, /<CellarGlencairnSilhouette/);
  assert.match(cellar, /collectionDisplayKind/);
  assert.match(cellar, /applyCollectionInventoryAction/);
  assert.match(cellar, /<ScoreSlider/);
  assert.doesNotMatch(cellar, /My bottles|Tastings|CellarMode|ModeButton|TastingRow/);
  assert.doesNotMatch(cellar, /More options/);
  assert.doesNotMatch(cellar, /A real 0\.0 stays different from unrated/);
  assert.match(cellar, /Would you buy it again\?/);
  assert.match(cellar, /<ScrollView contentContainerStyle=\{styles\.refineSheet\}/, "Refine remains reachable with large Dynamic Type");
  assert.match(cellar, /refineSheet:\s*\{\s*flexGrow:\s*1/, "Refine content can grow beyond the sheet viewport");
  assert.match(cellar, /allowSwipeDismissal=\{!dirty && !busy\}/, "dirty or busy editors cannot be dismissed underneath visible React state");
});

test("rating control uses one stable responder, direct entry, and accessible fine controls", () => {
  const slider = read("src/components/ScoreSlider.tsx");
  assert.match(slider, /onResponderGrant/);
  assert.match(slider, /onResponderMove/);
  assert.match(slider, /onResponderRelease/);
  assert.match(slider, /onResponderTerminate=\{resetGesture\}/);
  assert.match(slider, /onResponderTerminationRequest=\{\(\) => gesture\.current\.intent !== "horizontal"\}/);
  assert.match(slider, /classifyScoreSliderGesture/);
  assert.match(slider, /TextInput/);
  assert.match(slider, /accessibilityRole="adjustable"/);
  assert.doesNotMatch(slider, /onTouchMove/);
});

test("Cellar uses universal bottle and Glencairn silhouettes without bottle-specific imagery", () => {
  const bottle = read("src/components/CellarBottleSilhouette.tsx");
  const glencairn = read("src/components/CellarGlencairnSilhouette.tsx");
  for (const source of [bottle, glencairn]) assert.doesNotMatch(source, /require\(|Image|bottleId|canonicalKey|assets\/cellar/);
});
