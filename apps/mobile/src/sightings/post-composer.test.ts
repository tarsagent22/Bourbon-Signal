import assert from "node:assert/strict";
import test from "node:test";
import type { RadarBottleOption } from "../api/types";
import {
  approvedStoreFromGeography,
  buildPostSightingSubmission,
  filterBottleSuggestions,
  isPostRequiredComplete,
  POST_QUANTITY_CHOICES,
} from "./post-composer";

const catalog: RadarBottleOption[] = [
  { id: "eagle-rare-10", name: "Eagle Rare 10 Year", rarity: "allocated" },
  { id: "rare-breed", name: "Rare Breed" },
  { id: "eh-taylor", name: "E.H. Taylor Small Batch", rarity: "allocated" },
];

test("ranks bottle suggestions by prefix before contains matches", () => {
  assert.deepEqual(
    filterBottleSuggestions(catalog, "rare").map((bottle) => bottle.id),
    ["rare-breed", "eagle-rare-10"],
  );
});

test("maps an approved geography store without parsing its subtitle", () => {
  assert.deepEqual(approvedStoreFromGeography({
    id: "store:NC:abc-123",
    storeId: "abc-123",
    level: "store",
    state: "NC",
    name: "Bourbon House",
    address: "123 Main St",
    city: "Raleigh",
    zip: "27601",
  }), {
    id: "abc-123",
    name: "Bourbon House",
    address: "123 Main St",
    city: "Raleigh",
    state: "NC",
    zip: "27601",
  });
});

test("rejects incomplete approved geography store rows", () => {
  assert.equal(approvedStoreFromGeography({ id: "store:NC:missing", level: "store", state: "NC", name: "Missing address" }), null);
});

test("requires complete bottle and store facts before posting", () => {
  assert.equal(isPostRequiredComplete({ bottleName: "Eagle Rare", storeName: "Bourbon House", storeAddress: "123 Main St", storeCity: "Raleigh", storeState: "NC" }), true);
  assert.equal(isPostRequiredComplete({ bottleName: "Eagle Rare", storeName: "Bourbon House", storeAddress: "", storeCity: "Raleigh", storeState: "NC" }), false);
  assert.equal(isPostRequiredComplete({ bottleName: "Eagle Rare", storeName: "Bourbon House", storeAddress: "123 Main St", storeCity: "Raleigh", storeState: "North Carolina" }), false);
});

test("preserves canonical bottle and approved store identity without manual review", () => {
  const result = buildPostSightingSubmission({
    bottleName: "Eagle Rare 10 Year",
    bottleId: "eagle-rare-10",
    store: { id: "abc-123", name: "Bourbon House", address: "123 Main St", city: "Raleigh", state: "NC", zip: "27601" },
    price: "$69.99",
    quantity: "2",
    notes: "Behind the counter",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.payload.bottleId, "eagle-rare-10");
  assert.equal(result.payload.storeId, "abc-123");
  assert.equal(result.payload.price, 69.99);
  assert.equal(result.payload.reviewState, undefined);
});

test("manual stores retain stable identity and request catalog review", () => {
  const result = buildPostSightingSubmission({
    bottleName: "Local Pick",
    store: { id: null, name: "Corner Store", address: "9 Oak Ave", city: "Durham", state: "nc" },
    price: "",
    quantity: "3–5",
    notes: "",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.payload.storeId, /^manual:/);
  assert.equal(result.payload.storeState, "NC");
  assert.equal(result.payload.reviewState?.needsStoreReview, true);
  assert.equal(result.payload.reviewState?.manualStoreName, "Corner Store");
});

test("reports invalid shelf prices without building a payload", () => {
  const result = buildPostSightingSubmission({
    bottleName: "Eagle Rare",
    store: { id: "abc-123", name: "Bourbon House", address: "123 Main St", city: "Raleigh", state: "NC" },
    price: "free",
    quantity: "",
    notes: "",
  });
  assert.deepEqual(result, { ok: false, error: "Enter a valid shelf price or leave it blank." });
});

test("offers concise observed quantity choices", () => {
  assert.deepEqual(POST_QUANTITY_CHOICES, ["1", "2", "3–5", "6+"]);
});
