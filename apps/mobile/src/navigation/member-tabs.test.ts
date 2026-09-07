import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MEMBER_TABS, ownedFeatureHome } from "./member-tabs";

const tabsLayout = readFileSync(new URL("../../app/(app)/(tabs)/_layout.tsx", import.meta.url), "utf8");

test("defines the five native-only member destinations in field order", () => {
  assert.deepEqual(MEMBER_TABS.map((tab) => tab.key), ["home", "radar", "post", "cellar", "hq"]);
  assert.deepEqual(MEMBER_TABS.map((tab) => tab.route), ["index", "radar", "post", "cellar", "hq"]);
  assert.equal(MEMBER_TABS[0]?.label, "Home");
});

test("gives each member capability one primary home", () => {
  const allOwnedFeatures = MEMBER_TABS.flatMap((tab) => tab.owns);
  assert.equal(new Set(allOwnedFeatures).size, allOwnedFeatures.length);
  assert.equal(ownedFeatureHome("signal_feed"), "home");
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

test("uses a bottle, not wine glassware, for My Shelf", () => {
  const cellar = MEMBER_TABS.find((tab) => tab.key === "cellar");
  assert.equal(cellar?.label, "My Shelf");
  assert.match(cellar?.icon || "", /bottle/i);
  assert.doesNotMatch(cellar?.icon || "", /wine|glass/i);
});

test("uses a lifted plain plus glyph for the custom primary Post button", () => {
  const post = MEMBER_TABS.find((tab) => tab.key === "post");
  assert.equal(post?.label, "Post");
  assert.equal(post?.icon, "plus");
  assert.match(tabsLayout, /postIconButton:\s*\{[^}]*marginTop:\s*-18/s);
  assert.match(tabsLayout, /tabBarAccessibilityLabel:\s*"Create a Community Signal"/);
});
