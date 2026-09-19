import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MobileOnboardingValidationError,
  prepareMobileOnboarding,
} from "../src/lib/mobile-onboarding.ts";

test("mobile onboarding validates and prepares an authenticated Free profile without enabling alerts", () => {
  const prepared = prepareMobileOnboarding({
    displayName: "  Oak   Street  ",
    age21Affirmed: true,
    homeState: " nc ",
  }, "2026-09-13T20:30:00.000Z");

  assert.deepEqual(prepared, {
    displayName: "Oak Street",
    publicMetadata: {
      communityDisplayName: "Oak Street",
      memberProfile: {
        homeState: "NC",
        homeStateSelectedAt: "2026-09-13T20:30:00.000Z",
      },
    },
    privateMetadata: {
      mobileOnboarding: {
        version: 1,
        age21AffirmedAt: "2026-09-13T20:30:00.000Z",
        completedAt: "2026-09-13T20:30:00.000Z",
      },
    },
  });
  assert.equal("monitoringScopes" in prepared.publicMetadata, false);
  assert.equal("notificationPreferences" in prepared.publicMetadata, false);
});

test("mobile onboarding refuses missing age affirmation, invalid states, and misleading display names", () => {
  for (const input of [
    { displayName: "Oak Street", age21Affirmed: false, homeState: "NC" },
    { displayName: "Oak Street", age21Affirmed: true, homeState: "XX" },
    { displayName: "Bourbon Signal Support", age21Affirmed: true, homeState: "NC" },
  ]) {
    assert.throws(
      () => prepareMobileOnboarding(input, "2026-09-13T20:30:00.000Z"),
      MobileOnboardingValidationError,
    );
  }
});

test("mobile onboarding exposes a server-authoritative resumable completion status", () => {
  const route = readFileSync(new URL("../src/app/api/v1/me/onboarding/route.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("../apps/mobile/src/api/client.ts", import.meta.url), "utf8");
  assert.match(route, /export async function GET/);
  assert.match(route, /mobileOnboarding/);
  assert.match(route, /completedAt/);
  assert.match(route, /completed:\s*onboardingCompleted/);
  assert.match(client, /getMobileOnboardingStatus/);
});
