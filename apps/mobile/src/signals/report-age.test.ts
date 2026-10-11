import assert from "node:assert/strict";
import test from "node:test";
import type { Signal } from "../api/types";
import { signalAccessibilityLabel } from "../api/presentation";
import { reportAge } from "./report-age";
const now = new Date("2026-10-10T15:00:00Z");
const signal = (timing: Signal["timing"], patch: Partial<Signal> = {}) => ({ kind: "availability", source: { type: "member" }, timing, ...patch } as Signal);
test("an updated feed time cannot make a two-day-old sighting look fresh", () => {
  const age = reportAge(signal({ observedAt: "2026-10-08T15:00:00Z", reportedAt: now.toISOString(), displayAt: now.toISOString() }), now);
  assert.equal(age.label, "Seen 2 days ago"); assert.equal(age.older, true);
});
test("online reports, releases, and future scheduled events do not claim an in-store sighting", () => {
  assert.equal(reportAge(signal({ displayAt: "2026-10-10T14:40:00Z" }, { source: { type: "member", label: "Member", reportMode: "reported_online" } }), now).label, "Reported 20 minutes ago");
  assert.equal(reportAge(signal({ reportedAt: "2026-10-10T14:00:00Z", displayAt: "2026-10-15T15:00:00Z" }, { kind: "event" }), now).label, "Posted 1 hour ago");
  assert.equal(reportAge(signal({ displayAt: "2026-10-15T15:00:00Z" }), now).label, "Time not available");
});
test("missing and malformed dates are explicit, and the 24-hour age boundary changes old-report styling", () => {
  assert.equal(reportAge(signal({ displayAt: "bad-date" }), now).value, null);
  assert.equal(reportAge(signal({ observedAt: "bad-date", displayAt: now.toISOString() }), now).label, "Seen just now");
  assert.equal(reportAge(signal({ displayAt: "2026-10-09T15:00:01Z" }), now).older, false);
  assert.equal(reportAge(signal({ displayAt: "2026-10-09T15:00:00Z" }), now).older, true);
});

test("screen readers receive the observation age even when the feed time was updated later", () => {
  const row = signal({ observedAt: "2026-10-08T15:00:00Z", displayAt: now.toISOString() }, {
    source: { type: "member", label: "Member #12" }, bottle: { name: "Example" }, location: { scope: "state", state: "NC" },
    evidence: { photo: false, corroborationCount: 0, helpfulCount: 0, retailerReported: false, sourceBacked: false },
  });
  assert.match(signalAccessibilityLabel(row, now), /Seen 2 days ago/);
  assert.doesNotMatch(signalAccessibilityLabel(row, now), /just now/);
});
