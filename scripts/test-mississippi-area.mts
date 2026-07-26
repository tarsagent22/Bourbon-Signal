import assert from "node:assert/strict";

import {
  MISSISSIPPI_AREAS,
  mississippiAreaForLocation,
  mississippiAreaMatchesLocation,
  normalizeMississippiAreas,
  parseMississippiAreaQuery,
} from "../src/lib/mississippi-area.ts";

assert.equal(MISSISSIPPI_AREAS.length, 9);
assert.equal(new Set(MISSISSIPPI_AREAS.map((area) => area.id)).size, 9);
assert.deepEqual(normalizeMississippiAreas(["Gulf Coast", "gulf-coast", "invalid"]), ["gulf-coast"]);
assert.deepEqual(parseMississippiAreaQuery("Gulf Coast"), { requested: true, valid: true, areas: ["gulf-coast"] });
assert.deepEqual(parseMississippiAreaQuery("Gulfport Heights"), { requested: true, valid: false, areas: [] });
assert.equal(mississippiAreaForLocation({ state: "MS", city: "Southaven", county: "DeSoto County" }), "northwest-desoto-memphis-fringe");
assert.equal(mississippiAreaForLocation({ state: "MS", city: "Gulfport", county: "Harrison" }), "gulf-coast");
assert.equal(mississippiAreaForLocation({ state: "MS", city: "Gulfport Heights", county: "Unknown" }), null);
assert.equal(mississippiAreaForLocation({ state: "AL", city: "Gulfport", county: "Harrison" }), null);
assert.equal(mississippiAreaMatchesLocation({ state: "MS", city: "Gulfport", county: "Harrison" }, ["Gulf Coast"]), true);
assert.equal(mississippiAreaMatchesLocation({ state: "MS", city: "Southaven", county: "DeSoto" }, ["Gulf Coast"]), false);

console.log("Mississippi nine-region exact area contract passed.");
