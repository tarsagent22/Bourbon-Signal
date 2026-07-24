import assert from "node:assert/strict";
import {
  newYorkAreaMatchesFields,
  normalizeNewYorkAreas,
  parseNewYorkAreaQuery,
  SUPPORTED_NEW_YORK_AREAS,
} from "../src/lib/new-york-area.ts";
import {
  coloradoAreaMatchesFields,
  normalizeColoradoAreas,
  parseColoradoAreaQuery,
  SUPPORTED_COLORADO_AREAS,
} from "../src/lib/colorado-area.ts";

assert.deepEqual(SUPPORTED_NEW_YORK_AREAS, ["New York City"]);
assert.deepEqual(normalizeNewYorkAreas(["NYC", "new york city", "Albany"]), ["New York City"]);
assert.deepEqual(parseNewYorkAreaQuery(null), { requested: false, valid: true, areas: [] });
assert.deepEqual(parseNewYorkAreaQuery("New York City"), { requested: true, valid: true, areas: ["New York City"] });
assert.deepEqual(parseNewYorkAreaQuery("Albany"), { requested: true, valid: false, areas: [] });
for (const field of [
  "New York City",
  "New York, NY",
  "Manhattan, NY",
  "Brooklyn, NY 11201",
  "Queens, NY",
  "Bronx, NY",
  "Staten Island, NY",
  "123 Broadway, New York, NY 10006",
]) {
  assert.equal(newYorkAreaMatchesFields([field], ["New York City"]), true, `${field} should match New York City`);
}
for (const field of ["New York State", "Albany, New York", "Manhattan, KS", "Long Island, NY"]) {
  assert.equal(newYorkAreaMatchesFields([field], ["New York City"]), false, `${field} must not expand New York City coverage`);
}
assert.equal(newYorkAreaMatchesFields(["Brooklyn"], []), true);

assert.deepEqual(SUPPORTED_COLORADO_AREAS, ["Denver Metro"]);
assert.deepEqual(normalizeColoradoAreas(["Denver", "denver metro", "Colorado Springs"]), ["Denver Metro"]);
assert.deepEqual(parseColoradoAreaQuery(null), { requested: false, valid: true, areas: [] });
assert.deepEqual(parseColoradoAreaQuery("Denver Metro"), { requested: true, valid: true, areas: ["Denver Metro"] });
assert.deepEqual(parseColoradoAreaQuery("Colorado"), { requested: true, valid: false, areas: [] });
for (const field of [
  "Denver",
  "Denver, CO",
  "Lakeside, CO",
  "Westminster, CO 80031",
  "Greenwood Village, CO",
  "2500 E 1st Ave, Denver, CO 80206",
]) {
  assert.equal(coloradoAreaMatchesFields([field], ["Denver Metro"]), true, `${field} should match Denver Metro`);
}
for (const field of ["Colorado", "Colorado statewide", "Colorado Springs, CO", "Boulder, CO", "Westminster, MD"]) {
  assert.equal(coloradoAreaMatchesFields([field], ["Denver Metro"]), false, `${field} must not expand Denver Metro coverage`);
}
assert.equal(coloradoAreaMatchesFields(["Denver"], []), true);

console.log("New York City and Denver Metro strict area contracts passed.");
