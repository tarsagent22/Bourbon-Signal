import assert from "node:assert/strict";
import test from "node:test";
import type { RadarBottleOption } from "../api/types";
import {
  approvedStoreFromGeography,
  buildPostSignalPreview,
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
    bottleRarity: "allocated",
    store: { id: "abc-123", name: "Bourbon House", address: "123 Main St", city: "Raleigh", state: "NC", zip: "27601" },
    price: "$69.99",
    quantity: "2",
    notes: "Behind the counter",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.payload.bottleId, "eagle-rare-10");
  assert.equal(result.payload.rarityTier, "allocated");
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

test("builds a truthful Community Signal preview from the complete draft", () => {
  assert.deepEqual(buildPostSignalPreview({
    bottleName: "  E.H. Taylor Small Batch ",
    bottleRarity: "allocated",
    storeName: " Bourbon House ",
    storeAddress: " 123 Main St ",
    storeCity: " Raleigh ",
    storeState: "nc",
    price: "$69.99",
    quantity: "2",
    notes: " Behind the counter ",
    reporter: "Founder #19",
  }), {
    sourceLabel: "COMMUNITY",
    contextLabel: "ALLOCATED",
    timeLabel: "Now",
    bottleName: "E.H. Taylor Small Batch",
    storeName: "Bourbon House",
    geography: "Raleigh, NC",
    price: "$69.99",
    quantity: "2 seen",
    note: "Behind the counter",
    reporter: "Reported by Founder #19",
    surface: "#211A16",
    keyline: "#745033",
    accent: "#D79B60",
    secondaryText: "#BEA48D",
  });
});

test("Signal preview uses canonical unknown-price copy and Unicorn appearance", () => {
  const preview = buildPostSignalPreview({
    bottleName: "King of Kentucky",
    bottleRarity: "unicorn",
    storeName: "Bourbon House",
    storeAddress: "123 Main St",
    storeCity: "Raleigh",
    storeState: "NC",
    price: "0",
    quantity: "",
    notes: "",
  });
  assert.equal(preview?.price, "Price unknown");
  assert.equal(preview?.quantity, "Quantity unknown");
  assert.equal(preview?.surface, "#211925");
  assert.equal(preview?.keyline, "#61446E");
  assert.equal(preview?.accent, "#D8B5E2");
});

test("does not show a Signal preview until required identity is complete", () => {
  assert.equal(buildPostSignalPreview({
    bottleName: "Eagle Rare",
    storeName: "Bourbon House",
    storeAddress: "",
    storeCity: "Raleigh",
    storeState: "NC",
    price: "",
    quantity: "",
    notes: "",
    reporter: "Member #12",
  }), null);
});
