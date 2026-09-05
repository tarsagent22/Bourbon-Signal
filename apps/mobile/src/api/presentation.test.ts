import assert from "node:assert/strict";
import test from "node:test";
import type { Signal } from "./types";
import { presentBottleIdentity, presentSignal, signalAccessibilityLabel, signalFeedCardAppearance, signalCardStatusLabel, signalMemberTagLabel, signalReporterAttribution } from "./presentation";

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

test("store titles omit a duplicated structured address without losing detail", () => {
  const presented = presentSignal(signal({ location: { scope: "exact_store", state: "TX", store: { name: "WB Liquors #86, 5610 N Desert Blvd, B-4", address: "5610 N Desert Blvd, B-4", city: "El Paso", state: "TX" } } }));
  assert.equal(presented.storeName, "WB Liquors #86");
  assert.match(presented.address, /5610 N Desert Blvd, B-4/);
  assert.equal(presentSignal(signal({ location: { scope: "exact_store", state: "TX", store: { name: "Liquors, 86", address: "5610 N Desert Blvd", state: "TX" } } })).storeName, "Liquors, 86");
});

test("Intel inventory counts use explicit bottle grammar", () => {
  assert.equal(presentSignal(signal({ availability: { status: "reported", quantityLabel: "1" } })).quantity, "1 bottle");
  assert.equal(presentSignal(signal({ availability: { status: "reported", quantityLabel: "2 bottles" } })).quantity, "2 bottles");
  assert.equal(presentSignal(signal({ availability: { status: "reported", quantity: 3 } })).quantity, "3 bottles");
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

test("Community postings keep the chosen display name separate from the immutable member tag", () => {
  const community = signal({
    id: "member:test",
    source: { type: "member", label: "Member #184", actor: { kind: "member", number: 184, label: "Member #184", displayName: "Oak Street Scout" } },
  });
  const observedAt = new Date("2026-08-23T12:00:00.000Z");
  assert.equal(signalReporterAttribution(community), "Reported by Oak Street Scout");
  assert.equal(signalCardStatusLabel(community, observedAt), "Community report");
  assert.equal(signalMemberTagLabel(community), "Member #184");

  const tagOnly = signal({
    id: "member:tag-only",
    source: { type: "member", label: "Member #184", actor: { kind: "member", number: 184, label: "Member #184" } },
  });
  assert.equal(signalReporterAttribution(tagOnly), "", "the numbered tag must not be substituted as a display name");
  assert.equal(signalMemberTagLabel(tagOnly), "Member #184");
  const staleAt = new Date("2026-08-27T12:00:00.000Z");
  assert.equal(signalCardStatusLabel(tagOnly, staleAt), "Availability unconfirmed");
  assert.match(signalAccessibilityLabel(tagOnly, staleAt), /Availability unconfirmed, Member #184/);
});

test("bottle identity separates only explicit style and volume suffixes for editorial cards", () => {
  assert.deepEqual(presentBottleIdentity("Blade and Bow Kentucky Straight Bourbon Whiskey 750ml"), {
    title: "Blade and Bow",
    subtitle: "Kentucky Straight Bourbon Whiskey · 750ml",
  });
  assert.deepEqual(presentBottleIdentity("E.H. Taylor Small Batch Bottled in Bond"), {
    title: "E.H. Taylor",
    subtitle: "Small Batch Bottled in Bond",
  });
  assert.deepEqual(presentBottleIdentity("Penelope Bourbon Private Select 9 Year"), {
    title: "Penelope Bourbon Private Select 9 Year",
    subtitle: "",
  });
});

test("card appearance keeps neutral editorial surfaces and uses rarity only as an accent", () => {
  const intel = signalFeedCardAppearance(signal());
  const community = signalFeedCardAppearance(signal({ source: { type: "member", label: "Member #184" } }));
  const allocated = signalFeedCardAppearance(signal({ bottle: { name: "Rare Bottle", rarity: "allocated" } }));
  const unicorn = signalFeedCardAppearance(signal({ bottle: { name: "Rare Bottle", rarity: "unicorn" } }));

  assert.equal("sourceLabel" in intel, false);
  assert.equal(intel.rarityLabel, "LIMITED");
  assert.equal(community.rarityLabel, "LIMITED");
  assert.equal(intel.surface, community.surface);
  assert.equal(intel.surface, allocated.surface);
  assert.equal(intel.surface, unicorn.surface);
  assert.notEqual(intel.accent, allocated.accent);
  assert.notEqual(allocated.accent, unicorn.accent);
});
