import assert from "node:assert/strict";
import test from "node:test";
import type { Signal } from "./types";
import { presentSignal, signalAccessibilityLabel, signalCardAppearance, signalCardStatusLabel, signalReporterAttribution } from "./presentation";

function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    contractVersion: "bourbon-signal/signal@1",
    id: "trusted_source:test",
    kind: "availability",
    source: { type: "trusted_source", label: "Trusted source" },
    bottle: { name: "Example Bourbon", rarity: "limited" },
    location: { scope: "exact_store", state: "NC", store: { name: "Example Spirits", city: "Raleigh", state: "NC" } },
    timing: { displayAt: "2026-08-23T12:00:00.000Z" },
    evidence: { photo: false, corroborationCount: 0, helpfulCount: 0, retailerReported: false, sourceBacked: true },
    strength: "more_activity",
    availability: { status: "reported" },
    alertEligibility: { inventory: false, watch: true },
    actions: [],
    ...overrides,
  };
}

test("unknown and zero prices use exact honest copy", () => {
  assert.equal(presentSignal(signal()).price, "Price unknown");
  assert.equal(presentSignal(signal({ availability: { status: "reported", price: 0 } })).price, "Price unknown");
  assert.equal(presentSignal(signal({ availability: { status: "reported", price: 64.99 } })).price, "$64.99");
});

test("store and geography are separate and duplicate slash-city suffixes are removed", () => {
  const presented = presentSignal(signal({
    location: {
      scope: "exact_store",
      state: "IA",
      store: { name: "New Star Fletcher / Waterloo", city: "Waterloo", state: "IA" },
    },
  }));
  assert.equal(presented.storeName, "New Star Fletcher");
  assert.equal(presented.geography, "Waterloo, IA");
  assert.equal(presented.location, "New Star Fletcher · Waterloo, IA");
});

test("report counts use concise natural grammar", () => {
  assert.equal(presentSignal(signal({ availability: { status: "reported", quantityLabel: "1" } })).quantity, "1 report");
  assert.equal(presentSignal(signal({ availability: { status: "reported", quantityLabel: "2 bottles" } })).quantity, "2 reports");
});

test("Community shelf quantity remains bottles seen rather than report count", () => {
  const community = { type: "member", label: "Member #19" } as const;
  assert.equal(presentSignal(signal({ source: community, availability: { status: "reported", quantityLabel: "2" } })).quantity, "2 seen");
  assert.equal(presentSignal(signal({ source: community, availability: { status: "reported", quantityLabel: "3–5" } })).quantity, "3–5 seen");
  assert.equal(presentSignal(signal({ source: community, availability: { status: "reported", quantityLabel: "2 behind counter" } })).quantity, "Reported: 2 behind counter");
});

test("older availability reports are qualified instead of presented as current inventory", () => {
  const olderReport = signal({ timing: { displayAt: "2026-08-23T12:00:00.000Z" } });
  const now = new Date("2026-08-27T12:00:00.000Z");
  assert.equal(signalCardStatusLabel(olderReport, now), "Availability unconfirmed");
  assert.match(signalAccessibilityLabel(olderReport, now), /Availability unconfirmed/);
  assert.doesNotMatch(signalAccessibilityLabel(olderReport, now), /, Reported,/);
});

test("Community reporter attribution uses the public display name", () => {
  const community = signal({
    id: "member:test",
    source: { type: "member", label: "Member #184", actor: { kind: "member", number: 184, label: "Member #184", displayName: "Oak Street Scout" } },
  });
  assert.equal(signalReporterAttribution(community), "Reported by Oak Street Scout");
});

test("source and rarity appearance stays restrained and makes Unicorn plum", () => {
  const market = signalCardAppearance(signal());
  const community = signalCardAppearance(signal({ source: { type: "member", label: "Member #184" } }));
  const unicorn = signalCardAppearance(signal({ bottle: { name: "Rare Bottle", rarity: "unicorn" } }));
  assert.equal(market.sourceLabel, "MARKET");
  assert.equal(community.sourceLabel, "COMMUNITY");
  assert.notEqual(market.surface, community.surface);
  assert.equal(unicorn.surface, "#211925");
  assert.equal(unicorn.keyline, "#61446E");
  assert.equal(unicorn.secondaryText, "#B7ACBA");
});
