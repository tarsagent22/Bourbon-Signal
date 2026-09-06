import assert from "node:assert/strict";
import test from "node:test";
import type { Signal } from "../api/types";
import { acceptQueuedSignals, reconcileQueuedSignals, recentTickerSignals, tickerLocationLabel } from "./home-feed-live";

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

test("background refresh queues only newer current-scope rows without moving the feed", () => {
  const current = [signal("a", "2026-09-05T12:00:00.000Z"), signal("b", "2026-09-05T11:00:00.000Z")];
  const queued = reconcileQueuedSignals(current, [], [signal("c", "2026-09-05T13:00:00.000Z"), current[0], signal("old", "2026-09-05T10:00:00.000Z")]);
  assert.deepEqual(queued.map((item) => item.id), ["c"]);
  assert.deepEqual(current.map((item) => item.id), ["a", "b"]);
});

test("accepting new rows prepends once and preserves existing order", () => {
  const current = [signal("a", "2026-09-05T12:00:00.000Z"), signal("b", "2026-09-05T11:00:00.000Z")];
  assert.deepEqual(acceptQueuedSignals(current, [signal("c", "2026-09-05T13:00:00.000Z"), current[0]]).map((item) => item.id), ["c", "a", "b"]);
});

test("ticker includes only honest recent availability and formats city/state", () => {
  const now = new Date("2026-09-05T15:00:00.000Z");
  const recent = signal("recent", "2026-09-05T13:00:00.000Z");
  const future = signal("future", "2026-09-06T13:00:00.000Z");
  const old = signal("old", "2026-08-30T13:00:00.000Z");
  const release = signal("release", "2026-09-05T14:00:00.000Z", { kind: "release" });
  assert.deepEqual(recentTickerSignals([future, old, release, recent], now).map((item) => item.id), ["recent"]);
  assert.equal(tickerLocationLabel(recent), "Raleigh, NC");
});
