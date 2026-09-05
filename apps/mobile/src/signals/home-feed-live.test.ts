import assert from "node:assert/strict";
import test from "node:test";
import type { Signal } from "../api/types";
import { acceptQueuedSignals, reconcileDisplayedSignals, reconcileQueuedSignals, recentTickerSignals, tickerLocationLabel } from "./home-feed-live";

function signal(id: string, displayAt: string, overrides: Partial<Signal> = {}): Signal {
  return {
    contractVersion: "bourbon-signal/signal@1",
    id,
    kind: "availability",
    source: { type: "trusted_source", label: "Verified source" },
    bottle: { name: `Bottle ${id}`, rarity: "allocated" },
    location: { scope: "exact_store", state: "NC", store: { city: "Raleigh", state: "NC" } },
    timing: { displayAt },
    evidence: { photo: false, corroborationCount: 0, helpfulCount: 0, retailerReported: false, sourceBacked: true },
    strength: "best",
    alertEligibility: { inventory: true, watch: true },
    actions: [],
    ...overrides,
  };
}

test("background reconciliation queues only genuinely new current-scope ids and withdraws vanished rows", () => {
  const current = [signal("a", "2026-09-05T12:00:00.000Z"), signal("b", "2026-09-05T11:00:00.000Z")];
  const first = reconcileQueuedSignals(current, [], [signal("c", "2026-09-05T13:00:00.000Z"), current[0]]);
  assert.deepEqual(first.map((item) => item.id), ["c"]);
  assert.deepEqual(current.map((item) => item.id), ["a", "b"], "browsing order must remain stable");
  const second = reconcileQueuedSignals(current, first, [signal("d", "2026-09-05T14:00:00.000Z"), current[0]]);
  assert.deepEqual(second.map((item) => item.id), ["d"], "withdrawn pending rows must disappear before acceptance");
  assert.deepEqual(reconcileQueuedSignals(current, second, [second[0], second[0], current[0]]).map((item) => item.id), ["d"]);
});

test("accepting queued rows prepends without duplicating the visible feed or disturbing later pages", () => {
  const current = [signal("a", "2026-09-05T12:00:00.000Z"), signal("b", "2026-09-05T11:00:00.000Z")];
  const queued = [signal("d", "2026-09-05T14:00:00.000Z"), signal("c", "2026-09-05T13:00:00.000Z"), current[0]];
  assert.deepEqual(acceptQueuedSignals(current, queued).map((item) => item.id), ["d", "c", "a", "b"]);
});

test("poll reconciliation ignores historical first-page fills for arrival cues and lets incoming versions win", () => {
  const current = [signal("a", "2026-09-05T12:00:00.000Z")];
  const staleQueued = signal("new", "2026-09-05T13:00:00.000Z", { bottle: { name: "Stale", rarity: "allocated" } });
  const corrected = signal("new", "2026-09-05T13:00:00.000Z", { bottle: { name: "Corrected", rarity: "allocated" } });
  const historical = signal("old-fill", "2026-09-05T11:00:00.000Z");
  const queued = reconcileQueuedSignals(current, [staleQueued], [corrected, historical], "2026-09-05T12:00:00.000Z");
  assert.deepEqual(queued.map((item) => item.id), ["new"]);
  assert.equal(queued[0]?.bottle.name, "Corrected");
});

test("displayed poll updates matching ids in place and preserves rows beyond a truncated first page", () => {
  const current = [
    signal("a", "2026-09-05T14:00:00.000Z"),
    signal("withdrawn", "2026-09-05T13:00:00.000Z"),
    signal("later-page", "2026-09-04T10:00:00.000Z"),
  ];
  const corrected = signal("a", "2026-09-05T14:00:00.000Z", { bottle: { name: "Corrected A", rarity: "allocated" } });
  const incoming = [corrected, signal("boundary", "2026-09-05T12:00:00.000Z")];
  const reconciled = reconcileDisplayedSignals(current, incoming, true);
  assert.deepEqual(reconciled.map((item) => item.id), ["a", "later-page"]);
  assert.equal(reconciled[0]?.bottle.name, "Corrected A");
  assert.deepEqual(reconcileDisplayedSignals(current, incoming, false).map((item) => item.id), ["a"]);
});

test("ticker admits honest recent availability reports only and formats city/state", () => {
  const now = new Date("2026-09-05T15:00:00.000Z");
  const recent = signal("recent", "2026-09-05T13:00:00.000Z");
  const future = signal("future", "2026-09-06T13:00:00.000Z");
  const old = signal("old", "2026-08-30T13:00:00.000Z");
  const release = signal("release", "2026-09-05T14:00:00.000Z", { kind: "release" });
  assert.deepEqual(recentTickerSignals([future, old, release, recent], now).map((item) => item.id), ["recent"]);
  assert.equal(tickerLocationLabel(recent), "Raleigh, NC");
});
