import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const mobileRoot = process.cwd();
const readScreen = (name: "radar" | "post") => readFileSync(resolve(mobileRoot, `app/(app)/(tabs)/${name}.tsx`), "utf8");

test("Radar defaults to results and offers a clearly named Settings destination", () => {
  const radar = readScreen("radar");
  assert.match(radar, /useState<RadarView>\("matches"\)/);
  assert.match(radar, /label: "Alerts"[^\n]+label: "Alert preferences"/);
  assert.match(radar, /radarSetupNeeded\(nextPreferences\)/);
});

test("alert-inbox navigation always restores Matches even after Watchlist", () => {
  const radar = readScreen("radar");

  assert.match(radar, /useLocalSearchParams/);
  assert.match(radar, /section: requestedSection, alert: requestedAlert, request/);
  assert.match(radar, /if \(requestedSection === "matches" && request\) \{ setView\("matches"\); void load\(true\)/);
  assert.match(radar, /\[load, requestedSection, request\]/);
});

test("Watchlist only shows bottle management for specific-bottle alerts", () => {
  const radar = readScreen("radar");

  assert.match(radar, /preferences\.alertMode === "specific_bottles" \? <BottleWatchlist/);
  assert.doesNotMatch(radar, /preferences\.alertMode === "anything_notable" \? <BottleWatchlist/);
});

test("Watchlist expansion disappears when no bottles remain hidden", () => {
  const radar = readScreen("radar");

  assert.match(radar, /VIEW ALL \$\{watchlist\.totalCount\} BOTTLES/);
  assert.match(radar, /expanded=\{showAll\}/);
  assert.match(radar, /accessibilityState=\{\{ expanded \}\}/);
  assert.match(radar, /if \(showAll && watchlist\.totalCount <= 3\) setShowAll\(false\)/);
});

test("preferences shows continuous sections with sightings beneath phone alerts", () => {
  const radar = readScreen("radar");
  for (const title of ["Bottles", "Locations", "Notifications"]) assert.ok(radar.includes(`<SectionTitle>${title}</SectionTitle>`));
  assert.match(radar, /bottle list and selected tiers must both match/);
  const sources = radar.indexOf('<SectionTitle>Bottles</SectionTitle>');
  const community = radar.indexOf('<ToggleRow label="Community sightings"');
  const notifications = radar.indexOf('<SectionTitle>Notifications</SectionTitle>');
  assert.ok(sources < notifications && notifications < community);
  assert.match(radar, /Member sightings in your watched areas/);
});

test("quiet watch removal offers an atomic Undo without replacing the full watchlist", () => {
  const radar = readScreen("radar");
  assert.match(radar, /Removed \{undoBottle\.name\}/);
  assert.match(radar, /label="UNDO"/);
  assert.match(radar, /watchlistMutation: bottleWatchMutation/);
  assert.doesNotMatch(radar, /onSetWatching[\s\S]{0,500}bottleAlertPreferences:/);
  assert.match(radar, /onSetWatching\(undoBottle\.name, true, true\)/);
});

test("preference refreshes cannot overwrite a mutation that starts or finishes in flight", () => {
  const radar = readScreen("radar");
  assert.match(radar, /const preferenceMutationAtStart = preferenceMutationEpoch\.current/);
  assert.match(radar, /preferenceMutationAtStart === preferenceMutationEpoch\.current/);
  assert.match(radar, /preferenceMutationEpoch\.current \+= 1/);
});

test("phone recovery retains action-specific retry and removes ambiguous count badges", () => {
  const radar = readScreen("radar");
  assert.match(radar, /Phone notifications need attention/);
  assert.doesNotMatch(radar, /item\.key === "matches" && alerts\.unreadCount/);
  assert.doesNotMatch(radar, /ToggleRow label="Radar inbox"/);
  assert.match(radar, /onSite: \{ enabled: true \}/);
  assert.match(radar, /pushRecoveryAction === "retry-disable"[\s\S]*togglePush\(false\)/);
  assert.match(radar, /Linking\.openSettings/);
});

test("current and history stay separate with useful empty states", () => {
  const radar = readScreen("radar");
  assert.match(radar, /current\.map\(\(alert\)/);
  assert.match(radar, /showPast \? past\.map/);
  assert.match(radar, /Past alerts \(\{past\.length\}\)/);
  assert.match(radar, /No recent alerts/);
  assert.doesNotMatch(radar, /freshness-qualified|Updated \{lastUpdated\}/);
  const row = readFileSync(resolve(mobileRoot, "src/radar/RadarAlertRow.tsx"), "utf8");
  assert.match(row, /View details/);
  assert.match(row, /availability unconfirmed/);
});

test("Post explains the community and points value", () => {
  const post = readScreen("post");

  assert.match(post, /description="Share a sighting\. Help your community\. Earn points\."/);
  assert.doesNotMatch(post, /Choose the bottle and retailer\. Add only what you observed\./);
});

test("Radar main destinations have no promotional copy or stacked result tabs", () => {
  const radar = readScreen("radar");
  assert.doesNotMatch(radar, /Watching for your next find|Your bottles\. Your locations|YOUR RADAR|Changes save automatically|Choose what to watch/);
  assert.doesNotMatch(radar, /label=\{`Current|label=\{`History/);
  assert.match(radar, /setFocusNotifications\(true\); setView\("settings"\)/);
  assert.match(radar, /view === "matches" && pushReadiness === "Setup needed"/);
});
