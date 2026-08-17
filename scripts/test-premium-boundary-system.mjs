import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const files = {
  globals: "src/app/globals.css",
  coverage: "src/components/coverage/coverage.module.css",
  coverageSummary: "src/components/coverage/CoverageSummary.module.css",
  bottleCheck: "src/app/bottle-check/page.tsx",
  dashboard: "src/app/dashboard/page.tsx",
  signalPoints: "src/components/SignalPointsPanel.tsx",
  areaPreferences: "src/hooks/useAreaPreferences.ts",
  sightings: "src/app/sightings/SightingsClient.tsx",
  dropFeed: "src/components/sections/DropFeed.tsx",
  weekly: "src/components/dashboard/WeeklyIntelligenceCard.module.css",
};

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, relativePath]) => [
      key,
      await readFile(path.join(root, relativePath), "utf8"),
    ]),
  ),
);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ruleBody(source, selector) {
  const match = source.match(new RegExp(`${escapeRegex(selector)}\\s*\\{([^}]*)\\}`, "m"));
  assert.ok(match, `Expected CSS rule for ${selector}`);
  return match[1];
}

function assertNoFullBorder(source, selector) {
  const declarations = [...ruleBody(source, selector).matchAll(/(?:^|;)\s*border\s*:\s*([^;]+)/gm)]
    .map((match) => match[1].trim().toLowerCase());
  assert.ok(
    declarations.every((value) => value === "0" || value === "none"),
    `${selector} should use spacing, surface tone, or a divider instead of a full perimeter border`,
  );
}

for (const selector of [
  ".finder-hero-wrap",
  ".finder-tool-shell",
  ".dropfeed-state-panel",
  ".finder-summary-card",
  ".finder-panel",
  ".finder-where-panel",
  ".finder-signal-explainer",
  ".finder-stat-card",
  ".finder-result-hero",
  ".finder-subpanel",
]) {
  assertNoFullBorder(sources.globals, selector);
}

for (const token of [
  "--boundary-subtle",
  "--boundary-control",
  "--boundary-accent",
  "--surface-soft",
  "--radius-control",
  "--radius-feature",
]) {
  assert.match(sources.globals, new RegExp(`${escapeRegex(token)}\\s*:`), `Missing semantic design token ${token}`);
}

for (const selector of [".mapFrame", ".detailPanel"]) {
  assertNoFullBorder(sources.coverage, selector);
}
assertNoFullBorder(sources.coverageSummary, ".metrics div");
assert.doesNotMatch(ruleBody(sources.coverage, ".mapLegend"), /border-width\s*:\s*0\s+1px\s+1px/, "Coverage legend should not complete the map frame box");

for (const selector of [".bc-search-card", ".bc-panel", ".bc-verdict-card, .bc-detail-card"]) {
  assertNoFullBorder(sources.bottleCheck, selector);
}

for (const selector of [".radar-summary-card", ".dashboard-section-button"]) {
  assertNoFullBorder(sources.dashboard, selector);
}

