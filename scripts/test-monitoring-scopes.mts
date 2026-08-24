import assert from "node:assert/strict";
import test from "node:test";
import {
  legacyAreaPreferencesFromScopes,
  monitoringScopesFromPreferences,
  normalizeMonitoringScopes,
  trimMonitoringScopesToLimit,
} from "../src/lib/monitoring-scopes.ts";
import { candidateMatchesMonitoringScopes } from "../src/lib/monitoring-scope-matcher.ts";

test("legacy states migrate nationwide without losing FL or MS", () => {
  const scopes = monitoringScopesFromPreferences({ states: ["fl", "MS", "FL"] });
  assert.deepEqual(scopes.map((scope) => scope.id), ["state:FL", "state:MS"]);
  assert.deepEqual(legacyAreaPreferencesFromScopes(scopes).states, ["FL", "MS"]);
});

test("legacy local arrays migrate and remain synchronized", () => {
  const scopes = monitoringScopesFromPreferences({
    states: ["NC", "PA"],
    ncBoards: ["Wake County ABC"],
    paCounties: ["Allegheny County"],
    paStores: ["pa-123"],
  });
  assert.deepEqual(scopes.map((scope) => scope.type), ["board", "county", "store"]);
  const legacy = legacyAreaPreferencesFromScopes(scopes);
  assert.deepEqual(legacy.ncBoards, ["Wake County ABC"]);
  assert.deepEqual(legacy.paStores, ["pa-123"]);
});

test("legacy county labels keep county semantics outside Pennsylvania", () => {
  const scopes = monitoringScopesFromPreferences({ states: ["NY"], nyAreas: ["Nassau County"] });
  assert.equal(scopes[0]?.type, "county");
  assert.equal(scopes[0]?.id, "county:36059");
  assert.deepEqual(legacyAreaPreferencesFromScopes(scopes).nyAreas, ["Nassau County"]);
});

test("generic normalization validates, dedupes, and makes statewide authoritative", () => {
  const scopes = normalizeMonitoringScopes([
    { type: "county", id: "county:36061", state: "NY" },
    { type: "state", id: "state:NY", state: "ny" },
    { type: "city", id: "place:3651000", state: "NY" },
    { type: "state", id: "state:NY", state: "NY" },
    { type: "county", id: "county:nope", state: "NY" },
  ]);
  assert.deepEqual(scopes, [{ type: "state", id: "state:NY", state: "NY", label: "New York" }]);
});

test("limits trim deterministically without splitting state semantics", () => {
  const scopes = normalizeMonitoringScopes([
    { type: "state", id: "state:FL", state: "FL" },
    { type: "state", id: "state:MS", state: "MS" },
    { type: "state", id: "state:DC", state: "DC" },
  ]);
  assert.deepEqual(trimMonitoringScopesToLimit(scopes, 2).map((scope) => scope.id), ["state:FL", "state:MS"]);
  assert.deepEqual(trimMonitoringScopesToLimit(scopes, 0), []);
});

test("shared matcher supports state county city board and store", () => {
  const candidate = { state: "NY", countyFips: "36061", placeFips: "3651000", storeId: "ny-store-7", storeCity: "New York", storeCounty: "New York County" };
  assert.equal(candidateMatchesMonitoringScopes(candidate, [{ type: "state", id: "state:NY", state: "NY", label: "New York" }]), true);
  assert.equal(candidateMatchesMonitoringScopes(candidate, [{ type: "county", id: "county:36061", state: "NY", label: "New York County" }]), true);
  assert.equal(candidateMatchesMonitoringScopes(candidate, [{ type: "city", id: "place:3651000", state: "NY", label: "New York city" }]), true);
  assert.equal(candidateMatchesMonitoringScopes(candidate, [{ type: "store", id: "store:NY:ny-store-7", state: "NY", label: "Store" }]), true);
  assert.equal(candidateMatchesMonitoringScopes({ state: "NC", boardName: "Wake County ABC" }, [{ type: "board", id: "board:NC:wake-county-abc", state: "NC", label: "Wake County ABC" }]), true);
});

test("statewide NY and CO do not apply hidden local defaults", () => {
  assert.equal(candidateMatchesMonitoringScopes({ state: "NY", storeCity: "Buffalo" }, [{ type: "state", id: "state:NY", state: "NY", label: "New York" }]), true);
  assert.equal(candidateMatchesMonitoringScopes({ state: "CO", storeCity: "Grand Junction" }, [{ type: "state", id: "state:CO", state: "CO", label: "Colorado" }]), true);
});

test("legacy synthetic market scopes preserve existing metro and area semantics", () => {
  const atlanta = monitoringScopesFromPreferences({ states: ["GA"], gaAreas: ["Atlanta Metro"] });
  const nashville = monitoringScopesFromPreferences({ states: ["TN"], tnAreas: ["Nashville Metro"] });
  const charlotte = monitoringScopesFromPreferences({ states: ["NC"], ncBoards: ["Charlotte Metro ABC Boards"] });
  const sanDiego = monitoringScopesFromPreferences({ states: ["CA"], caAreas: ["San Diego"] });
  assert.equal(candidateMatchesMonitoringScopes({ state: "GA", storeCity: "Marietta" }, atlanta), true);
  assert.equal(candidateMatchesMonitoringScopes({ state: "TN", storeCity: "Franklin" }, nashville), true);
  assert.equal(candidateMatchesMonitoringScopes({ state: "NC", boardName: "Mecklenburg County ABC Board" }, charlotte), true);
  assert.equal(candidateMatchesMonitoringScopes({ state: "CA", storeCity: "San Diego" }, sanDiego), true);
});

test("Maryland aliases, exact city labels, and state-qualified store IDs fail closed", () => {
  const legacyMontgomery = monitoringScopesFromPreferences({ states: ["MD-MONTGOMERY"] });
  assert.deepEqual(legacyMontgomery, [
    { type: "county", id: "county:24031", state: "MD", label: "Montgomery County" },
  ]);
  assert.equal(candidateMatchesMonitoringScopes({ state: "MD-MONTGOMERY", storeCity: "Bethesda" }, legacyMontgomery), true);
  assert.equal(candidateMatchesMonitoringScopes({ state: "MD", storeCity: "Bethesda" }, legacyMontgomery), true);
  assert.deepEqual(monitoringScopesFromPreferences({ states: ["MD"] }), [
    { type: "state", id: "state:MD", state: "MD", label: "Maryland" },
  ]);
  assert.equal(candidateMatchesMonitoringScopes({ state: "NY", storeCity: "New York" }, [{ type: "city", id: "city:legacy:NY:york", state: "NY", label: "York" }]), false);
  const stores = normalizeMonitoringScopes([
    { type: "store", id: "store:shared-7", state: "NY", label: "NY branch" },
    { type: "store", id: "store:shared-7", state: "PA", label: "PA branch" },
  ]);
  assert.deepEqual(stores.map((scope) => scope.id), ["store:NY:shared-7", "store:PA:shared-7"]);
  const legacyPa = legacyAreaPreferencesFromScopes([{ type: "city", id: "place:4260000", state: "PA", label: "Philadelphia city" }]);
  assert.deepEqual(legacyPa.paCounties, ["Philadelphia city"]);
  assert.equal(candidateMatchesMonitoringScopes({ state: "PA", storeCity: "Pittsburgh", storeName: "Franklin" }, [{ type: "city", id: "city:legacy:PA:franklin", state: "PA", label: "Franklin" }]), false);
});
