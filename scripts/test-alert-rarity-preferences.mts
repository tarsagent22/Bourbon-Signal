import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import notificationPreferencesModule from "../src/lib/notification-preferences.ts";
import alertDeliveryModule from "../src/lib/alert-delivery.ts";
import alertDedupeModule from "../src/lib/alert-dedupe.ts";

const { alertRarityIsSelected, applyNotificationPreferencesPatch, getDefaultNotificationPreferences } = notificationPreferencesModule;
const { candidateToMemberAlert } = alertDeliveryModule;
const { stableUnderlyingAlertKey } = alertDedupeModule;

const defaults = getDefaultNotificationPreferences();
assert.deepEqual(defaults.rarityTiers, ["unicorn", "allocated", "limited"]);
const saved = applyNotificationPreferencesPatch({
  existing: defaults,
  requested: { rarityTiers: ["unicorn", "allocated"] },
  now: "2026-08-25T00:00:00.000Z",
});
assert.deepEqual(saved.metadataPatch.rarityTiers, ["unicorn", "allocated"]);
assert.equal(alertRarityIsSelected("limited", saved.preferences.rarityTiers), false);
assert.equal(alertRarityIsSelected("allocated", saved.preferences.rarityTiers), true);

const canonicalCandidate = {
  id: "candidate-1",
  dedupeKey: "candidate-1",
  matchKey: "store-1:bottle-1",
  bottle: "Test Bottle",
  state: "NC",
  tier: "highly_allocated",
  signalAt: "2026-08-25T00:00:00.000Z",
};
assert.equal(alertRarityIsSelected(canonicalCandidate.tier, ["unicorn"]), true);
assert.equal(candidateToMemberAlert("user-1", canonicalCandidate, "2026-08-25T00:01:00.000Z").rarityTier, "unicorn");
assert.equal(
  stableUnderlyingAlertKey(canonicalCandidate),
  stableUnderlyingAlertKey({ ...canonicalCandidate, selectedRarityTiers: ["limited"] }),
  "recipient rarity preferences never enter stable child identity",
);

const delivery = readFileSync(new URL("../src/lib/alert-delivery.ts", import.meta.url), "utf8");
const alertsRoute = readFileSync(new URL("../src/app/api/alerts/route.ts", import.meta.url), "utf8");
const website = readFileSync(new URL("../src/app/dashboard/page.tsx", import.meta.url), "utf8");
const mobile = readFileSync(new URL("../apps/mobile/app/(app)/(tabs)/radar.tsx", import.meta.url), "utf8");
assert.match(delivery, /alertRarityIsSelected\(candidate\.tier \?\? candidate\.rarityTier, notificationPrefs\.rarityTiers\)/);
assert.match(alertsRoute, /Candidate sync moved to the protected alert delivery worker/);
assert.match(website, /Bottle rarity/);
assert.match(website, /Radar inbox, push, email, and SMS alerts/);
assert.match(mobile, /Bottle rarity/);
assert.match(mobile, /Applies to inbox, push, email, and SMS/);

console.log("Cross-surface alert rarity preference contract passed.");
