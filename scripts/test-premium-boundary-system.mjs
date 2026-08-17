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

for (const phrase of ["Your radar", "Tracked bottles", "Alert mode", "Recent matches", "View all matches", "Post a sighting"]) {
  assert.ok(sources.dashboard.includes(phrase), `Dashboard should include the member-priority surface: ${phrase}`);
}
assert.equal(sources.dashboard.includes("personal-signal-brief"), false, "Dashboard should not repeat market, bottle, and match totals in a second statistics strip");
assert.ok(sources.dashboard.includes('<SignalPointsPanel preview compact />'), "Dashboard should use the compact rewards summary");
assert.ok(sources.signalPoints.includes("compact?: boolean"), "Signal Points should expose an explicit compact dashboard mode");
assert.ok(sources.signalPoints.includes("points-dashboard-summary"), "Compact Signal Points should render a dedicated dashboard summary");
assert.ok(sources.dashboard.includes(".filter((drop) => isRealDropEvent(drop))"), "Recent matches should include only real member-facing drops");
assert.ok(sources.dashboard.includes(".filter((drop) => dropMatchesAreaPreferences(drop, localPrefs))"), "Recent matches should honor saved markets");
assert.ok(sources.dashboard.includes('alertMode === "anything_notable" ||'), "Anything-notable mode should show qualifying market signal without requiring a bottle match");
assert.equal(sources.dashboard.includes("watchedBottleOptions.length === 0) return"), false, "Anything-notable mode should not become empty when the member has no bottle watchlist");
assert.ok(sources.dashboard.includes("if (!mounted || localPrefs.states.length === 0) return"), "Recent matches should stay empty until the member saves a market");
const deliveryCounter = sources.dashboard.match(/const alertDeliveryChannelCount = useMemo\(\(\) => \[([^\]]+)\]/s)?.[1] || "";
assert.equal(deliveryCounter.includes("sightings"), false, "Member sightings are an alert topic, not a delivery channel");
assert.ok(sources.signalPoints.includes("!data.redemptionEligible"), "Compact rewards should explain redemption eligibility for free members");
assert.ok(sources.dashboard.includes('<Link href="/#drops">View all matches'), "View all matches should open the complete Drop Feed rather than one bottle filter");
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
