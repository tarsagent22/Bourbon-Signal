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
  assert.match(add, /BOTTLE_CATALOG_SEED/, "search has a bundled catalog before the network refresh completes");
  assert.match(add, /useState<RadarBottleOption\[\]>\(BOTTLE_CATALOG_SEED\)/, "bundled suggestions are available on the first render");
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
  assert.match(cellar, /numberOfLines=\{3\}/, "long whiskey names get a third line before truncation");
  assert.match(cellar, /cellarContent:\s*\{[^}]*paddingBottom:\s*112/, "the final row clears the bottom navigation");
  assert.match(cellar, /tile:\s*\{[^}]*minHeight:\s*180/, "the grid shows more whiskey without changing its information hierarchy");
  assert.match(cellar, /preferences\?\.collectionAccess/, "native Cellar renders server-authoritative capacity state");
  assert.match(cellar, /Your Free Cellar is full/);
  assert.match(cellar, /Existing bottles stay available/);
  assert.match(cellar, /data=\{bottles\}/, "stored bottles remain visible after any tier change");
  assert.doesNotMatch(cellar, /Cellar is not included with this membership/);
});

test("Signal detail respects Cellar addition capacity without hiding existing data", () => {
  const detail = read("app/(app)/signal/[id].tsx");
  assert.match(detail, /collectionAccess\?\.canAdd/);
  assert.match(detail, /Free Cellar is full/);
  assert.match(detail, /Already in Cellar/);
});

test("rating control keeps its appearance but owns a held-thumb gesture from press through release", () => {
  const slider = read("src/components/ScoreSlider.tsx");
  assert.doesNotMatch(slider, /PanResponder|classifyScoreSliderGesture|gestureState/, "the thumb never changes responder ownership mid-drag");
  assert.match(slider, /onStartShouldSetResponder=\{\(\) => true\}/, "touching the slider claims the complete gesture immediately");
  assert.match(slider, /onResponderGrant=\{handleResponderGrant\}/);
  assert.match(slider, /onResponderMove=\{handleResponderMove\}/);
  assert.match(slider, /onResponderRelease=\{handleResponderRelease\}/);
  assert.match(slider, /onResponderTerminationRequest=\{\(\) => false\}/, "a held thumb cannot be stolen mid-drag");
  assert.match(slider, /event\.nativeEvent\.pageX/, "every drag phase uses stable screen coordinates");
  assert.doesNotMatch(slider, /measureTrack\(\(\) => setFromPageX/, "a delayed measurement cannot replay the original press after a newer move");
  assert.match(slider, /measureTrack\(\);\s*setFromPageX\(pageX\);/, "grant refreshes bounds without deferring its score update");
  assert.match(slider, /scoreFromTrackPageX/);
  assert.match(slider, /Keyboard\.dismiss/);
  assert.match(slider, /TextInput/);
  assert.match(slider, /accessibilityRole="adjustable"/);
  for (const unchangedVisual of [
    /track:\s*\{ height: 8, borderRadius: 999/,
    /thumb:\s*\{ position: "absolute", top: -8, width: 24, height: 24, marginLeft: -12/,
    /stepButton:\s*\{ minWidth: 64, minHeight: 44/,
  ]) assert.match(slider, unchangedVisual, "the approved slider visuals stay unchanged");
});

test("Cellar add dismisses the keyboard when members move from search into form controls", () => {
  const add = read("app/(app)/cellar/add.tsx");
  assert.match(add, /keyboardDismissMode=/);
  assert.match(add, /Keyboard\.dismiss\(\)/);
  assert.match(add, /<ScoreSlider[^>]*onInteractionStart=\{Keyboard\.dismiss\}/);
});

test("Cellar uses universal bottle and Glencairn silhouettes without bottle-specific imagery", () => {
  const bottle = read("src/components/CellarBottleSilhouette.tsx");
  const glencairn = read("src/components/CellarGlencairnSilhouette.tsx");
  assert.doesNotMatch(bottle, /require\(|Image|bottleId|canonicalKey|assets\/cellar/);
  assert.match(glencairn, /const glencairnArtwork = require\("\.\.\/\.\.\/assets\/icons\/cellar-glencairn\.png"\)/);
  assert.doesNotMatch(glencairn, /bottleId|canonicalKey|assets\/cellar|Record<|Map\(/);
  assert.doesNotMatch(glencairn, /MaterialCommunityIcons|glass-tulip|wine/i);
});
