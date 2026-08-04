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
  releaseRadarUpdatedAt,
} from "../src/lib/release-radar.ts";
import { collectReleaseRadarLeads } from "../automation/bourbon-signal/release-radar-lead-collector.mjs";
import { buildReleaseRadarIcs } from "../src/lib/release-radar-ics.ts";
import {
  followRadarRelease,
  normalizeRadarPreferences,
} from "../src/lib/release-radar-preferences.ts";
import { dropMatchesBottle } from "../src/lib/bottleIdentity.ts";
import { resolveRadarMarketInitialization } from "../src/lib/release-radar-market.ts";

assert.ok(radarEntries.every((entry) => entry.availabilitySemantics === "announcement_only"), "Radar records must stay in the announcement lane");
assert.ok(radarEntries.every((entry) => !isRadarEntryAlertGrade(entry)), "no Radar announcement may become alert-grade availability");
assert.ok(radarEntries.every((entry) => ["official", "verified"].includes(entry.verificationStatus)), "records need an official or verified status");
assert.ok(radarEntries.every((entry) => entry.markets.length > 0), "records need structured market coverage");
assert.ok(radarEntries.every((entry) => entry.relationships.every((relation) => relation.targetSlug !== entry.slug)), "records cannot relate to themselves");
assert.ok(radarEntries.every((entry) => entry.calendar === (entry.datePrecision === "exact")), "only exact dates may enter calendar/ICS surfaces");
assert.ok(radarEntries.every((entry) => entry.followEligibility.release || entry.followEligibility.bottle), "every acquisition record needs a follow or track action");
assert.ok(radarEntries.filter((entry) => entry.followEligibility.bottle).every((entry) => getTrackableBottleRelation(entry)), "trackable records need a canonical bottle relation");
assert.equal(new Set(radarEntries.flatMap((entry) => entry.bottleRelations.map((relation) => relation.canonicalId))).has(""), false, "canonical bottle ids cannot be empty");

const alabamaQ3 = radarEntries.find((entry) => entry.slug === "alabama-abc-q3-whiskey-sweepstakes-2026");
assert.ok(alabamaQ3, "the official open Alabama Q3 registration window must be published");
assert.equal(alabamaQ3.kind, "lottery");
assert.equal(alabamaQ3.startDate, "2026-08-03");
assert.equal(alabamaQ3.endDate, "2026-08-23");
assert.equal(alabamaQ3.calendar, true);
assert.equal(alabamaQ3.availabilitySemantics, "announcement_only");
assert.equal(alabamaQ3.sources[0]?.url, "https://alabcboard.gov/stores/events/limited-release-programs/quarterly/FAQ");
assert.equal(releaseRadarUpdatedAt, "2026-08-04", "the public Radar freshness label must match the newest reviewed entry");

const sameYearWindowChange = await collectReleaseRadarLeads({
  existingLedger: { leads: [{
    id: "rrl-quarterly",
    title: "Quarterly Whiskey Release FAQ",
    url: "https://agency.gov/quarterly-lottery",
    source: "agency.gov",
    summary: "Registration runs May 4-24, 2026.",
    status: "reviewed",
    publicationStatus: "not_published",
    reviewedAt: "2026-06-01T00:00:00Z",
    firstSeenAt: "2026-05-01T00:00:00Z",
    lastSeenAt: "2026-06-01T00:00:00Z",
    observations: 2,
  }] },
  results: [{
    title: "Quarterly Whiskey Release FAQ",
    url: "https://agency.gov/quarterly-lottery",
    description: "Registration runs August 3-23, 2026. Event September 19, 2026.",
  }],
  generatedAt: "2026-08-04T12:00:00Z",
});
assert.equal(sameYearWindowChange.summary.materiallyChanged, 1, "same-year date-window changes on reusable official URLs must reopen review");
assert.equal(sameYearWindowChange.summary.queuedForSemanticReview, 1);
assert.equal(sameYearWindowChange.leads[0]?.status, "changed");
assert.match(sameYearWindowChange.leads[0]?.summary || "", /August 3-23/);

