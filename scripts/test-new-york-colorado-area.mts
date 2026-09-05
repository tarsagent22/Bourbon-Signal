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

assert.deepEqual(SUPPORTED_NEW_YORK_AREAS, ["New York City", "Nassau County", "Buffalo"]);
assert.deepEqual(normalizeNewYorkAreas(["NYC", "new york city", "nassau", "Buffalo NY", "Albany"]), ["New York City", "Nassau County", "Buffalo"]);
assert.deepEqual(parseNewYorkAreaQuery(null), { requested: false, valid: true, areas: [] });
assert.deepEqual(parseNewYorkAreaQuery("New York City"), { requested: true, valid: true, areas: ["New York City"] });
assert.deepEqual(parseNewYorkAreaQuery("Nassau County"), { requested: true, valid: true, areas: ["Nassau County"] });
assert.deepEqual(parseNewYorkAreaQuery("Buffalo"), { requested: true, valid: true, areas: ["Buffalo"] });
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

for (const field of [
  "Nassau County",
  "270 Nassau Blvd, Garden City, NY 11530, USA",
  "1152 Wantagh Ave, Wantagh, NY 11793, USA",
  "1250 Old Country Rd, Westbury, NY 11590, USA",
]) {
  assert.equal(newYorkAreaMatchesFields([field], ["Nassau County"]), true, `${field} should match Nassau County`);
  assert.equal(newYorkAreaMatchesFields([field], ["New York City"]), false, `${field} must not match New York City`);
}
for (const field of ["Long Island, NY", "Suffolk County", "Huntington, NY", "Nassau Street, New York, NY 10038"]) {
  assert.equal(newYorkAreaMatchesFields([field], ["Nassau County"]), false, `${field} must not expand Nassau County coverage`);
}

for (const field of ["Buffalo", "Buffalo, NY", "24 Bailey Ave, Buffalo, NY 14220", "1245 Bailey Ave, Buffalo, NY 14206"]) {
  assert.equal(newYorkAreaMatchesFields([field], ["Buffalo"]), true, `${field} should match Buffalo`);
  assert.equal(newYorkAreaMatchesFields([field], ["New York City"]), false, `${field} must not match New York City`);
}
for (const field of ["Buffalo, MN", "Buffalo County, WI", "Buffalo Grove, IL", "Amherst, NY"]) {
  assert.equal(newYorkAreaMatchesFields([field], ["Buffalo"]), false, `${field} must not expand Buffalo coverage`);
}

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

console.log("New York City, Nassau County, Buffalo, and Denver Metro strict area contracts passed.");
