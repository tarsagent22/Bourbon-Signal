import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { persistPushDeviceChange, pushDeviceErrorBody } from "../src/lib/push-device-registration.ts";

test("push persistence writes the private device before the narrow public projection", async () => {
  const writes: string[] = [];
  const result = await persistPushDeviceChange({
    currentDevices: [],
    action: "register",
    device: { deviceId: "phone-1", expoPushToken: "ExponentPushToken[aaaaaaaaaaaaaaaaaaaa]", platform: "ios" },
    now: "2026-08-24T12:00:00.000Z",
    writePrivateDevices: async (_devices, projection) => { writes.push(`private:${projection.status}`); },
    writePublicPushPreference: async () => { writes.push("public"); throw new Error("oversized unrelated metadata"); },
    writeProjectionState: async (projection) => { writes.push(`private:${projection.status}`); },
  });
  assert.deepEqual(writes, ["private:pending", "public"]);
  assert.equal(result.devices[0]?.deviceId, "phone-1");
  assert.equal(result.preferenceProjection, "deferred");
});

test("push failures expose a safe structured code and request ID", () => {
  assert.deepEqual(pushDeviceErrorBody("PUSH_DEVICE_WRITE_FAILED", "This device could not be saved.", "request-123", true), {
    contractVersion: "bourbon-signal/api-error@1",
    error: { code: "PUSH_DEVICE_WRITE_FAILED", message: "This device could not be saved.", requestId: "request-123", retryable: true },
  });
});

test("successful push projection clears its durable pending state", async () => {
  const writes: string[] = [];
  const result = await persistPushDeviceChange({
    currentDevices: [],
    action: "register",
    device: { deviceId: "phone-2", expoPushToken: "ExponentPushToken[bbbbbbbbbbbbbbbbbbbb]", platform: "ios" },
    now: "2026-08-24T12:00:00.000Z",
    writePrivateDevices: async (_devices, projection) => { writes.push(`private:${projection.status}`); },
    writePublicPushPreference: async () => { writes.push("public"); },
    writeProjectionState: async (projection) => { writes.push(`private:${projection.status}`); },
  });
  assert.deepEqual(writes, ["private:pending", "public", "private:saved"]);
  assert.equal(result.preferenceProjection, "saved");
});

test("referral, push, geography, and native UI source contracts are additive", () => {
  const referral = readFileSync(new URL("../src/app/api/referrals/me/route.ts", import.meta.url), "utf8");
  assert.match(referral, /referralPoints:\s*summary\.referralPoints/);
  const push = readFileSync(new URL("../src/app/api/v1/me/push-devices/route.ts", import.meta.url), "utf8");
  assert.match(push, /requestId/);
  assert.match(push, /PUSH_(?:PROFILE_LOAD|ENTITLEMENT|VALIDATION|DEVICE_WRITE|PREFERENCE_WRITE)_FAILED/);
  assert.match(push, /publicMetadata:\s*\{ notificationPreferences:\s*\{ push:\s*\{ enabled \} \} \}/);
  assert.doesNotMatch(push, /\.\.\.notificationPreferences/);
  const radar = readFileSync(new URL("../apps/mobile/app/(app)/(tabs)/radar.tsx", import.meta.url), "utf8");
  const radarHelpers = readFileSync(new URL("../apps/mobile/src/radar/radar-preferences.ts", import.meta.url), "utf8");
  const geography = readFileSync(new URL("../src/app/api/v1/geography/route.ts", import.meta.url), "utf8");
  const mobileClient = readFileSync(new URL("../apps/mobile/src/api/client.ts", import.meta.url), "utf8");
  const alertsApi = readFileSync(new URL("../src/app/api/alerts/route.ts", import.meta.url), "utf8");
  const delivery = readFileSync(new URL("../src/lib/alert-delivery.ts", import.meta.url), "utf8");
  const sightingsRepository = readFileSync(new URL("../src/lib/community-sightings-repository.ts", import.meta.url), "utf8");
  assert.match(radar, /\bModal\b/);
  assert.match(radar, /KeyboardAvoidingView/);
  assert.match(radar, /Share\.share/);
  assert.match(radar, /Bourbon Signal sources are still expanding in this area\. Invite friends to boost community activity\./);
  assert.match(radar, /radarMonitoringSummary/);
  assert.match(radarHelpers, /state\$\{states === 1[^\n]+· \$\{locals\} local filter/);
  assert.doesNotMatch(radar, /\$\{radarAreaCount\([^)]*\)\} active/);
  assert.doesNotMatch(radar, /Alert\.alert/);
  assert.match(geography, /await auth\(\)/);
  assert.match(geography, /engine:\s*\{ status:/);
  assert.match(geography, /community:\s*\{ active:/);
  assert.doesNotMatch(geography, /reporterUserId|reporterDisplayName/);
  assert.match(mobileClient, /searchMonitoringGeography/);
  assert.match(mobileClient, /getReferralSummary/);
  assert.match(alertsApi, /candidateAlerts = \(await readCandidates\(\)\)\.filter\(\(candidate\) => asString\(candidate\.sourceType\) !== "community"\)/);
  assert.match(alertsApi, /filter\(\(alert\) => alert\.sourceType !== "community" \|\| canReadCommunityAlerts\)/);
  assert.match(alertsApi, /body\.action !== "mark_all_read"[\s\S]*Alert not found/);
  assert.match(alertsApi, /const userAlerts = nextAlerts[\s\S]*\.filter\(canReadAlert\)/);
  assert.match(alertsApi, /entitlements\.canReceiveSightingsAlerts && notificationPrefs\.sightings\.enabled/);
  assert.match(delivery, /snapshotSafety\.safe \? allCandidates : allCandidates\.filter\(\(candidate\) => asString\(candidate\.sourceType\) === "community"\)/);
  assert.match(delivery, /const community = candidates\.filter[\s\S]*sourceType\) === "community"/);
  assert.match(delivery, /entitlements\.canReceiveSightingsAlerts && notificationPrefs\.sightings\.enabled/);
  assert.match(delivery, /const state = geographyState\(rawState\)\?\.state \|\| normalizeStateCodeParam\(rawState\)/);
  assert.match(delivery, /listRecentAlertSightings\(since\)/);
  assert.doesNotMatch(delivery, /listSightings\(1000\)/);
  assert.match(delivery, /canonicalCommunityStoreKey\(state, id\)/);
  assert.match(delivery, /pushPreferenceProjectionAllowsDelivery\(privateMetadata\.pushPreferenceProjection\)/);
  assert.match(sightingsRepository, /COUNT\(\*\)::int AS count[\s\S]*GROUP BY 1, 2, 3, 4, 5, 6/);
  assert.match(sightingsRepository, /COALESCE\(payload->'reviewState'->>'needsStoreReview', 'false'\) <> 'true'/);
  assert.match(sightingsRepository, /COALESCE\(payload->'rewardState'->>'rejectedAt', ''\) = ''/);
  assert.doesNotMatch(geography, /listSightings\(1000\)/);
  assert.match(geography, /canonicalCommunityStoreMatches\(canonical, row\)/);
});