const numericSameYearWindowChange = await collectReleaseRadarLeads({
  existingLedger: { leads: [{
    id: "rrl-numeric-quarterly",
    title: "Quarterly Whiskey Release FAQ",
    url: "https://agency.gov/numeric-quarterly-lottery",
    source: "agency.gov",
    summary: "Registration runs 05/04/2026-05/24/2026.",
    status: "verified",
    verificationStatus: "verified",
    publicationStatus: "not_published",
    reviewedAt: "2026-06-01T00:00:00Z",
    evidenceUrls: ["https://agency.gov/numeric-quarterly-lottery"],
    alertGradeEligible: true,
    firstSeenAt: "2026-05-01T00:00:00Z",
    lastSeenAt: "2026-06-01T00:00:00Z",
    observations: 2,
  }] },
  results: [{
    title: "Quarterly Whiskey Release FAQ",
    url: "https://agency.gov/numeric-quarterly-lottery",
    description: "Registration runs 08/03/2026-08/23/2026.",
  }],
  generatedAt: "2026-08-04T12:00:00Z",
});
assert.equal(numericSameYearWindowChange.summary.materiallyChanged, 1, "numeric same-year date changes must reopen review");
assert.equal(numericSameYearWindowChange.leads[0]?.verificationStatus, "unverified", "reopened leads must discard prior verification status");
assert.equal(numericSameYearWindowChange.leads[0]?.alertGradeEligible, false, "reopened announcement leads must never inherit alert-grade eligibility");
assert.equal(numericSameYearWindowChange.leads[0]?.reviewedAt, undefined);
assert.equal(numericSameYearWindowChange.leads[0]?.evidenceUrls, undefined);

const equivalentDatePhrasing = await collectReleaseRadarLeads({
  existingLedger: { leads: [{
    id: "rrl-equivalent-quarterly",
    title: "Quarterly Whiskey Release FAQ",
    url: "https://agency.gov/equivalent-quarterly-lottery",
    source: "agency.gov",
    summary: "Registration runs May 4-24, 2026.",
    status: "reviewed",
    publicationStatus: "not_published",
    reviewedAt: "2026-06-01T00:00:00Z",
    firstSeenAt: "2026-05-01T00:00:00Z",
    lastSeenAt: "2026-06-01T00:00:00Z",
    observations: 2,
  }] },
  results: [{
    title: "Quarterly Whiskey Release FAQ",
    url: "https://agency.gov/equivalent-quarterly-lottery",
    description: "Registration runs May 4 through May 24, 2026.",
  }],
  generatedAt: "2026-08-04T12:00:00Z",
});
assert.equal(equivalentDatePhrasing.summary.materiallyChanged, 0, "equivalent date formatting must not reopen review");

const equivalentCompactNumericRange = await collectReleaseRadarLeads({
  existingLedger: { leads: [{
    id: "rrl-compact-numeric-quarterly",
    title: "Quarterly Whiskey Release FAQ",
    url: "https://agency.gov/compact-numeric-quarterly-lottery",
    source: "agency.gov",
    summary: "Registration runs May 4-24, 2026.",
    status: "reviewed",
    publicationStatus: "not_published",
    reviewedAt: "2026-06-01T00:00:00Z",
    firstSeenAt: "2026-05-01T00:00:00Z",
    lastSeenAt: "2026-06-01T00:00:00Z",
    observations: 2,
  }] },
  results: [{
    title: "Quarterly Whiskey Release FAQ",
    url: "https://agency.gov/compact-numeric-quarterly-lottery",
    description: "Registration runs 05/04-05/24/2026.",
  }],
  generatedAt: "2026-08-04T12:00:00Z",
});
assert.equal(equivalentCompactNumericRange.summary.materiallyChanged, 0, "a compact numeric range with one trailing year must normalize to the same dates");

