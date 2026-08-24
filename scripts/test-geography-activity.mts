import assert from "node:assert/strict";
import test from "node:test";
import { countCommunityActivity } from "../src/lib/geography-community-activity.ts";

const sighting = {
  storeState: "FL",
  storeCity: "Miami",
  storeId: "store-1",
  count: 3,
};

test("community activity is attributed only to the matching geography level", () => {
  assert.equal(countCommunityActivity([sighting], { level: "state", state: "FL", name: "Florida" }), 3);
  assert.equal(countCommunityActivity([sighting], { level: "city", state: "FL", name: "Miami city" }), 3);
  assert.equal(countCommunityActivity([sighting], { level: "store", state: "FL", name: "Example", rawId: "store-1" }), 3);
  assert.equal(countCommunityActivity([sighting], { level: "county", state: "FL", name: "Miami-Dade County" }), 0);
  assert.equal(countCommunityActivity([{ ...sighting, storeCounty: "Miami-Dade County" }], { level: "county", state: "FL", name: "Miami-Dade County" }), 3);
  assert.equal(countCommunityActivity([{ ...sighting, storeState: "MD", storeCity: "Bethesda" }], { id: "county:24031", level: "county", state: "MD", name: "Montgomery County" }), 3);
});
