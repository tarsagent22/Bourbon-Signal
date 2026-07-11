import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  radarEntries,
  stateGuides,
  getRadarEntry,
  getUpcomingEntries,
  getEntriesByKind,
  getStateGuide,
} from "../src/lib/release-radar.ts";

assert.ok(radarEntries.length >= 8, "Release Radar should launch with at least eight sourced records");
assert.equal(new Set(radarEntries.map((entry) => entry.slug)).size, radarEntries.length, "record slugs must be unique");
assert.ok(radarEntries.every((entry) => entry.sources.length > 0), "every record needs a source");
assert.ok(radarEntries.every((entry) => entry.sources.every((source) => source.url.startsWith("https://"))), "sources must use HTTPS");
assert.ok(radarEntries.every((entry) => !Number.isNaN(Date.parse(entry.updatedAt))), "every record needs a valid updated date");
assert.ok(getRadarEntry(radarEntries[0].kind, radarEntries[0].slug), "records must be retrievable by kind and slug");
assert.ok(getEntriesByKind("lottery").length > 0, "launch content needs a lottery");
assert.ok(getEntriesByKind("release").length > 0, "launch content needs a release");
assert.ok(getEntriesByKind("event").length > 0, "launch content needs an event");
assert.ok(getEntriesByKind("bottle").length > 0, "launch content needs bottle context");

const lottery = getRadarEntry("lottery", "virginia-abc-rare-character-july-2026");
assert.ok(lottery?.schemaStartDate?.endsWith("-04:00"), "lottery schema must retain its published Eastern opening time");
assert.ok(lottery?.schemaEndDate?.endsWith("-04:00"), "lottery schema must retain its published Eastern closing time");
const camp = getRadarEntry("event", "camp-buffalo-trace-2026");
assert.deepEqual(camp?.occurrenceDates, ["2026-08-29", "2026-09-05"], "separate Camp dates must not become one continuous event");
const detailSource = readFileSync(resolve("src/app/release-radar/[kind]/[slug]/page.tsx"), "utf8");
assert.match(detailSource, /OnlineEventAttendanceMode/);
assert.match(detailSource, /EventSeries/);
const hubSource = readFileSync(resolve("src/app/release-radar/page.tsx"), "utf8");
assert.match(hubSource, /entry\.occurrenceDates\?\.length \? "EventSeries"/, "hub and detail schema must agree on event series");

const upcoming = getUpcomingEntries("2026-07-10");
assert.ok(upcoming.length > 0, "calendar needs upcoming records");
assert.deepEqual(upcoming, [...upcoming].sort((a, b) => a.startDate.localeCompare(b.startDate)), "calendar must sort chronologically");

assert.ok(stateGuides.length >= 3, "launch should include multiple substantive state guides");
assert.ok(stateGuides.every((guide) => guide.sections.length >= 3), "state guides need substantive sections");
assert.ok(getStateGuide(stateGuides[0].slug), "state guides must be retrievable by slug");

const nav = readFileSync(resolve("src/components/Navigation.tsx"), "utf8");
assert.doesNotMatch(nav, /Release Radar/, "preview must not appear in primary navigation");

const sitemap = readFileSync(resolve("src/app/sitemap.ts"), "utf8");
assert.doesNotMatch(sitemap, /radarEntries|stateGuides/, "preview routes must not be discoverable through sitemap");

const radarLayout = readFileSync(resolve("src/app/release-radar/layout.tsx"), "utf8");
assert.match(radarLayout, /index:\s*false/);
assert.match(radarLayout, /follow:\s*false/);

assert.match(hubSource, /CalendarExplorer/);
assert.match(hubSource, /RadarTabs/);
assert.doesNotMatch(hubSource, /ActionNow|ReleaseTimeline|ReleaseLedger|LotteryBrief|BottleIndex/, "calendar hub must not repeat records across editorial modules");
assert.doesNotMatch(hubSource, /RadarCard/, "hub must not fall back to repeated editorial cards");

const tabsSource = readFileSync(resolve("src/components/release-radar/RadarTabs.tsx"), "utf8");
for (const label of ["Calendar", "Briefings", "State guides", "Bottle guides"]) {
  assert.match(tabsSource, new RegExp(label), `route-backed tabs must include ${label}`);
}
for (const href of ["/release-radar", "/release-radar/briefings", "/release-radar/states", "/release-radar/bottles"]) {
  assert.match(tabsSource, new RegExp(`href: \\"${href.replaceAll("/", "\\/")}\\"`), `tab must link to ${href}`);
}

const calendarSource = readFileSync(resolve("src/components/release-radar/CalendarExplorer.tsx"), "utf8");
assert.match(calendarSource, /use client/);
assert.match(calendarSource, /All states/);
assert.match(calendarSource, /All types/);
assert.match(calendarSource, /Previous month/);
assert.match(calendarSource, /Next month/);
assert.match(calendarSource, /radarPath\(entry\)/, "calendar events must link to their associated editorial pages");
assert.match(calendarSource, /rr-calendar-grid/, "desktop needs a month grid");
assert.match(calendarSource, /rr-agenda/, "mobile needs a chronological agenda");

for (const route of ["briefings", "bottles", "states"]) {
  const indexSource = readFileSync(resolve(`src/app/release-radar/${route}/page.tsx`), "utf8");
  assert.match(indexSource, new RegExp(`canonical: \\"/release-radar/${route}\\"`), `${route} index needs its own canonical URL`);
}

for (const route of [
  "src/app/release-radar/page.tsx",
  "src/app/release-radar/briefings/page.tsx",
  "src/app/release-radar/bottles/page.tsx",
  "src/app/release-radar/states/page.tsx",
  "src/app/release-radar/[kind]/[slug]/page.tsx",
  "src/app/release-radar/states/[slug]/page.tsx",
]) {
  assert.ok(readFileSync(resolve(route), "utf8").length > 200, `${route} should exist and contain a real page`);
}

console.log("Release Radar contract checks passed.");