for (const phrase of ["Your radar", "Your alerts are active", "Watchlist", "All notable drops", "Latest matches", "Browse Drop Feed", "Post a sighting"]) {
  assert.ok(sources.dashboard.includes(phrase), `Dashboard should include the newcomer-priority surface: ${phrase}`);
}
assert.equal(sources.dashboard.includes("personal-signal-brief"), false, "Dashboard should not repeat market, bottle, and match totals in a second statistics strip");
assert.equal(sources.dashboard.includes("View all matches"), false, "Dashboard should not offer a zero-state View all matches action beside the Drop Feed action");
assert.equal(sources.dashboard.includes("Find bottles"), false, "Dashboard should not duplicate Drop Feed navigation with an ambiguous Find bottles action");
assert.equal(sources.dashboard.includes('`${watchlistSignals.length} recent match'), false, "The hero should not repeat the latest-match count shown in the briefing");
assert.ok(sources.dashboard.includes("No matching signals in your saved market right now."), "The configured empty state should acknowledge a quiet market without telling members with a watchlist to add bottles");
assert.ok(sources.dashboard.includes("dashboardMarketSummary"), "Dashboard should identify the member's saved market rather than only showing a count");
assert.ok(sources.dashboard.includes("enabledDeliveryLabels"), "Dashboard should identify enabled delivery channels rather than only showing a count");
assert.ok(sources.dashboard.includes('<SignalPointsPanel preview compact />'), "Dashboard should use the compact rewards summary");
assert.ok(sources.signalPoints.includes("compact?: boolean"), "Signal Points should expose an explicit compact dashboard mode");
assert.ok(sources.signalPoints.includes("points-dashboard-summary"), "Compact Signal Points should render a dedicated dashboard summary");
assert.ok(sources.dashboard.includes(".filter((drop) => isRealDropEvent(drop))"), "Latest matches should include only real member-facing drops");
assert.ok(sources.dashboard.includes(".filter((drop) => dropMatchesAreaPreferences(drop, savedAreaPrefs))"), "Latest matches should honor persisted saved markets rather than unsaved form edits");
assert.ok(sources.dashboard.includes('savedAlertMode === "anything_notable" ||'), "Anything-notable mode should show qualifying market signal without requiring a bottle match");
assert.equal(sources.dashboard.includes("watchedBottleOptions.length === 0) return"), false, "Anything-notable mode should not become empty when the member has no bottle watchlist");
assert.ok(sources.dashboard.includes("if (!mounted || savedAreaPrefs.states.length === 0) return"), "Latest matches should stay empty until the member saves a market");
assert.ok(sources.dashboard.includes("Choose a bottle to start seeing specific matches."), "Specific-bottle mode should explain that an empty saved watchlist cannot produce matches");
assert.ok(sources.dashboard.includes("const dashboardPrefs = confirmedAlertPrefs ?? prefs") && sources.dashboard.includes("const savedAreaPrefs = dashboardPrefs.areaPreferences"), "Active and saved claims should derive from the last confirmed preferences, not editable or in-flight form state");
assert.ok(sources.dashboard.includes("getDropIdentityKeys(drop)"), "Saved bottle matching should use persisted identity keys without waiting for the alert bottle library");
assert.ok(sources.dashboard.includes("recentDropsLoading") && sources.dashboard.includes("recentDropsError"), "Latest-match copy should distinguish loading and failure from a truly quiet market");
assert.ok(sources.dashboard.includes("Checking your saved markets…") && sources.dashboard.includes("Matches are temporarily unavailable."), "Latest matches should use honest loading and error messages");
assert.ok(sources.dashboard.includes('loading={prefsLoading || savingLocations || !confirmedAlertPrefs}') && sources.dashboard.includes("Loading your saved setup"), "Radar should not claim setup is incomplete before persisted preferences load or while an alert save is pending");
assert.ok(sources.dashboard.includes("preferenceError") && sources.dashboard.includes("Saved setup is temporarily unavailable."), "Dashboard should distinguish a preference-load failure from an empty setup");
assert.ok(sources.dashboard.includes("removedBottlePreferenceKeys") && sources.dashboard.includes("preservedBottleNames") && sources.dashboard.includes("preservedBottleKeys"), "Saving should preserve persisted bottle criteria that are not currently hydrated unless the member explicitly removes them");
assert.ok(sources.dashboard.includes("...confirmedAlertPrefs.bottleAlertPreferences.bottleNames") && sources.dashboard.includes("...confirmedAlertPrefs.bottleAlertPreferences.bottleKeys"), "Tracking a recommendation should add to confirmed bottle criteria rather than replacing items missing from the optional bottle library");
assert.ok(sources.areaPreferences.includes("preferenceError") && sources.areaPreferences.includes("confirmedPrefs") && sources.areaPreferences.includes("Failed to load saved preferences"), "Preference hook should expose last-confirmed settings and an initial-load failure instead of treating optimistic or empty defaults as confirmed");
const deliveryLabels = sources.dashboard.match(/const enabledDeliveryLabels = useMemo\(\(\) => \[([^\]]+)\]/s)?.[1] || "";
assert.equal(deliveryLabels.includes("sightings"), false, "Member sightings are an alert topic, not a delivery channel");
assert.ok(sources.signalPoints.includes("!data.redemptionEligible"), "Compact rewards should explain redemption eligibility for free members");
assert.ok(sources.signalPoints.includes("compactActionLabel"), "Compact rewards should distinguish an available reward from the generic catalog");
assert.ok(sources.signalPoints.includes('"View available reward"'), "Compact rewards should not promise direct redemption when the CTA opens the rewards overview");
assert.ok(sources.dashboard.includes('<Link className="dashboard-action-primary" href="/#drops">Browse Drop Feed'), "Browse Drop Feed should be the primary next action for a quiet new-member dashboard");
assert.ok(sources.dashboard.indexOf('<nav className="dashboard-quick-actions"') < sources.dashboard.indexOf('renderSectionButton("alerts")'), "Quick actions should stay in the briefing above expandable drawers");
assert.ok(sources.dashboard.indexOf('renderSectionButton("alerts")') < sources.dashboard.indexOf('<SignalPointsPanel preview compact />'), "Alerts should appear before dashboard rewards");
assert.ok(sources.dashboard.indexOf('renderSectionButton("collection")') < sources.dashboard.indexOf('<SignalPointsPanel preview compact />'), "Collection should appear before dashboard rewards");

for (const selector of [".sighting-feed-shell", ".sighting-card", ".sighting-empty-panel"]) {
  assertNoFullBorder(sources.sightings, selector);
}

assert.match(sources.dropFeed, /className="md:hidden dropfeed-signal-card"/, "Mobile Drop Feed records need a shared semantic class");
assert.match(sources.dropFeed, /\.dropfeed-signal-card\s*\{[^}]*border\s*:\s*0/s, "Drop Feed records should not use perimeter borders by default");

assert.match(ruleBody(sources.weekly, ".shell"), /border\s*:\s*1px\s+solid\s+var\(--boundary-accent\)/, "The editorial email preview is the intentional framed exception");

console.log("Premium boundary design contract passed.");
