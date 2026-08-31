import assert from "node:assert/strict";
import test from "node:test";
import type { SignalAreaDirectory, SignalFeedFilters } from "../signals/feed-filters";
import { parseTripModeState, serializeTripModeState, signalFiltersForTrip, tripModeForState } from "./trip-mode";

const areas: SignalAreaDirectory = {
  states: [
    { code: "NC", label: "North Carolina", areaLabel: "Board", options: [] },
    { code: "VA", label: "Virginia", areaLabel: "City", options: [] },
  ],
};

test("Trip Mode accepts only a destination exposed by the member feed-area directory", () => {
  assert.deepEqual(tripModeForState(" va ", areas), { state: "VA" });
  assert.equal(tripModeForState("KY", areas), null);
  assert.equal(parseTripModeState('{"version":1,"state":"KY"}', areas), null);
  assert.equal(parseTripModeState("not json", areas), null);
});

test("Trip Mode serializes a versioned local value that can be restored", () => {
  const trip = tripModeForState("NC", areas);
  assert.ok(trip);
  assert.equal(serializeTripModeState(trip), '{"version":1,"state":"NC"}');
  assert.deepEqual(parseTripModeState(serializeTripModeState(trip), areas), trip);
});

test("Trip Mode overrides only request geography and leaves the member's filters untouched", () => {
  const filters: SignalFeedFilters = { rarities: ["allocated"], state: "NC", area: "Triangle", freshness: "7d", bottle: "Stagg" };
  const effective = signalFiltersForTrip(filters, { state: "VA" });

  assert.deepEqual(effective, { ...filters, state: "VA", area: "" });
  assert.equal(filters.state, "NC");
  assert.equal(filters.area, "Triangle");
  assert.equal(signalFiltersForTrip(filters, null), filters);
});
