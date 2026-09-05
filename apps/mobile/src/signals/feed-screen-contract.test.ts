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
  assert.doesNotMatch(feed, /Trip Mode|tripMode|trip-mode/);
  assert.doesNotMatch(feed, /getMemberPreferences|getMemberAlerts|radarWatchlistSummary|radarMonitoringSummary/);
  assert.doesNotMatch(feed, /Open Signal filters|Filter Signals|filterOpen|filterSheet/);
  assert.doesNotMatch(feed, /canUseFilters/);
  assert.match(feed, /showsVerticalScrollIndicator=\{false\}/);
});

test("Home restores user-scoped browsing filters without touching Radar preferences", () => {
  assert.match(feed, /homeBrowsingStorageKey\(userId\)/);
  assert.match(feed, /loadHomeBrowsingPreferences/);
  assert.match(feed, /saveHomeBrowsingPreferences/);
  assert.doesNotMatch(feed, /getMemberPreferences|updateMemberPreferences|notificationPreferences|monitoringScopes/);
  assert.match(feed, /loadedBrowsingStorageKey === browsingStorageKey/);
});

test("immediate rarity and bottle input invalidate pending Home restore", () => {
  assert.match(feed, /const applyRarityFilters = useCallback\(\(next: SignalFeedFilters\) => \{\s*browsingMutationSequence\.current \+= 1;/);
  assert.match(feed, /onChangeText=\{\(value\) => \{\s*browsingMutationSequence\.current \+= 1;/);
});

test("Home location controls say All states and expose one-tap location clearing", () => {
  assert.match(feed, /placeholder="All states"/);
  assert.match(feed, /clearLabel="All states"/);
  assert.match(feed, /accessibilityLabel="Clear Home location filters"/);
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

test("inline filters stay mounted and receive the first tap while search is focused", () => {
  const applyFilters = feed.match(/const applyFilters = useCallback\([\s\S]*?\}, \[areaDirectory, view\]\);/)?.[0] || "";
  assert.ok(applyFilters);
  assert.doesNotMatch(applyFilters, /setAccess\(null\)/);
  assert.match(feed, /<FlatList[\s\S]*?keyboardShouldPersistTaps="handled"/);
  assert.ok((feed.match(/keyboardShouldPersistTaps="handled"/g) || []).length >= 3);
});
