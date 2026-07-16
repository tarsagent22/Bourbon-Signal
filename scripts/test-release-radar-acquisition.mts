import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  getMarketHandoffHref,
  getTrackableBottleRelation,
  isRadarEntryAlertGrade,
  radarEntries,
} from "../src/lib/release-radar.ts";
import { buildReleaseRadarIcs } from "../src/lib/release-radar-ics.ts";
import {
  followRadarRelease,
  normalizeRadarPreferences,
} from "../src/lib/release-radar-preferences.ts";

assert.ok(radarEntries.every((entry) => entry.availabilitySemantics === "announcement_only"), "Radar records must stay in the announcement lane");
assert.ok(radarEntries.every((entry) => !isRadarEntryAlertGrade(entry)), "no Radar announcement may become alert-grade availability");
assert.ok(radarEntries.every((entry) => ["official", "verified"].includes(entry.verificationStatus)), "records need an official or verified status");
assert.ok(radarEntries.every((entry) => entry.markets.length > 0), "records need structured market coverage");
assert.ok(radarEntries.every((entry) => entry.relationships.every((relation) => relation.targetSlug !== entry.slug)), "records cannot relate to themselves");
assert.ok(radarEntries.every((entry) => entry.calendar === (entry.datePrecision === "exact")), "only exact dates may enter calendar/ICS surfaces");
assert.ok(radarEntries.every((entry) => entry.followEligibility.release || entry.followEligibility.bottle), "every acquisition record needs a follow or track action");
assert.ok(radarEntries.filter((entry) => entry.followEligibility.bottle).every((entry) => getTrackableBottleRelation(entry)), "trackable records need a canonical bottle relation");
assert.equal(new Set(radarEntries.flatMap((entry) => entry.bottleRelations.map((relation) => relation.canonicalId))).has(""), false, "canonical bottle ids cannot be empty");

