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
  const identityReset = feed.match(/useEffect\(\(\) => \{\s*let current = true;[\s\S]*?\}, \[browsingStorageKey\]\);/)?.[0] || "";
  assert.match(identityReset, /setSignals\(\[\]\)/, "one member's feed must not remain mounted for another identity");
  assert.match(identityReset, /requestSequence\.current \+= 1/);
  assert.match(identityReset, /profileRequestSequence\.current \+= 1/);
  assert.match(identityReset, /setProfile\(null\)/);
  assert.match(identityReset, /setRemoteAreaOptions\(\[\]\)/);
});

test("immediate rarity and bottle input invalidate pending Home restore", () => {
  assert.match(feed, /const applyRarityFilters = useCallback\(\(next: SignalFeedFilters\) => \{\s*browsingMutationSequence\.current \+= 1;/);
  assert.match(feed, /onChangeText=\{\(value\) => \{\s*browsingMutationSequence\.current \+= 1;/);
});

test("auth failures fence overlapping feed requests and identity reloads profile", () => {
  assert.match(feed, /apiError\?\.status === 401 \|\| apiError\?\.status === 403\) \{\s*requestSequence\.current \+= 1;/);
  assert.match(feed, /if \(accessChanged\) \{\s*requestSequence\.current \+= 1;/);
  assert.match(feed, /useEffect\(\(\) => \{ if \(browsingStorageKey\) void loadProfile\(true\); \}, \[browsingStorageKey, loadProfile\]\)/);
});

test("snapshot cursor expiry preserves reading position until explicit refresh", () => {
  const block = feed.split('if (apiError?.resetCursor && !refresh) {')[1].split('} else handleError')[0];
  assert.match(block, /setHasMore\(false\)/);
  assert.doesNotMatch(block, /setSignals\(\[\]\)|setLoaded\(false\)/);
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

test("Home shows an honest scoped report ticker with native detail navigation", () => {
  const ticker = position('accessibilityLabel="Recent reports"');
  const toggle = position('accessibilityLabel="Signal feed view"');
  assert.ok(ticker < toggle);
  assert.match(feed, /recentTickerSignals\(visibleSignals, new Date\(tickerNow\)\)/);
  assert.match(feed, /Reported \{relativeSignalTime\(tickerSignal\.timing\.displayAt\)\}/);
  assert.match(feed, /pathname: "\/(?:\(app\)\/)?signal\/\[id\]"/);
  assert.doesNotMatch(feed, /\bLive\b|marquee/);
  assert.match(feed, /accessibilityLabel="Show next recent report"/);
});

test("background refresh queues scoped ids without resetting pagination", () => {
  assert.match(feed, /reconcileQueuedSignals\(displayed, current, scopedIncoming, latestDisplayedBaselineRef\.current\)/);
  assert.match(feed, /reconcileDisplayedSignals\(displayed, scopedIncoming, page\.hasMore\)/);
  assert.match(feed, /acceptQueuedSignals\(current, queuedSignals\)/);
  assert.match(feed, /accessibilityLiveRegion="polite"/);
  assert.match(feed, /scrollToOffset\(\{ offset: 0, animated: !motionDisabled \}\)/);
  assert.match(feed, /capturedScope !== scopeKeyRef\.current/);
  assert.match(feed, /setInterval\(\(\) => \{ void poll\(\); \}, 60_000\)/);
  assert.doesNotMatch(feed.match(/const acceptNewSignals[\s\S]*?\}, \[motionDisabled, queuedSignals\]\);/)?.[0] || "", /setCursor|setHasMore/);
  const pollEffect = feed.match(/useEffect\(\(\) => \{\s*if \(!screenActive \|\| !browsingLoaded[\s\S]*?\}, \[[^\]]+\]\);/)?.[0] || "";
  assert.doesNotMatch(pollEffect.slice(pollEffect.lastIndexOf("}, [")), /visibleSignals|signals\]/, "signal updates must not restart polling");
  assert.match(pollEffect, /caught\.status === 401 \|\| caught\.status === 403/);
  assert.match(pollEffect, /accessChanged[\s\S]*?setSignals\(scopedIncoming\)[\s\S]*?setQueuedSignals\(\[\]\)/);
});

test("ticker crossfade and rotation are active-screen only and honor assistive preferences", () => {
  assert.match(feed, /screenFocused && appState === "active"/);
  assert.match(feed, /AccessibilityInfo\.isReduceMotionEnabled/);
  assert.match(feed, /AccessibilityInfo\.isScreenReaderEnabled/);
  assert.match(feed, /const \[reduceMotion, setReduceMotion\] = useState\(true\)/);
  assert.match(feed, /const \[screenReaderEnabled, setScreenReaderEnabled\] = useState\(true\)/);
  assert.match(feed, /if \(!screenActive \|\| motionDisabled \|\| tickerSignals\.length < 2\)/);
  assert.match(feed, /Animated\.timing\(tickerOpacity, \{ toValue: 1, duration: 180, useNativeDriver: true \}\)/);
  assert.match(feed, /generation !== tickerAnimationGeneration\.current/);
  assert.match(feed, /animation\.stop\(\)/);
  assert.match(feed, /clearInterval\(timer\)/);
});
