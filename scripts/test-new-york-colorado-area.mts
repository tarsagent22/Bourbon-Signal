import assert from "node:assert/strict";
import { NEW_YORK_EXPANSION_RETAILER_SOURCES, COLORADO_EXPANSION_RETAILER_SOURCES } from "../engine/src/collectors/metro-expansion-sources.mjs";
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

assert.deepEqual(SUPPORTED_NEW_YORK_AREAS, ["New York City", "Nassau County", "Suffolk County", "Buffalo", "Rochester Metro", "Hudson Valley", "Lake George"]);
assert.deepEqual(normalizeNewYorkAreas(["NYC", "new york city", "nassau", "Suffolk County", "Buffalo NY", "Rochester", "Hudson Valley", "Lake George"]), ["New York City", "Nassau County", "Suffolk County", "Buffalo", "Rochester Metro", "Hudson Valley", "Lake George"]);
assert.deepEqual(parseNewYorkAreaQuery(null), { requested: false, valid: true, areas: [] });
assert.deepEqual(parseNewYorkAreaQuery("New York City"), { requested: true, valid: true, areas: ["New York City"] });
assert.deepEqual(parseNewYorkAreaQuery("Nassau County"), { requested: true, valid: true, areas: ["Nassau County"] });
assert.deepEqual(parseNewYorkAreaQuery("Buffalo"), { requested: true, valid: true, areas: ["Buffalo"] });
assert.deepEqual(parseNewYorkAreaQuery("Syracuse"), { requested: true, valid: false, areas: [] });
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

assert.deepEqual(SUPPORTED_COLORADO_AREAS, ["Denver Metro", "Boulder County", "Colorado Springs"]);
assert.deepEqual(normalizeColoradoAreas(["Denver", "denver metro", "Boulder", "Colorado Springs"]), ["Denver Metro", "Boulder County", "Colorado Springs"]);
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

for (const [area, address, wrongState] of [
  ["Rochester Metro", "1900 Empire Blvd Suite 145, Webster, NY 14580, USA", "Webster, MA 01570"],
  ["Hudson Valley", "295 NY-375 #2, West Hurley, NY 12491, USA", "West Hurley, NJ 07001"],
  ["Lake George", "Lake George, NY 12845", "Lake George, CO 80827"],
]) {
  assert.equal(newYorkAreaMatchesFields([address], [area]), true, `${address} must match ${area}`);
  assert.equal(newYorkAreaMatchesFields([address], ["New York City"]), false);
  assert.equal(newYorkAreaMatchesFields([wrongState], [area]), false);
  assert.deepEqual(parseNewYorkAreaQuery(area), { requested: true, valid: true, areas: [area] });
}
for (const [area, address, wrongState] of [
  ["Boulder County", "Nederland, CO 80466, USA", "Boulder, MT 59632"],
  ["Boulder County", "Boulder, CO 80301", "Nederland, TX 77627"],
  ["Colorado Springs", "Colorado Springs, CO 80909", "Colorado Springs, TX 75001"],
  ["Denver Metro", "Littleton, CO 80120", "Littleton, NH 03561"],
]) {
  assert.equal(coloradoAreaMatchesFields([address], [area]), true);
  assert.equal(coloradoAreaMatchesFields([wrongState], [area]), false);
}

for (const source of NEW_YORK_EXPANSION_RETAILER_SOURCES) {
  assert.ok(SUPPORTED_NEW_YORK_AREAS.includes(source.area), `${source.id} needs a supported area`);
  for (const store of source.stores) {
    assert.equal(newYorkAreaMatchesFields([store.city, store.address], [source.area]), true, `${source.id} premises must match ${source.area}`);
  }
}
for (const source of COLORADO_EXPANSION_RETAILER_SOURCES) {
  assert.ok(SUPPORTED_COLORADO_AREAS.includes(source.area), `${source.id} needs a supported area`);
  for (const store of source.stores) {
    assert.equal(coloradoAreaMatchesFields([store.city, store.address], [source.area]), true, `${source.id} premises must match ${source.area}`);
  }
}

console.log("Selected New York and Colorado exact-area contracts passed.");
