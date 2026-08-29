import assert from "node:assert/strict";
import test from "node:test";
import {
  enumerateUnderlyingAlertChildren,
  selectUnseenUnderlyingAlertChildren,
  stableUnderlyingAlertKey,
} from "../src/lib/alert-dedupe.ts";

const a = { id: "row-a", matchKey: "match-a", dedupeKey: "match-a|qty-10", quantity: 10 };
const b = { id: "row-b", matchKey: "match-b", dedupeKey: "match-b|qty-4", quantity: 4 };

test("enumerates grouped children and derives a stable state or event identity", () => {
  assert.deepEqual(enumerateUnderlyingAlertChildren({ __groupCandidates: [a, b] }), [a, b]);
  assert.equal(stableUnderlyingAlertKey(a), "match-a|qty-10");
  assert.equal(stableUnderlyingAlertKey({ eventIdentityKey: "episode-1", dedupeKey: "fallback" }), "episode-1");
  assert.equal(stableUnderlyingAlertKey({ dedupeKey: "dedupe-only", id: "fallback" }), "dedupe-only");
  assert.equal(stableUnderlyingAlertKey({ id: "id-only" }), "id-only");
  assert.equal(stableUnderlyingAlertKey({}), "");
});

test("a shrinking group {A,B} to {A} sends no underlying state twice", () => {
  const seen = new Set([stableUnderlyingAlertKey(a), stableUnderlyingAlertKey(b)]);
  assert.deepEqual(selectUnseenUnderlyingAlertChildren({ __groupCandidates: [{ ...a, quantity: 7 }] }, seen), []);
});

test("an expanding group {A} to {A,B} returns B only", () => {
  const unseen = selectUnseenUnderlyingAlertChildren(
    { __groupCandidates: [{ ...a, quantity: 10 }, b] },
    new Set([stableUnderlyingAlertKey(a)]),
  );
  assert.deepEqual(unseen.map(stableUnderlyingAlertKey), [stableUnderlyingAlertKey(b)]);
});

test("repeated snapshots with the same state identity do not reopen a match", () => {
  const repeated = { ...a, id: "new-snapshot-row", signalAt: "2026-08-25T18:00:00.000Z" };
  assert.deepEqual(selectUnseenUnderlyingAlertChildren(repeated, new Set([stableUnderlyingAlertKey(a)])), []);
});

test("an availability episode stays stable across quantity and confirmation metadata", () => {
  const first = { ...a, availabilityEpisodeId: "episode-one", dedupeKey: "match-a|qty-1", quantity: 1 };
  const reconfirmed = { ...first, dedupeKey: "match-a|qty-12", quantity: 12, signalAt: "2026-08-25T18:30:00.000Z" };
  assert.equal(stableUnderlyingAlertKey(first), "availability-episode:episode-one");
  assert.equal(stableUnderlyingAlertKey(reconfirmed), stableUnderlyingAlertKey(first));
  assert.deepEqual(selectUnseenUnderlyingAlertChildren(reconfirmed, new Set([stableUnderlyingAlertKey(first)])), []);
});

test("a meaningful changed-signal event receives a distinct occurrence identity", () => {
  const changed = {
    ...a,
    changeType: "changed_signal",
    signalAt: "2026-08-25T18:05:00.000Z",
    dedupeKey: "match-a|qty-1|limited",
    quantity: 1,
  };
  assert.notEqual(stableUnderlyingAlertKey(changed), stableUnderlyingAlertKey(a));
  assert.deepEqual(selectUnseenUnderlyingAlertChildren(changed, new Set([stableUnderlyingAlertKey(a)])), [changed]);
});

test("a later genuine restock occurrence is not suppressed by an earlier one", () => {
  const first = { ...a, changeType: "new_signal", signalAt: "2026-08-25T12:00:00.000Z" };
  const restock = { ...a, id: "row-a-restock", changeType: "new_signal", signalAt: "2026-08-26T12:00:00.000Z" };
  assert.notEqual(stableUnderlyingAlertKey(first), stableUnderlyingAlertKey(restock));
  assert.deepEqual(selectUnseenUnderlyingAlertChildren(restock, new Set([stableUnderlyingAlertKey(first)])), [restock]);
});
