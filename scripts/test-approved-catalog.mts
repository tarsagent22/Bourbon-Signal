import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildApprovedBottle,
  buildApprovedLocation,
} from "../src/lib/approved-catalog.ts";

const bottle = buildApprovedBottle({
  canonicalName: "Penelope Havana",
  brand: "Penelope",
  category: "bourbon",
  availability: "limited",
}, "admin_123", "bottle_queue");
assert.equal(bottle.id, "penelope-havana");
assert.equal(bottle.canonicalName, "Penelope Havana");
assert.equal(bottle.brand, "Penelope");
assert.equal(bottle.availability, "limited");
assert.equal(bottle.isSignalTracked, false);
assert.equal(bottle.isAlertEligible, false);
assert.equal(bottle.approvedBy, "admin_123");

assert.throws(() => buildApprovedBottle({
  canonicalName: "Unknown",
  brand: "Unknown",
  category: "bourbon",
  availability: "invented" as never,
}, "admin_123", "bottle_queue"), /availability/i);

const location = buildApprovedLocation({
  name: "Myrtle Beach Liquor",
  address: "123 Ocean Blvd",
  city: "Myrtle Beach",
  state: "sc",
  zip: "29577",
}, "admin_123", "sighting_review");
assert.equal(location.state, "SC");
assert.equal(location.locationType, "store");
assert.equal(location.precision, "store");
assert.equal(location.searchable, true);
assert.equal(location.collectorAttached, false);
assert.equal(location.hasSignals, false);
assert.match(location.id, /^approved-store:sc:/);

const schema = readFileSync(new URL("../src/lib/approved-catalog-schema.sql", import.meta.url), "utf8");
assert.match(schema, /CREATE TABLE IF NOT EXISTS approved_catalog_bottles/i);
assert.match(schema, /CREATE TABLE IF NOT EXISTS approved_catalog_locations/i);

const repository = readFileSync(new URL("../src/lib/approved-catalog-repository.ts", import.meta.url), "utf8");
assert.match(repository, /ON CONFLICT \(normalized_name\)/);
assert.match(repository, /ON CONFLICT \(normalized_key\)/);
assert.doesNotMatch(repository, /ensureSchema|CREATE TABLE|CREATE INDEX/i);

const bottleRoute = readFileSync(new URL("../src/app/api/admin/bottle-contributions/route.ts", import.meta.url), "utf8");
assert.match(bottleRoute, /upsertApprovedBottle/);
assert.match(bottleRoute, /catalogBottle/);

const sightingRoute = readFileSync(new URL("../src/app/api/admin/sightings/route.ts", import.meta.url), "utf8");
assert.match(sightingRoute, /persistApprovedSightingCatalog/);
assert.match(sightingRoute, /catalogResult/);

const bible = readFileSync(new URL("../src/lib/bourbonBible.ts", import.meta.url), "utf8");
assert.match(bible, /listApprovedBottles/);

const storesRoute = readFileSync(new URL("../src/app/api/stores/route.ts", import.meta.url), "utf8");
assert.match(storesRoute, /listApprovedLocations/);

const bottleClient = readFileSync(new URL("../src/app/admin/bottle-queue/AdminBottleQueueClient.tsx", import.meta.url), "utf8");
for (const phrase of ["Add to Bottle Bible", "Canonical name", "Brand", "Availability"]) assert.match(bottleClient, new RegExp(phrase));
assert.doesNotMatch(bottleClient, /I added this bottle/);

console.log("Approved control-room catalog contract passed.");