const nationwideBottle = radarEntries.find((entry) => entry.markets.some((market) => market.code === "US") && getTrackableBottleRelation(entry));
assert.ok(nationwideBottle, "fixture needs a nationwide bottle handoff");
assert.match(getMarketHandoffHref(nationwideBottle, "VA"), /^\/bottle-check\?[^#]*state=VA/, "bottle handoff should preserve the selected market");
assert.doesNotMatch(getMarketHandoffHref(nationwideBottle, "VA"), /email|user|bottleId/i, "handoffs must not expose member or internal identifiers");
const stateRelease = radarEntries.find((entry) => !getTrackableBottleRelation(entry) && entry.markets.some((market) => market.code === "VA"));
assert.ok(stateRelease, "fixture needs a state release handoff");
assert.match(getMarketHandoffHref(stateRelease, "VA"), /^\/\?[^#]*state=VA#drops$/, "non-bottle handoff should preserve the market in the public feed");
const dropFeedSource = readFileSync(resolve("src/components/sections/DropFeed.tsx"), "utf8");
assert.match(dropFeedSource, /feedStateParam\s*=\s*urlStateFilter\s*\|\|/, "a Radar market handoff must filter the public preview without adding a paywall");

const preciseEntries = radarEntries.filter((entry) => entry.datePrecision === "exact");
const broadEntries = radarEntries.filter((entry) => entry.datePrecision === "window");
const ics = buildReleaseRadarIcs(radarEntries, { origin: "https://www.bourbonsignal.com" });
assert.match(ics, /^BEGIN:VCALENDAR\r\n/, "ICS must use the calendar envelope and CRLF line endings");
assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, preciseEntries.reduce((count, entry) => count + (entry.occurrenceDates?.length || 1), 0), "each precise occurrence should produce one event");
for (const entry of preciseEntries) assert.match(ics, new RegExp(`UID:[^\\r\\n]*${entry.slug}`), `ICS should include ${entry.slug}`);
for (const entry of broadEntries) assert.doesNotMatch(ics, new RegExp(entry.slug), `broad window ${entry.slug} must stay out of ICS`);
assert.match(ics, /X-BOURBON-SIGNAL-SEMANTICS:announcement-only/, "calendar exports must preserve non-inventory semantics");

const normalized = normalizeRadarPreferences({
  followedReleases: [
    { releaseSlug: "four-roses-anthology-chapter-one-origin", marketCodes: ["va", "VA", "<script>"], followedAt: "2026-07-16T12:00:00.000Z" },
    { releaseSlug: "../../bad", marketCodes: ["NC"], followedAt: "not-a-date" },
  ],
});
assert.deepEqual(normalized, {
  followedReleases: [{ releaseSlug: "four-roses-anthology-chapter-one-origin", marketCodes: ["VA"], followedAt: "2026-07-16T12:00:00.000Z" }],
});
const followed = followRadarRelease(normalized, "four-roses-anthology-chapter-one-origin", ["NC", "VA"], "2026-07-16T13:00:00.000Z");
assert.deepEqual(followed.followedReleases[0], {
  releaseSlug: "four-roses-anthology-chapter-one-origin",
  marketCodes: ["NC", "VA"],
  followedAt: "2026-07-16T12:00:00.000Z",
}, "following again should merge markets without fabricating a new follow timestamp");

const detailSource = readFileSync(resolve("src/app/release-radar/[kind]/[slug]/page.tsx"), "utf8");
assert.match(detailSource, /RadarEntryActions/, "detail pages should expose follow/track acquisition actions");
const actionSource = readFileSync(resolve("src/components/release-radar/RadarEntryActions.tsx"), "utf8");
assert.match(actionSource, /Follow release/);
assert.match(actionSource, /Track bottle/);
assert.match(actionSource, /aria-live="polite"/, "action status must be announced accessibly");
assert.match(actionSource, /useWatchlistStore/, "bottle tracking should reuse the existing watchlist");
assert.match(actionSource, /radarPreferences/, "release follows should reuse account preferences");
assert.doesNotMatch(actionSource, /\/pricing|checkout|upgrade/i, "public Radar acquisition actions must not add a paywall");

const routeSource = readFileSync(resolve("src/app/release-radar/calendar.ics/route.ts"), "utf8");
assert.match(routeSource, /text\/calendar/);
assert.match(routeSource, /Content-Disposition/);
const workflowSource = readFileSync(resolve(".github/workflows/ci.yml"), "utf8");
assert.doesNotMatch(workflowSource, /release-radar-scout/, "the silent scout must not be installed as a live CI or cron job");
const alertDeliverySource = readFileSync(resolve("src/lib/alert-delivery.ts"), "utf8");
assert.doesNotMatch(alertDeliverySource, /radarPreferences/, "announcement follows must not enter alert delivery inputs");

const temp = mkdtempSync(join(tmpdir(), "radar-scout-"));
try {
  const input = join(temp, "candidates.json");
  const output = join(temp, "scout-output.json");
  const draft = join(temp, "draft-pr.md");
  writeFileSync(input, JSON.stringify({ candidates: [{
    title: "Example official release",
    sourceUrl: "https://example.com/official-release",
    sourceType: "official",
    datePrecision: "exact",
    startDate: "2026-08-20",
    markets: ["VA"],
    canonicalBottleRelations: [{ canonicalId: "example-release", canonicalName: "Example Release", relationship: "featured" }],
    relationships: [{ targetSlug: "related-release", relationship: "related" }],
  }] }));
  const run = spawnSync(process.execPath, [
    resolve("automation/bourbon-signal/release-radar-scout.mjs"),
    `--input=${input}`,
    `--output=${output}`,
    `--draft-pr=${draft}`,
  ], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "", "the scout should be silent by default");
  const scout = JSON.parse(readFileSync(output, "utf8"));
  assert.equal(scout.mode, "draft-only");
  assert.equal(scout.liveCron, false);
  assert.equal(scout.canPublish, false);
  assert.equal(scout.candidates[0].availabilitySemantics, "announcement_only");
  assert.deepEqual(scout.candidates[0].followEligibility, { release: true, bottle: true });
  assert.deepEqual(scout.candidates[0].canonicalBottleRelations, [{ canonicalId: "example-release", canonicalName: "Example Release", relationship: "featured" }]);
  assert.deepEqual(scout.candidates[0].relationships, [{ targetSlug: "related-release", relationship: "related" }]);
  assert.equal(scout.candidates[0].review.required, true);
  const draftBody = readFileSync(draft, "utf8");
  assert.match(draftBody, /Draft Release Radar scout/);
  assert.doesNotMatch(draftBody, /gh pr create|git push|deploy/i, "draft support must not publish or push");
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log("Release Radar acquisition contracts passed.");
