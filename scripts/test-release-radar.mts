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
  releaseRadarUpdatedAt,
} from "../src/lib/release-radar.ts";
import { getAgendaOccurrences, getCalendarOccurrences, getInitialRadarMonth, isValidMonth } from "../src/lib/release-radar-calendar.ts";

assert.ok(radarEntries.length >= 8, "Release Radar should launch with at least eight sourced records");
assert.equal(releaseRadarUpdatedAt, "2026-07-15", "public Radar freshness should match the final review date");
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
assert.ok(lottery, "lottery fixture must exist");
assert.ok(camp, "recurring event fixture must exist");
assert.deepEqual(getCalendarOccurrences(lottery, "2026-07").map((item) => item.date), ["2026-07-12", "2026-07-16"], "month grid may expose opening and closing dates");
assert.deepEqual(getAgendaOccurrences(lottery, "2026-07"), [{ date: "2026-07-12", label: "Jul 12–16", rangeEnd: "2026-07-16" }], "agenda must consolidate a lottery window into one actionable record");
assert.deepEqual(getAgendaOccurrences(camp, "2026-08"), [{ date: "2026-08-29", label: "Aug 29" }], "separate event occurrences remain independently actionable");
assert.deepEqual(getAgendaOccurrences(camp, "2026-09"), [{ date: "2026-09-05", label: "Sep 5" }]);
const crossMonthWindow = { ...lottery!, startDate: "2026-07-31", endDate: "2026-08-02", dateLabel: "Jul 31–Aug 2" };
assert.deepEqual(getAgendaOccurrences(crossMonthWindow, "2026-08"), [{ date: "2026-08-01", label: "Open through Aug 2", rangeEnd: "2026-08-02" }], "a window spanning two months must remain visible in the second month's agenda");
assert.deepEqual(getCalendarOccurrences(camp, "2026-09"), [{ date: "2026-09-05", label: "Sep 5" }], "recurring events must expose the occurrence inside the selected month");
assert.equal(isValidMonth("2026-12"), true);
assert.equal(isValidMonth("2026-99"), false, "invalid query months must be rejected");
assert.equal(getInitialRadarMonth(radarEntries, "2026-07-10", "2026-07"), "2026-07", "the current month should remain selected when its next event starts today");
assert.equal(getInitialRadarMonth(radarEntries, "2026-07-17", "2026-07"), "2026-08", "the mobile-first calendar should advance to the month containing the next actionable date");
const detailSource = readFileSync(resolve("src/app/release-radar/[kind]/[slug]/page.tsx"), "utf8");
assert.match(detailSource, /OnlineEventAttendanceMode/);
assert.match(detailSource, /EventSeries/);
const hubSource = readFileSync(resolve("src/app/release-radar/page.tsx"), "utf8");
assert.match(hubSource, /"@type": "ItemList"/, "calendar hub should reference detail entities through an ItemList");
assert.match(hubSource, /"@type": "ListItem"/);
assert.doesNotMatch(hubSource, /entry\.occurrenceDates\?\.length \? "EventSeries"/, "hub must not emit incomplete Event nodes");

const upcoming = getUpcomingEntries("2026-07-10");
assert.ok(upcoming.length > 0, "calendar needs upcoming records");
assert.deepEqual(upcoming, [...upcoming].sort((a, b) => a.startDate.localeCompare(b.startDate)), "calendar must sort chronologically");

assert.ok(stateGuides.length >= 3, "launch should include multiple substantive state guides");
assert.ok(stateGuides.every((guide) => guide.sections.length >= 3), "state guides need substantive sections");
assert.ok(getStateGuide(stateGuides[0].slug), "state guides must be retrievable by slug");

const nav = readFileSync(resolve("src/components/Navigation.tsx"), "utf8");
assert.doesNotMatch(nav, /Release Radar/, "Release Radar must stay out of primary navigation");

const footer = readFileSync(resolve("src/components/Footer.tsx"), "utf8");
assert.match(footer, /Release Radar/, "public discovery belongs in the footer");

const sitemap = readFileSync(resolve("src/app/sitemap.ts"), "utf8");
assert.match(sitemap, /radarEntries/);
assert.match(sitemap, /stateGuides/);
assert.match(sitemap, /radarPath/);

