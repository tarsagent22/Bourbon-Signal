import assert from "node:assert/strict";
import { buildSuppliedPreferenceMetadataPatch } from "../src/lib/user-preference-patch.ts";
import {
  applyMemberProfilePreferencePatch,
  MemberProfilePreferenceValidationError,
  normalizeMemberProfilePreferences,
} from "../src/lib/member-profile-preferences.ts";

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
  memberProfile: { homeState: "AR", homeStateSelectedAt: "2026-07-28T21:00:00.000Z" },
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

assert.deepEqual(
  buildSuppliedPreferenceMetadataPatch({ memberProfile: { homeState: "AR" } }, normalizedValues),
  { memberProfile: normalizedValues.memberProfile },
  "the durable home-state profile is independently patchable",
);
assert.deepEqual(
  normalizeMemberProfilePreferences({ homeState: " ar ", homeStateSelectedAt: "2026-07-01T00:00:00.000Z" }),
  { homeState: "AR", homeStateSelectedAt: "2026-07-01T00:00:00.000Z" },
);
assert.deepEqual(
  normalizeMemberProfilePreferences({ homeState: "XX", homeStateSelectedAt: "not-a-date" }),
  { homeState: null, homeStateSelectedAt: null },
  "unsupported states and invalid timestamps fail closed",
);
const firstHomeState = applyMemberProfilePreferencePatch(
  null,
  { homeState: " dc ", homeStateSelectedAt: "2000-01-01T00:00:00.000Z" },
  "2026-07-28T22:00:00.000Z",
);
assert.deepEqual(
  firstHomeState,
  { homeState: "DC", homeStateSelectedAt: "2026-07-28T22:00:00.000Z" },
  "the server timestamp wins over client-supplied profile metadata",
);
assert.deepEqual(
  applyMemberProfilePreferencePatch(firstHomeState, { homeState: "DC" }, "2026-07-29T00:00:00.000Z"),
  firstHomeState,
  "saving the same home state preserves the original selection timestamp",
);
assert.deepEqual(
  applyMemberProfilePreferencePatch(firstHomeState, { homeState: "AR" }, "2026-07-29T00:00:00.000Z"),
  { homeState: "AR", homeStateSelectedAt: "2026-07-29T00:00:00.000Z" },
  "changing home state records a new server timestamp",
);
assert.throws(
  () => applyMemberProfilePreferencePatch(firstHomeState, { homeState: "XX" }, "2026-07-29T00:00:00.000Z"),
  MemberProfilePreferenceValidationError,
);

console.log("User preference supplied-field patch contract passed.");
