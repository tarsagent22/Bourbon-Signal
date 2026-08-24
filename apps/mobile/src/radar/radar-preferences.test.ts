import assert from "node:assert/strict";
import test from "node:test";
import type { MemberPreferences, RadarAreaPreferences } from "../api/types";
import { alertIsStale, radarAreaCount, setBottleWatched, setRadarState, toggleRadarArea, watchedBottleCount } from "./radar-preferences";

const areas: RadarAreaPreferences = { states: [], ncBoards: [], gaAreas: [], tnAreas: [], vaCities: [], ohCities: [], iaCities: [], idCities: [], scAreas: [], caAreas: [], nvAreas: [], nyAreas: [], coAreas: [], paCounties: [], paStores: [] };
const preferences = (): MemberPreferences => ({
  entitlements: { trackedBottleLimit: 2, alertAreaLimit: 2 },
  areaPreferences: areas,
  notificationPreferences: { onSite: { enabled: true }, push: { enabled: false }, email: { enabled: false, mode: "major_only" }, sms: { enabled: false, available: true, verified: false, mode: "major_only" }, sightings: { enabled: false } },
  alertMode: "specific_bottles",
  bottleAlertPreferences: { bottleNames: ["Stagg"], bottleKeys: ["stagg"] },
  collectionPreferences: { bottles: [], version: 0 },
});

test("watch updates are canonical and enforce the actual membership limit", () => {
  const base = preferences();
  assert.equal(watchedBottleCount(base), 1);
  const added = setBottleWatched(base, "Weller 12 Year", true);
  assert.deepEqual(added.bottleKeys, ["stagg", "weller 12 year"]);
  assert.throws(() => setBottleWatched({ ...base, bottleAlertPreferences: added }, "Michter's 10 Year", true), /2 watched bottles/);
  assert.deepEqual(setBottleWatched({ ...base, bottleAlertPreferences: added }, "Stagg", false).bottleNames, ["Weller 12 Year"]);
});

test("state and dependent area updates preserve canonical server fields", () => {
  const nc = setRadarState(areas, "NC", true);
  const wake = toggleRadarArea(nc, "NC", "Wake County ABC");
  assert.deepEqual(wake.states, ["NC"]);
  assert.deepEqual(wake.ncBoards, ["Wake County ABC"]);
  assert.equal(radarAreaCount(wake), 1);
  assert.deepEqual(setRadarState(wake, "NC", false).ncBoards, []);
});

test("alert staleness uses signal time and its supplied freshness limit", () => {
  const now = new Date("2026-08-24T12:00:00.000Z");
  assert.equal(alertIsStale({ createdAt: "2026-08-24T11:00:00.000Z", signalAt: "2026-08-21T11:59:59.000Z" }, now), true);
  assert.equal(alertIsStale({ createdAt: "2026-08-24T11:00:00.000Z", freshnessLimitHours: 96 }, now), false);
});
