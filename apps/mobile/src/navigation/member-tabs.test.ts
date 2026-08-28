import assert from "node:assert/strict";
import test from "node:test";
import { MEMBER_TABS, ownedFeatureHome } from "./member-tabs";

test("defines the five native-only member destinations in field order", () => {
  assert.deepEqual(MEMBER_TABS.map((tab) => tab.key), ["signals", "radar", "post", "cellar", "hq"]);
  assert.deepEqual(MEMBER_TABS.map((tab) => tab.route), ["index", "radar", "post", "cellar", "hq"]);
});

test("gives each member capability one primary home", () => {
  const allOwnedFeatures = MEMBER_TABS.flatMap((tab) => tab.owns);
  assert.equal(new Set(allOwnedFeatures).size, allOwnedFeatures.length);
  assert.equal(ownedFeatureHome("signal_feed"), "signals");
  assert.equal(ownedFeatureHome("watched_bottles"), "radar");
  assert.equal(ownedFeatureHome("sighting_composer"), "post");
  assert.equal(ownedFeatureHome("collection"), "cellar");
  assert.equal(ownedFeatureHome("signal_points"), "hq");
});

test("keeps the legacy HQ route while visibly naming it Account", () => {
  const account = MEMBER_TABS.find((tab) => tab.route === "hq");
  assert.equal(account?.key, "hq");
  assert.equal(account?.label, "Account");
  assert.equal(account?.icon, "account-circle-outline");
});

test("uses a bottle, not wine glassware, for Cellar", () => {
  const cellar = MEMBER_TABS.find((tab) => tab.key === "cellar");
  assert.match(cellar?.icon || "", /bottle/i);
  assert.doesNotMatch(cellar?.icon || "", /wine|glass/i);
});
