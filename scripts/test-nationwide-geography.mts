import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  GEOGRAPHY_SOURCE,
  findGeographyById,
  listGeographyMatches,
  listMonitoringStates,
  searchGeography,
} from "../src/lib/geography-directory.ts";

test("the checked 2025 Census directory contains all 50 states plus DC", () => {
  const states = listMonitoringStates();
  assert.equal(states.length, 51);
  assert.deepEqual(states.map((state) => state.code).filter((code) => ["DC", "FL", "MS"].includes(code)), ["DC", "FL", "MS"]);
  assert.equal(GEOGRAPHY_SOURCE.vintage, "2025");
  assert.match(GEOGRAPHY_SOURCE.publisher, /Census Bureau/);
});

test("county and place stable IDs resolve and search is bounded", () => {
  assert.equal(findGeographyById("county:12086")?.name, "Miami-Dade County");
  assert.equal(findGeographyById("place:3651000")?.name, "New York city");
  const jackson = searchGeography({ state: "MS", levels: ["city"], query: "Jackson", limit: 5, offset: 0 });
  assert.ok(jackson.results.some((entry) => entry.id === "place:2836000"));
  assert.ok(jackson.results.length <= 5);
  assert.equal(typeof jackson.hasMore, "boolean");
});

test("deep place pagination is complete and stable beyond the first 50 matches", () => {
  const matches = listGeographyMatches({ state: "FL", levels: ["city"], query: "" });
  assert.ok(matches.length > 100);
  const first = searchGeography({ state: "FL", levels: ["city"], limit: 50, offset: 0 });
  const second = searchGeography({ state: "FL", levels: ["city"], limit: 50, offset: 50 });
  assert.equal(first.hasMore, true);
  assert.equal(second.hasMore, true);
  assert.equal(new Set([...first.results, ...second.results].map((entry) => entry.id)).size, 100);
  assert.deepEqual([...first.results, ...second.results], matches.slice(0, 100));
});

test("runtime geography code is static and never fetches Census", () => {
  const runtime = readFileSync(new URL("../src/lib/geography-directory.ts", import.meta.url), "utf8");
  assert.doesNotMatch(runtime, /\bfetch\s*\(/);
  const generator = readFileSync(new URL("./generate-geography-directory.mjs", import.meta.url), "utf8");
  assert.match(generator, /2025_Gaz_state_national\.zip/);
  assert.match(generator, /2025_Gaz_counties_national\.zip/);
  assert.match(generator, /2025_Gaz_place_national\.zip/);
});
