import assert from "node:assert/strict";
import test from "node:test";
import type { MemberPreferences, RadarAreaPreferences } from "../api/types";
import { alertIsStale, clearRadarAreas, compactMonitoringScopes, compactWatchedBottles, formatPhoneNumber, maskedPhoneNumber, memberAlertBottleNames, monitoringScopesChanged, presentPushIssue, radarAreaCount, radarAreaSummary, radarLocalityDisplayName, radarMonitoringSummary, radarStateDisplayCode, radarWatchlistSummary, scopesForState, setBottleWatched, setRadarState, setStatewideScope, stopMonitoringState, toggleAlertRarity, toggleMonitoringScope, toggleRadarArea, watchedBottleCount } from "./radar-preferences";

const areas: RadarAreaPreferences = { states: [], ncBoards: [], gaAreas: [], tnAreas: [], vaCities: [], ohCities: [], iaCities: [], idCities: [], scAreas: [], caAreas: [], nvAreas: [], nyAreas: [], coAreas: [], paCounties: [], paStores: [] };
const preferences = (): MemberPreferences => ({
  collectionAccess: { canRead: true, canEditExisting: true, canAdd: true, limit: null, remaining: null, showCapacityNotice: false },
  entitlements: { trackedBottleLimit: 2, alertAreaLimit: 2 },
  areaPreferences: areas,
  monitoringScopes: [],
  notificationPreferences: { rarityTiers: ["unicorn", "allocated", "limited"], onSite: { enabled: true }, push: { enabled: false }, email: { enabled: false, mode: "major_only" }, sms: { enabled: false, available: true, verified: false, mode: "major_only" }, sightings: { enabled: false } },
  alertMode: "specific_bottles",
  bottleAlertPreferences: { bottleNames: ["Stagg"], bottleKeys: ["stagg"] },
  collectionPreferences: { bottles: [], version: 0 },
});

test("rarity controls preserve stable order and never allow an empty alert selection", () => {
  assert.deepEqual(toggleAlertRarity(["unicorn", "allocated", "limited"], "limited"), ["unicorn", "allocated"]);
  assert.deepEqual(toggleAlertRarity(["unicorn", "allocated"], "limited"), ["unicorn", "allocated", "limited"]);
  assert.deepEqual(toggleAlertRarity(["unicorn"], "unicorn"), ["unicorn"]);
});

test("Radar summary names the active alert mode instead of implying an empty bottle watchlist", () => {
  assert.equal(radarWatchlistSummary(preferences()), "1 watched");
  assert.equal(radarWatchlistSummary({ ...preferences(), alertMode: "anything_notable" }), "Anything notable");
});

test("watch updates are canonical and enforce the actual membership limit", () => {
  const base = preferences();
  assert.equal(watchedBottleCount(base), 1);
  const added = setBottleWatched(base, "Weller 12 Year", true);
  assert.deepEqual(added.bottleKeys, ["stagg", "weller 12 year"]);
  assert.throws(() => setBottleWatched({ ...base, bottleAlertPreferences: added }, "Michter's 10 Year", true), /2 watched bottles/);
  assert.deepEqual(setBottleWatched({ ...base, bottleAlertPreferences: added }, "Stagg", false).bottleNames, ["Weller 12 Year"]);
});

test("Watchlist preview shows three bottles before revealing the entire sorted list", () => {
  const names = ["Weller 12", "Stagg", "Eagle Rare", "Blanton's", "Booker's"];
  assert.deepEqual(compactWatchedBottles(names, false), {
    visible: ["Blanton's", "Booker's", "Eagle Rare"],
    hiddenCount: 2,
    totalCount: 5,
  });
  assert.deepEqual(compactWatchedBottles(names, true), {
    visible: ["Blanton's", "Booker's", "Eagle Rare", "Stagg", "Weller 12"],
    hiddenCount: 0,
    totalCount: 5,
  });
});

test("state and dependent area updates preserve canonical server fields", () => {
  const nc = setRadarState(areas, "NC", true);
  const wake = toggleRadarArea(nc, "NC", "Wake County ABC");
  assert.deepEqual(wake.states, ["NC"]);
  assert.deepEqual(wake.ncBoards, ["Wake County ABC"]);
  assert.equal(radarAreaCount(wake), 1);
  assert.deepEqual(clearRadarAreas(wake, "NC").ncBoards, []);
  assert.deepEqual(setRadarState(wake, "NC", false).ncBoards, []);
});

