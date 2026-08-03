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

for (const selector of [".signal-strength-card", ".signal-dimension", ".dashboard-section-button"]) {
  assertNoFullBorder(sources.dashboard, selector);
}

for (const selector of [".sighting-feed-shell", ".sighting-card", ".sighting-empty-panel"]) {
  assertNoFullBorder(sources.sightings, selector);
}

assert.match(sources.dropFeed, /className="md:hidden dropfeed-signal-card"/, "Mobile Drop Feed records need a shared semantic class");
assert.match(sources.dropFeed, /\.dropfeed-signal-card\s*\{[^}]*border\s*:\s*0/s, "Drop Feed records should not use perimeter borders by default");

assert.match(ruleBody(sources.weekly, ".shell"), /border\s*:\s*1px\s+solid\s+var\(--boundary-accent\)/, "The editorial email preview is the intentional framed exception");

console.log("Premium boundary design contract passed.");
