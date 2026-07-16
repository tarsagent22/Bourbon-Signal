import assert from "node:assert/strict";
import { buildSuppliedPreferenceMetadataPatch } from "../src/lib/user-preference-patch.ts";

const optedInNotifications = {
  onSite: { enabled: true },
  email: { enabled: true },
  sms: { enabled: true, phone: "+19195550188", verified: true },
  sightings: { enabled: true },
  weeklyIntelligence: { enabled: true },
};
const concurrentOptOut = {
  onSite: { enabled: true },
  email: { enabled: false },
  sms: { enabled: false, phone: "+19195550188", verified: true },
  sightings: { enabled: true },
  weeklyIntelligence: { enabled: false, unsubscribedAt: "2026-07-16T01:00:00.000Z" },
};
const normalizedValues = {
  areaPreferences: { states: ["NC"] },
  notificationPreferences: optedInNotifications,
  alertMode: "anything_notable",
  bottleAlertPreferences: { bottleNames: [], bottleKeys: [] },
  collectionPreferences: { bottles: [] },
  radarPreferences: { followedReleases: ["release-2"] },
  sightingsPreferences: { submittedSightings: [], signalReports: [], sightingVotes: [] },
};

const radarPatch = buildSuppliedPreferenceMetadataPatch(
  { radarPreferences: { followedReleases: ["release-2"] } },
  normalizedValues,
);
assert.deepEqual(radarPatch, { radarPreferences: normalizedValues.radarPreferences });

const metadataAfterConcurrentWrite = {
  notificationPreferences: concurrentOptOut,
  radarPreferences: { followedReleases: ["release-1"] },
};
const savedMetadata = { ...metadataAfterConcurrentWrite, ...radarPatch };
assert.equal(savedMetadata.notificationPreferences.email.enabled, false);
assert.equal(savedMetadata.notificationPreferences.sms.enabled, false);
assert.equal(savedMetadata.notificationPreferences.weeklyIntelligence.enabled, false);
assert.deepEqual(savedMetadata.radarPreferences.followedReleases, ["release-2"]);

assert.deepEqual(
  buildSuppliedPreferenceMetadataPatch({ notificationPreferences: null }, normalizedValues),
  { notificationPreferences: optedInNotifications },
  "an explicitly supplied top-level field is normalized and patched",
);
assert.deepEqual(
  buildSuppliedPreferenceMetadataPatch({ radarPreferences: undefined, ignored: true }, normalizedValues),
  {},
  "undefined and unapproved fields are never patched",
);

console.log("User preference supplied-field patch contract passed.");