assert.equal(alabamaQ3.evidenceRetrievedAt, "2026-08-04T07:36:00Z");
const alabamaAnnual = radarEntries.find((entry) => entry.slug === "alabama-abc-annual-fall-whiskey-release-2026");
assert.equal(alabamaAnnual?.updatedAt, "2026-08-04", "content refreshed with Q3 dates must carry current provenance");
assert.equal(alabamaAnnual?.evidenceRetrievedAt, "2026-08-04T07:36:00Z");

const bottleCatalogPayload = JSON.parse(readFileSync(resolve("engine/out/site/bottles.json"), "utf8")) as {
  bottles?: Array<{
    id: string;
    canonical_id?: string;
    name: string;
    canonical_name?: string;
    canonical_key?: string;
    aliases?: string[];
  }>;
};
const bottleCatalog = bottleCatalogPayload.bottles || [];
const bottleCatalogById = new Map(bottleCatalog.flatMap((bottle) => [bottle.id, bottle.canonical_id]
  .filter((id): id is string => Boolean(id))
  .map((id) => [id, bottle] as const)));
for (const entry of radarEntries.filter((candidate) => candidate.followEligibility.bottle)) {
  assert.ok(getTrackableBottleRelation(entry), `${entry.slug} needs a trackable relation`);
  for (const relation of entry.bottleRelations) {
    const catalogBottle = bottleCatalogById.get(relation.canonicalId);
    assert.ok(catalogBottle, `${entry.slug} relation ${relation.canonicalId} must resolve through the /api/bottles engine catalog`);
    assert.equal(relation.canonicalName, catalogBottle.canonical_name || catalogBottle.name, `${entry.slug} must use the catalog's canonical display name`);
    assert.equal(dropMatchesBottle({
      bottle_id: relation.canonicalId,
      canonical_id: relation.canonicalId,
      canonical_name: relation.canonicalName,
      brand_name: relation.canonicalName,
      tracked_brand_name: relation.canonicalName,
    }, catalogBottle), true, `${entry.slug} watch identity must match a later canonical drop`);
  }
}

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
const ics = buildReleaseRadarIcs(radarEntries, { origin: "https://www.bourbonsignal.com", today: "2026-07-01" });
assert.match(ics, /^BEGIN:VCALENDAR\r\n/, "ICS must use the calendar envelope and CRLF line endings");
assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, preciseEntries.reduce((count, entry) => count + (entry.occurrences?.length || entry.occurrenceDates?.length || 1), 0), "each precise occurrence should produce one event");
for (const entry of preciseEntries) assert.match(ics, new RegExp(`UID:[^\\r\\n]*${entry.slug}`), `ICS should include ${entry.slug}`);
for (const entry of broadEntries) assert.doesNotMatch(ics, new RegExp(entry.slug), `broad window ${entry.slug} must stay out of ICS`);
assert.match(ics, /X-BOURBON-SIGNAL-SEMANTICS:announcement-only/, "calendar exports must preserve non-inventory semantics");
assert.match(ics, /UID:cary-beer-bourbon-bbq-2026-20260731@[\s\S]*?DTSTART:20260731T220000Z[\s\S]*?DTEND:20260801T020000Z/, "Cary Friday ICS must retain its published 6–10 PM Eastern session");
assert.match(ics, /UID:cary-beer-bourbon-bbq-2026-20260801@[\s\S]*?DTSTART:20260801T160000Z[\s\S]*?DTEND:20260801T220000Z/, "Cary Saturday ICS must retain its published noon–6 PM Eastern session");
assert.match(ics, /UID:garrison-brothers-laguna-madre-2026-20260808@[\s\S]*?DTSTART:20260808T130000Z[\s\S]*?DTEND:20260808T210000Z/, "Laguna Madre ICS must retain its official 8 AM–4 PM Central event window");
assert.match(ics, /UID:alabama-abc-q3-whiskey-sweepstakes-2026-20260803@[\s\S]*?DTSTART;VALUE=DATE:20260803[\s\S]*?DTEND;VALUE=DATE:20260824/, "Alabama Q3 ICS must include the August 3-23 registration window inclusively");
const currentIcs = buildReleaseRadarIcs(radarEntries, { origin: "https://www.bourbonsignal.com", today: "2026-07-21" });
assert.doesNotMatch(currentIcs, /virginia-abc-rare-character-july-2026/, "closed lotteries must expire from the live calendar export");
assert.match(currentIcs, /cary-beer-bourbon-bbq-2026/, "future NC events must remain in the live calendar export");

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

