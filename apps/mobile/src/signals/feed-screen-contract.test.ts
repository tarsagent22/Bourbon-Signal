import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const feed = readFileSync(resolve(process.cwd(), "app/(app)/(tabs)/index.tsx"), "utf8");

function position(fragment: string) {
  const index = feed.indexOf(fragment);
  assert.notEqual(index, -1, `missing ${fragment}`);
  return index;
}

test("Home opens directly on fresh Intel and member sightings", () => {
  const toggle = position('accessibilityLabel="Signal feed view"');
  const geography = position('accessibilityLabel="Signal geography filters"');
  const search = position('placeholder="Search bottle name"');
  const rarity = position('accessibilityLabel="Bottle rarity filters"');

  assert.ok(toggle < geography && geography < search && search < rarity);
  assert.match(feed, />Intel<\/Text>/);
  assert.match(feed, />Community<\/Text>/);
  assert.match(feed, /No fresh Intel Signals are available right now/);
  assert.match(feed, /No member sightings yet/);
  assert.doesNotMatch(feed, /Home overview|Your Bourbon Signal home|OPEN RADAR/);
  assert.doesNotMatch(feed, /Trip Mode|tripMode|trip-mode|SecureStore/);
  assert.doesNotMatch(feed, /getMemberPreferences|getMemberAlerts|radarWatchlistSummary|radarMonitoringSummary/);
  assert.doesNotMatch(feed, /Open Signal filters|Filter Signals|filterOpen|filterSheet/);
  assert.match(feed, /showsVerticalScrollIndicator=\{false\}/);
});

test("State and Area remain a stable pair while Area is disabled until State is selected", () => {
  assert.match(feed, /label="State"[\s\S]*?icon="map-marker-outline"/);
  assert.match(feed, /label=\{areaLabel\}[\s\S]*?disabled=\{!filters\.state\}/);
  assert.doesNotMatch(feed, /filters\.state \? <OptionChooser/);
  assert.doesNotMatch(feed, /geographySoloRow|filterChooserSolo/);
  assert.match(feed, /accessibilityState=\{\{ expanded, disabled \}\}/);
  assert.match(feed, /disabled=\{disabled\}/);
});

test("Signal Feed keeps Intel terminology while preserving the internal market transport value", () => {
  assert.match(feed, /type FeedView = "market" \| "community"/);
  assert.match(feed, />Intel<\/Text>/);
  assert.doesNotMatch(feed, />Market<\/Text>|Market Signals|market intelligence/);
  assert.match(feed, /No Intel Signals match these tiers right now/);
});

test("bottle search expands on demand without adding a permanent control block", () => {
  assert.match(feed, /const \[searchExpanded, setSearchExpanded\] = useState\(false\)/);
  assert.match(feed, /searchExpanded \|\| bottleQuery/);
  assert.match(feed, /accessibilityLabel=\{searchExpanded \? "Close bottle search" : "Search bottle name"\}/);
  assert.match(feed, /<FlatList[\s\S]*?keyboardShouldPersistTaps="handled"/);
});

test("Home uses a compact scoped ticker rather than another rounded card", () => {
  assert.match(feed, /recentTickerSignals\(visibleSignals, filters\.state,/);
  assert.match(feed, /const timer = setInterval[\s\S]*?5_000/);
  assert.match(feed, /translateY/);
  assert.match(feed, /tickerDivider/);
  assert.doesNotMatch(feed, /tickerMarker/);
  assert.doesNotMatch(feed, /· Reported \{relativeSignalTime/);
  assert.doesNotMatch(feed, /ItemSeparatorComponent/);
});

test("the fixed shelf backdrop remains behind pull-to-refresh until Signals begin", () => {
  const backdrop = position("style={styles.homeBackdrop}");
  const list = position("      <FlatList");
  assert.ok(backdrop < list);
  assert.match(feed, /const homeBackdrop = \(/);
  assert.match(feed, /source=\{require\("\.\.\/\.\.\/\.\.\/assets\/home-shelf-header\.jpg"\)\}/);
  assert.match(feed, /styles\.homeBackdropShade/);
  assert.match(feed, /styles\.homeBackdropFade/);
});