test("alert staleness uses signal time and its supplied freshness limit", () => {
  const now = new Date("2026-08-24T12:00:00.000Z");
  assert.equal(alertIsStale({ createdAt: "2026-08-24T11:00:00.000Z", signalAt: "2026-08-21T11:59:59.000Z" }, now), true);
  assert.equal(alertIsStale({ createdAt: "2026-08-24T11:00:00.000Z", freshnessLimitHours: 96 }, now), false);
});

test("generic mobile scope helpers keep statewide and local semantics unambiguous", () => {
  const statewide = setStatewideScope([], { code: "FL", name: "Florida" });
  assert.equal(radarMonitoringSummary(statewide), "1 state · 0 local filters");
  const county = toggleMonitoringScope(statewide, { type: "county", id: "county:12086", state: "FL", label: "Miami-Dade County" });
  assert.deepEqual(scopesForState(county, "FL").map((scope) => scope.id), ["county:12086"]);
  assert.equal(radarMonitoringSummary(county), "1 state · 1 local filter");
  assert.deepEqual(stopMonitoringState(county, "FL"), []);
});

test("Radar presentation stays concise, structured, and private", () => {
  assert.equal(radarStateDisplayCode("MD-MONTGOMERY"), "MD");
  assert.equal(radarAreaSummary(["Wake", "Mecklenburg", "Durham"]), "Wake · Mecklenburg +1 more");
  assert.equal(maskedPhoneNumber("4807518539"), "••• ••• 8539");
  assert.equal(formatPhoneNumber("4807518539"), "(480) 751-8539");
  assert.deepEqual(memberAlertBottleNames({ bottleName: "Stagg, Weller 12, and Eagle Rare" }, ["Stagg", "Weller 12", "Eagle Rare"]), ["Stagg", "Weller 12", "Eagle Rare"]);
  assert.deepEqual(memberAlertBottleNames({ bottleName: "Stagg Jr., and Stagg" }, ["Stagg", "Stagg Jr."]), ["Stagg Jr.", "Stagg"]);
  assert.deepEqual(memberAlertBottleNames({ bottleName: "Rock and Rye" }), ["Rock and Rye"]);
  assert.deepEqual(memberAlertBottleNames({ bottleName: "E.H. Taylor, Jr." }), ["E.H. Taylor, Jr."]);
  assert.deepEqual(memberAlertBottleNames({ bottleName: "Grouped", bottleNames: ["Stagg", "Eagle Rare"] }), ["Stagg", "Eagle Rare"]);
});

test("area editor summaries cap mounted rows without losing the selected count", () => {
  const scopes = Array.from({ length: 14 }, (_, index) => ({
    type: "city" as const,
    id: `place:${index}`,
    state: "PA",
    label: `City ${index + 1}`,
  }));
  const compact = compactMonitoringScopes(scopes, 6);
  assert.equal(compact.total, 14);
  assert.equal(compact.visible.length, 6);
  assert.equal(compact.hidden, 8);
});

test("Radar locality labels hide Census and legal place types", () => {
  assert.equal(radarLocalityDisplayName("Phoenix city"), "Phoenix");
  assert.equal(radarLocalityDisplayName("Carefree town"), "Carefree");
  assert.equal(radarLocalityDisplayName("San Tan Valley CDP"), "San Tan Valley");
  assert.equal(radarLocalityDisplayName("District of Columbia"), "District of Columbia");
});

test("area editor dirty state compares the selected state's semantic scopes", () => {
  const saved = [
    { type: "city" as const, id: "place:1", state: "AZ", label: "Phoenix" },
    { type: "county" as const, id: "county:2", state: "AZ", label: "Maricopa County" },
    { type: "state" as const, id: "state:NM", state: "NM", label: "New Mexico" },
  ];
  assert.equal(monitoringScopesChanged(saved, [saved[1], saved[0]], "AZ"), false);
  assert.equal(monitoringScopesChanged(saved, [saved[0]], "AZ"), true);
});

test("Push errors keep member guidance separate from support diagnostics", () => {
  const issue = presentPushIssue({
    message: "Failed to update push notification settings.",
    code: "PUSH_DEVICE_REGISTRATION_FAILED",
    requestId: "request-123",
    retryable: true,
  }, "Push couldn’t be turned on for this iPhone.");
  assert.equal(issue.message, "Push couldn’t be turned on for this iPhone. Try again.");
  assert.equal(issue.diagnostic, "PUSH_DEVICE_REGISTRATION_FAILED · request-123");
  assert.doesNotMatch(issue.message, /PUSH_|request-123/);
});