const waitingForPreferences = resolveRadarMarketInitialization({
  state: { market: "NC", initialized: false },
  preferencesReady: false,
  preferredMarket: "VA",
  fallbackMarket: "NC",
  userSelected: false,
});
assert.deepEqual(waitingForPreferences, { market: "NC", initialized: false }, "market initialization must wait for async preferences");
const initializedFromPreferences = resolveRadarMarketInitialization({
  state: waitingForPreferences,
  preferencesReady: true,
  preferredMarket: "VA",
  fallbackMarket: "NC",
  userSelected: false,
});
assert.deepEqual(initializedFromPreferences, { market: "VA", initialized: true }, "saved preferences should initialize the market once they arrive");
assert.deepEqual(resolveRadarMarketInitialization({
  state: initializedFromPreferences,
  preferencesReady: true,
  preferredMarket: "PA",
  fallbackMarket: "NC",
  userSelected: false,
}), initializedFromPreferences, "later preference changes must not reinitialize the market");
const userChoiceDuringLoad = resolveRadarMarketInitialization({
  state: { market: "TX", initialized: false },
  preferencesReady: true,
  preferredMarket: "VA",
  fallbackMarket: "NC",
  userSelected: true,
});
assert.deepEqual(userChoiceDuringLoad, { market: "TX", initialized: true }, "a user choice made before preferences arrive must win");

const detailSource = readFileSync(resolve("src/app/release-radar/[kind]/[slug]/page.tsx"), "utf8");
assert.match(detailSource, /RadarEntryActions/, "detail pages should expose follow/track acquisition actions");
const actionSource = readFileSync(resolve("src/components/release-radar/RadarEntryActions.tsx"), "utf8");
assert.match(actionSource, /ctaLabel/, "the follow action should use the controlled experiment label");
assert.doesNotMatch(actionSource, /recordConversion/, "the client must not assert the experiment conversion");
const preferenceRouteSource = readFileSync(resolve("src/app/api/user/preferences/route.ts"), "utf8");
assert.match(preferenceRouteSource, /recordExperimentConversion/, "the persisted follow mutation should record the experiment conversion server-side");
assert.match(actionSource, /Track bottle/);
assert.match(actionSource, /aria-live="polite"/, "action status must be announced accessibly");
assert.match(actionSource, /useWatchlistStore/, "bottle tracking should reuse the existing watchlist");
assert.match(actionSource, /radarPreferences/, "release follows should reuse account preferences");
assert.match(actionSource, /resolveRadarMarketInitialization/, "market selection should use the one-shot initialization contract");
assert.match(actionSource, /ready:\s*preferencesReady/, "market initialization must wait for resolved saved preferences, not the pre-fetch defaults");
assert.doesNotMatch(actionSource, /\/pricing|checkout|upgrade/i, "public Radar acquisition actions must not add a paywall");

const routeSource = readFileSync(resolve("src/app/release-radar/calendar.ics/route.ts"), "utf8");
assert.match(routeSource, /text\/calendar/);
assert.match(routeSource, /Content-Disposition/);
assert.match(routeSource, /revalidate\s*=\s*3600/, "the calendar export must re-evaluate opportunity expiry without requiring a deploy");
assert.doesNotMatch(routeSource, /force-static/, "a build-frozen calendar cannot expire closed opportunities automatically");
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
