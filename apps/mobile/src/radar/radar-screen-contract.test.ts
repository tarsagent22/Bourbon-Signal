import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const mobileRoot = process.cwd();
const readScreen = (name: "radar" | "post") => readFileSync(resolve(mobileRoot, `app/(app)/(tabs)/${name}.tsx`), "utf8");

test("Radar uses one Watchlist destination for criteria, bottles, delivery, and areas", () => {
  const radar = readScreen("radar");

  assert.match(radar, /type RadarView = "matches" \| "watchlist";/);
  assert.match(radar, /const VIEWS[^\n]+label: "Matches"[^\n]+label: "Watchlist"/);
  assert.doesNotMatch(radar, /const VIEWS[^\n]+label: "Watches"/);
  assert.doesNotMatch(radar, /const VIEWS[^\n]+label: "Areas"/);
  assert.match(radar, /view === "watchlist" \? <WatchlistView/);
});

test("alert-inbox navigation always restores Matches even after Watchlist", () => {
  const radar = readScreen("radar");

  assert.match(radar, /useLocalSearchParams/);
  assert.match(radar, /section: requestedSection, request/);
  assert.match(radar, /if \(requestedSection === "matches" && request\) setView\("matches"\)/);
  assert.match(radar, /\[requestedSection, request\]/);
});

test("Watchlist only shows bottle management for specific-bottle alerts", () => {
  const radar = readScreen("radar");

  assert.match(radar, /preferences\.alertMode === "specific_bottles" \? <BottleWatchlist/);
  assert.doesNotMatch(radar, /preferences\.alertMode === "anything_notable" \? <BottleWatchlist/);
});

test("Watchlist expansion disappears when no bottles remain hidden", () => {
  const radar = readScreen("radar");

  assert.match(radar, /watchlist\.totalCount > 3 \? <TextAction/);
  assert.match(radar, /expanded=\{showAll\}/);
  assert.match(radar, /accessibilityState=\{\{ expanded \}\}/);
  assert.match(radar, /if \(showAll && watchlist\.totalCount <= 3\) setShowAll\(false\)/);
});

test("Post explains the community and points value", () => {
  const post = readScreen("post");

  assert.match(post, />Share bottle sightings with the community and earn points<\/Text>/);
  assert.doesNotMatch(post, /Choose the bottle and retailer\. Add only what you observed\./);
});
