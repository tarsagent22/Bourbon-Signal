import assert from "node:assert/strict";
import test from "node:test";
import type { MemberPreferences } from "../api/types";
import { bottleProfileState } from "./bottle-profile";

function preferences(): MemberPreferences {
  return {
    collectionAccess: { canRead: true, canEditExisting: true, canAdd: true, limit: null, remaining: null, showCapacityNotice: false },
    areaPreferences: { states: [], ncBoards: [], gaAreas: [], tnAreas: [], vaCities: [], ohCities: [], iaCities: [], idCities: [], scAreas: [], caAreas: [], nvAreas: [], nyAreas: [], coAreas: [], paCounties: [], paStores: [] },
    monitoringScopes: [],
    notificationPreferences: { rarityTiers: ["allocated"], onSite: { enabled: true }, push: { enabled: true }, email: { enabled: true, mode: "all" }, sms: { enabled: false, available: false, verified: false, mode: "major_only" }, sightings: { enabled: true } },
    alertMode: "specific_bottles",
    bottleAlertPreferences: { bottleNames: ["George T. Stagg"], bottleKeys: [] },
    collectionPreferences: {
      version: 3,
      bottles: [{ bottleId: "stagg", bottleName: "George T Stagg", canonicalKey: "george t stagg", rating: 87, isRated: true, sealedQuantity: 2, openedQuantity: 1, finishedCount: 0, tastedOnly: false, addedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
    },
  };
}

test("Bottle Profile unifies canonical Radar and Cellar state", () => {
  assert.deepEqual(bottleProfileState({ name: "George T. Stagg" }, preferences()), {
    isWatched: true,
    inCellar: true,
    radarLabel: "Watched",
    cellarLabel: "In Cellar",
    ratingLabel: "8.7 / 10",
    inventoryLabel: "2 sealed · 1 open",
  });
});

test("Bottle Profile distinguishes tasted-only whiskey from owned inventory", () => {
  const current = preferences();
  current.collectionPreferences.bottles[0] = { ...current.collectionPreferences.bottles[0]!, isRated: false, rating: 0, sealedQuantity: 0, openedQuantity: 0, tastedOnly: true };

  const profile = bottleProfileState({ name: "George T Stagg" }, current);
  assert.equal(profile.cellarLabel, "Tasted, not owned");
  assert.equal(profile.ratingLabel, "Unrated");
  assert.equal(profile.inventoryLabel, "No bottles owned");
});

test("Bottle Profile stays truthful when no personalized state exists", () => {
  const current = preferences();
  current.bottleAlertPreferences = { bottleNames: [], bottleKeys: [] };
  current.collectionPreferences.bottles = [];

  assert.deepEqual(bottleProfileState({ name: "Unknown Bourbon" }, current), {
    isWatched: false,
    inCellar: false,
    radarLabel: "Not watched",
    cellarLabel: "Not in Cellar",
    ratingLabel: "Unrated",
    inventoryLabel: "No bottles owned",
  });
});

test("Bottle Profile prefers stable bottle identity when display names differ", () => {
  const current = preferences();
  current.bottleAlertPreferences = { bottleNames: [], bottleKeys: ["stagg"] };

  const profile = bottleProfileState({ id: "stagg", name: "George T. Stagg Bourbon" }, current);
  assert.equal(profile.isWatched, true);
  assert.equal(profile.inCellar, true);
  assert.equal(profile.ratingLabel, "8.7 / 10");
});