const radarLayout = readFileSync(resolve("src/app/release-radar/layout.tsx"), "utf8");
assert.doesNotMatch(radarLayout, /index:\s*false|follow:\s*false/);
assert.match(radarLayout, /index:\s*true/);
assert.match(radarLayout, /follow:\s*true/);
assert.match(radarLayout, /PersistentRadarInstrument/, "one layout-owned radar should persist while switching tabs");
const persistentRadarSource = readFileSync(resolve("src/components/release-radar/PersistentRadarInstrument.tsx"), "utf8");
for (const route of ["/release-radar", "/release-radar/briefings", "/release-radar/states"]) assert.match(persistentRadarSource, new RegExp(route.replaceAll("/", "\\/")));
assert.doesNotMatch(persistentRadarSource, /RADAR\s*<br|RADAR 26|>26</, "the radar center must remain unlabelled");
assert.equal((persistentRadarSource.match(/className="rr-blip /g) || []).length, 2, "the persistent radar should carry exactly two sweep-reactive blips");

assert.match(hubSource, /CalendarExplorer/);
assert.match(hubSource, /RadarTabs/);
assert.doesNotMatch(hubSource, /ActionNow|ReleaseTimeline|ReleaseLedger|LotteryBrief|BottleIndex/, "calendar hub must not repeat records across editorial modules");
assert.doesNotMatch(hubSource, /RadarCard/, "hub must not fall back to repeated editorial cards");

const tabsSource = readFileSync(resolve("src/components/release-radar/RadarTabs.tsx"), "utf8");
for (const label of ["Calendar", "Briefings", "States"]) {
  assert.match(tabsSource, new RegExp(label), `route-backed tabs must include ${label}`);
}
for (const href of ["/release-radar", "/release-radar/briefings", "/release-radar/states"]) {
  assert.match(tabsSource, new RegExp(`href: \\"${href.replaceAll("/", "\\/")}\\"`), `tab must link to ${href}`);
}
assert.doesNotMatch(tabsSource, /Bottles|\/release-radar\/bottles/, "bottles belong on the calendar rather than in a separate tab");

const calendarSource = readFileSync(resolve("src/components/release-radar/CalendarExplorer.tsx"), "utf8");
assert.match(calendarSource, /use client/);
assert.match(calendarSource, /All states/);
assert.match(calendarSource, /All types/);
assert.match(calendarSource, /Bottle releases/);
assert.match(calendarSource, /requestedKind[^;]+"bottle"/s, "bottle filters must survive direct calendar links");
assert.match(calendarSource, /entry\.calendar === true/, "only source-backed exact dates belong in calendar cells");
assert.match(calendarSource, /entry\.kind === "bottle"/, "broad bottle windows must remain visible below the calendar");
assert.match(calendarSource, /kind === "bottle" \? Boolean\(entry\.bottle\)/, "bottle filter must include both exact dated releases and broad bottle windows");
assert.match(calendarSource, /Previous month/);
assert.match(calendarSource, /Next month/);
assert.match(calendarSource, /radarPath\(entry\)/, "calendar events must link to their associated editorial pages");
assert.match(calendarSource, /rr-calendar-grid/, "desktop needs a month grid");
assert.match(calendarSource, /rr-timeline/, "mobile needs a visual timeline rail");
assert.match(calendarSource, /Official source/, "agenda must surface provenance without requiring a detail click");
assert.match(calendarSource, /Updated/, "agenda must surface freshness");
assert.match(calendarSource, /rr-watch-deck/, "uncertain watch windows must be separated from fixed calendar records");
assert.match(calendarSource, /getAgendaOccurrences/, "agenda should consolidate multi-day windows");
assert.match(calendarSource, /rangeEnd \|\| occurrence\.date/, "the upcoming timeline should exclude completed occurrences in the current month");
assert.match(calendarSource, /entry\.startDate < today/, "ongoing windows that started in the past should follow genuinely upcoming events");
assert.match(calendarSource, /today:/, "the server-selected calendar date must be passed into the client instead of using hydration-sensitive browser time");
assert.doesNotMatch(calendarSource, /rr-agenda-row/, "overhaul must replace the repetitive legacy text-row treatment");

for (const route of ["briefings", "states"]) {
  const indexSource = readFileSync(resolve(`src/app/release-radar/${route}/page.tsx`), "utf8");
  assert.match(indexSource, new RegExp(`canonical: \\"/release-radar/${route}\\"`), `${route} index needs its own canonical URL`);
}
const briefingsSource = readFileSync(resolve("src/app/release-radar/briefings/page.tsx"), "utf8");
assert.match(briefingsSource, /rr-briefing-lead/, "briefings needs an editorial lead story");
assert.doesNotMatch(briefingsSource, /rr-source-count|rr-briefing-number|FIELD NOTE/, "briefings should not use decorative stats or issue markers");
const statesSource = readFileSync(resolve("src/app/release-radar/states/page.tsx"), "utf8");
assert.match(statesSource, /rr-state-atlas/, "state guides need a geographic atlas composition");
assert.match(statesSource, /guide\.model/, "state cards must retain the release-system model");
assert.doesNotMatch(statesSource, /systems mapped in depth|Why states matter/, "state index should avoid decorative metrics and repeated explanation");
const bottlesSource = readFileSync(resolve("src/app/release-radar/bottles/page.tsx"), "utf8");
assert.match(bottlesSource, /permanentRedirect\("\/release-radar\?type=bottle"\)/, "the retired bottles index should preserve discovery through the calendar");
assert.doesNotMatch(sitemap, /`\$\{origin\}\/release-radar\/bottles`/, "the retired bottles index must leave the sitemap");
assert.doesNotMatch(tabsSource, /index:|<small>/, "section tabs should use plain labels without decorative numbering");
assert.doesNotMatch(hubSource, /rr-hero-metrics|Dated records|Primary sources|Watch windows/, "calendar hero should not use decorative coverage statistics");
assert.match(hubSource, /Bourbon Release/);
assert.match(hubSource, /<time dateTime=/, "freshness must be machine-readable and human-readable");
assert.match(hubSource, /entry\.calendar/, "only records with supported date precision belong in exact calendar cells");
assert.match(hubSource, /entry\.kind === "bottle"/, "bottle releases must feed the calendar surface");

const detailPageSource = readFileSync(resolve("src/app/release-radar/[kind]/[slug]/page.tsx"), "utf8");
assert.match(detailPageSource, /Boolean\(entry\.calendar\)/, "non-calendar briefings must not emit misleading Event schema");
assert.match(detailPageSource, /datePublished:\s*entry\.startDate/);

const stateDetailSource = readFileSync(resolve("src/app/release-radar/states/[slug]/page.tsx"), "utf8");
assert.match(stateDetailSource, /\/release-radar\/states/);
assert.doesNotMatch(stateDetailSource, /\/release-radar#states/);

const cssSource = readFileSync(resolve("src/app/release-radar/release-radar.css"), "utf8");
assert.equal((cssSource.match(/@media\s*\(max-width:\s*820px\)/g) || []).length, 1, "mobile styles should be consolidated into one layer");
assert.match(cssSource, /env\(safe-area-inset-bottom\)/, "mobile pages need safe-area padding");
assert.match(cssSource, /prefers-reduced-motion:\s*reduce/, "radar motion must respect reduced-motion preferences");
assert.match(cssSource, /\.rr-sweep\s*\{[\s\S]*?inset:\s*3%[\s\S]*?border-radius:\s*50%[\s\S]*?conic-gradient\(from 0deg,\s*transparent 0 76%/, "restore the original circular sweep instead of a triangular wedge");
assert.doesNotMatch(cssSource, /\.rr-hero-instrument\s*>\s*b/, "removed center copy should not retain dead styles");
assert.match(cssSource, /grid-template-columns:\s*repeat\(3,\s*1fr\)/, "three Radar tabs should share the available width");
assert.match(cssSource, /@keyframes rrBlipScan/, "radar blips need a sweep-synchronized blink sequence");
assert.match(cssSource, /\.rr-blip--one[\s\S]*?animation-delay:\s*1\.85s/, "first blip timing should match its angular position");
assert.match(cssSource, /\.rr-blip--two[\s\S]*?animation-delay:\s*5\.1s/, "second blip timing should match its angular position");

for (const route of [
  "src/app/release-radar/page.tsx",
  "src/app/release-radar/briefings/page.tsx",
  "src/app/release-radar/states/page.tsx",
  "src/app/release-radar/[kind]/[slug]/page.tsx",
  "src/app/release-radar/states/[slug]/page.tsx",
]) {
  assert.ok(readFileSync(resolve(route), "utf8").length > 200, `${route} should exist and contain a real page`);
}

console.log("Release Radar contract checks passed.");
