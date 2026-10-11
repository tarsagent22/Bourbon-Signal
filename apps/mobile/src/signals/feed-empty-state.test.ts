import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SIGNAL_FILTERS } from "./feed-filters";
import { feedEmptyState } from "./feed-empty-state";
test("empty search and time filters offer a narrow correction while retaining the hunting area", () => {
  const filters = { ...DEFAULT_SIGNAL_FILTERS, state: "NC", area: "Wake", bottle: "Blanton's", freshness: "24h" as const };
  assert.equal(feedEmptyState("market", filters).action, "search");
  assert.equal(feedEmptyState("market", { ...filters, bottle: "" }).action, "time");
  assert.equal(feedEmptyState("market", { ...filters, bottle: "", freshness: null }).action, "area");
});
test("a feed with no filters sends members to sightings rather than implying filters caused the absence", () => {
  assert.equal(feedEmptyState("market", DEFAULT_SIGNAL_FILTERS).action, "community");
  assert.equal(feedEmptyState("community", DEFAULT_SIGNAL_FILTERS).action, "post");
  assert.equal(feedEmptyState("market", { ...DEFAULT_SIGNAL_FILTERS, state: "NC" }).action, "state");
});
