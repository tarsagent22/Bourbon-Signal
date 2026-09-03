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
  assert.match(add, /Recently on My Shelf/);
  assert.match(add, /Already owned|Tasted only/);
  assert.match(add, /updateMemberPreferences/);
  assert.match(add, /collectionPreferences\.version/);
});

test("native add keeps the simple owned-or-tasted flow and progressive optional details", () => {
  const add = read("app/(app)/cellar/add.tsx");
  for (const label of ["Add to My Shelf", "Search bourbon or whiskey", "Add a bottle", "Rate a whiskey", "Quantity", "Price paid", "Store", "Can.t find it\?", "Add this whiskey", "Near matches", "More cues"]) assert.match(add, new RegExp(label));
  assert.doesNotMatch(add, /canonical (?:bottle|library|Radar)|Purchase date|purchaseDate/i);
  assert.match(add, /submitBottleContribution/);
  assert.match(add, /createCustomCollectionBottle/);
  assert.match(add, /<ScoreSlider/);
  assert.doesNotMatch(add, /A real 0\.0 stays different from unrated/);
});

test("My Shelf has explicit component-state grid and dense list views with bottle and Glencairn states", () => {
  const cellar = read("app/(app)/(tabs)/cellar.tsx");
  const shelfDisplay = read("src/components/MyShelfDisplay.tsx");
  for (const label of ["My Shelf", "More filters", "All", "Owned", "Tasted", "Rated", "Unrated", "Open", "Sealed", "On my shelf", "My rating", "Add bottle", "Keep as tasted only", "Open one", "Mark one finished", "Acquisition", "Bottle details", "More cues"]) assert.match(cellar, new RegExp(label));
  assert.match(cellar, /type CellarViewMode = "grid" \| "list"/);
  assert.match(cellar, /useState<CellarViewMode>\("grid"\)/);
  assert.match(cellar, /accessibilityRole="radiogroup"/);
  assert.match(cellar, /function ViewModeButton/);
  assert.match(cellar, /active \? `✓ \$\{label\}` : label/, "view mode selection is not communicated by color alone");
  assert.match(cellar, /const QUICK_COLLECTION_FILTERS/);
  assert.match(cellar, /<ScrollView accessibilityLabel="Filter My Shelf" accessibilityRole="radiogroup"/, "quick status filters expose their grouped radio relationship");
  assert.match(cellar, /function CollectionFilterChip/);
  assert.match(cellar, /Sort: \{COLLECTION_SORT_LABELS\[sort\]\}/, "the primary toolbar exposes the active sort");
  assert.doesNotMatch(cellar, /resultSetChanged \? `\$\{bottles\.length\} shown` : `\$\{bottles\.length\} bottle/, "the summary count is not redundantly repeated below the filters");
  assert.match(cellar, /accessibilityRole="radio"/);
  assert.match(cellar, /accessibilityState=\{\{ checked:/);
  assert.match(cellar, /function WhiskeyListRow/);
  assert.match(cellar, /const kindLabel = kind === "owned" \? "Owned" : "Tasted only"/);
  assert.match(cellar, /styles\.inventory/, "the original centered inventory label remains in the grid card");
  assert.match(cellar, /width !== undefined && \{ flex: 0, width \}/, "two-column cards retain the native FlatList geometry that shipped before the regression");
  assert.match(cellar, /tile:\s*\{ flex: 1, minHeight: 180, alignItems: "center", justifyContent: "center"/, "grid cards retain their original centered composition");
  assert.match(cellar, /tileRating:\s*\{ color: colors\.accent, fontSize: 24/, "the original prominent rating treatment is restored");
  assert.doesNotMatch(cellar, /styles\.tileArtwork|styles\.tileCopy|styles\.tileStatus|flexBasis: "auto"/, "the regressed card wrapper and basis override stay removed");
  assert.match(cellar, /viewMode === "grid" \? <WhiskeyTile/);
  assert.match(cellar, /key=\{`cellar-\$\{viewMode\}-\$\{numColumns\}`\}/);
  assert.match(cellar, /numColumns/);
  assert.match(cellar, /tileWidth/);
  assert.match(cellar, /useWindowDimensions/);
  assert.match(cellar, /<CellarBottleSilhouette/);
  assert.match(cellar, /<CellarGlencairnSilhouette/);
  assert.match(cellar, /collectionDisplayKind/);
  assert.match(cellar, /styles\.listRating/);
  assert.match(cellar, /styles\.listInventory/);
  assert.match(cellar, /applyCollectionInventoryAction/);
  assert.match(cellar, /<ScoreSlider/);
  assert.doesNotMatch(cellar, /My bottles|Tastings|CellarMode|TastingRow/);
  assert.doesNotMatch(cellar, /More options/);
  assert.doesNotMatch(cellar, /A real 0\.0 stays different from unrated/);
  assert.match(cellar, /Would you buy it again\?/);
  assert.match(cellar, /<ScrollView[^>]*contentContainerStyle=\{styles\.refineSheet\}/, "Filter and sort sheets remain reachable with large Dynamic Type");
  assert.match(cellar, /refineSheet:\s*\{\s*flexGrow:\s*1/, "Refine content can grow beyond the sheet viewport");
  assert.match(cellar, /allowSwipeDismissal=\{!dirty && !busy\}/, "dirty or busy editors cannot be dismissed underneath visible React state");
  assert.match(cellar, /numberOfLines=\{3\}/, "long whiskey names get a third line before truncation");
  assert.match(cellar, /cellarContent:\s*\{[^}]*paddingBottom:\s*112/, "the final row clears the bottom navigation");
  assert.match(cellar, /tile:\s*\{[^}]*minHeight:\s*180/, "the grid shows more whiskey without changing its information hierarchy");
  assert.match(cellar, /preferences\?\.collectionAccess/, "native My Shelf renders server-authoritative capacity state");
  assert.match(cellar, /Your free shelf is full/);
  assert.match(cellar, /Existing bottles stay available/);
  assert.match(cellar, /data=\{visibleBottles\}/);
  assert.match(cellar, /useState\(12\)/);
  assert.match(cellar, /bottles\.slice\(0, visibleCount\)/);
  assert.match(cellar, /Show \{Math\.min\(12, bottles\.length - visibleBottles\.length\)\} more/);
  assert.match(cellar, /<MyShelfDisplay/);
  assert.match(shelfDisplay, /display:\s*\{[\s\S]*?height:\s*140,/, "the decorative shelf stays compact enough to expose collection content");
  assert.match(shelfDisplay, /accessibilityHint="Decorative summary; exact counts appear above\."/, "the shelf cannot be mistaken for one illustration per owned bottle");
  const footer = cellar.indexOf("ListFooterComponent");
  const huntNext = cellar.indexOf("Hunt next", footer);
  const dna = cellar.indexOf("Your Bourbon DNA", footer);
  assert.ok(footer >= 0 && huntNext > footer && dna > huntNext, "Hunt next and Bourbon DNA follow the visible collection");
  assert.doesNotMatch(cellar, /Cellar is not included with this membership/);
});

test("Bourbon DNA is entitlement-gated collection evidence with confidence and a next action", () => {
  const cellar = read("app/(app)/(tabs)/cellar.tsx");
  assert.match(cellar, /buildBourbonDna/);
  assert.match(cellar, /canUseRecommendations \? <View style=\{styles\.dnaCard\}>/);
  assert.match(cellar, /Barrel Proof and Founder memberships add Bourbon DNA/);
  assert.match(cellar, /bourbonDna\.supportedTraits/);
  assert.match(cellar, /bourbonDna\.confidence\.label/);
  assert.match(cellar, /bourbonDna\.confidence\.detail/);
  assert.match(cellar, /bourbonDna\.nextAction\.label/);
  assert.match(cellar, /onPress=\{improveBourbonDna\}/);
  assert.match(cellar, /bottles you rated 8\.0 or higher/);
  assert.doesNotMatch(cellar, /Proof range|mash-bill|mash bill|chemistry compatibility/i);
});

test("Signal detail respects My Shelf addition capacity without hiding existing data", () => {
  const detail = read("app/(app)/signal/[id].tsx");
  assert.match(detail, /collectionAccess\?\.canAdd/);
  assert.match(detail, /Free shelf is full/);
  assert.match(detail, /Already on My Shelf/);
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
