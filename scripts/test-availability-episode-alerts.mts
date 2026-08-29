import assert from "node:assert/strict";
import test from "node:test";

import {
  selectUnseenUnderlyingAlertChildren,
  stableUnderlyingAlertKey,
  withAvailabilityEpisodeIdentity,
} from "../src/lib/alert-dedupe.ts";
import { dropAvailabilityEpisodeIdentity } from "../src/lib/drop-feed-policy.ts";

const first = {
  id: "row-first",
  availabilityEpisodeId: "episode-first",
  dedupeKey: "inventory|qty-1",
  quantity: 1,
};
const reconfirmed = {
  ...first,
  id: "row-reconfirmed",
  dedupeKey: "inventory|qty-12",
  quantity: 12,
};
const restock = {
  ...reconfirmed,
  id: "row-restock",
  availabilityEpisodeId: "episode-restock",
  dedupeKey: "inventory|qty-4",
  quantity: 4,
};

test("delivery normalizes engine episodes onto the existing event identity seam", () => {
  assert.deepEqual(withAvailabilityEpisodeIdentity(first), {
    ...first,
    eventIdentityKey: "availability-episode:episode-first",
  });
  assert.equal(stableUnderlyingAlertKey(first), "availability-episode:episode-first");
});

test("reconfirmation and quantity metadata do not create an unseen alert", () => {
  assert.equal(stableUnderlyingAlertKey(reconfirmed), stableUnderlyingAlertKey(first));
  assert.deepEqual(
    selectUnseenUnderlyingAlertChildren(reconfirmed, new Set([stableUnderlyingAlertKey(first)])),
    [],
  );
});

test("the legacy mutable key suppresses a rollout duplicate for an already-seen episode", () => {
  const migrating = { ...first, legacyDedupeKey: first.dedupeKey };
  assert.deepEqual(selectUnseenUnderlyingAlertChildren(migrating, new Set([first.dedupeKey])), []);
});

test("an explicit unavailable-to-available restock has a new alert identity", () => {
  assert.notEqual(stableUnderlyingAlertKey(restock), stableUnderlyingAlertKey(first));
  assert.deepEqual(
    selectUnseenUnderlyingAlertChildren(restock, new Set([stableUnderlyingAlertKey(first)])),
    [restock],
  );
});

test("drop feed identity remains stable while current metadata is refreshed", () => {
  assert.equal(dropAvailabilityEpisodeIdentity(first), "episode-first");
  assert.equal(dropAvailabilityEpisodeIdentity(reconfirmed), "episode-first");
  assert.notEqual(dropAvailabilityEpisodeIdentity(restock), dropAvailabilityEpisodeIdentity(first));
});
