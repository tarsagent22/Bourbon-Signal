import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const registration = readFileSync(new URL("./push-registration.ts", import.meta.url), "utf8");
const rootLayout = readFileSync(new URL("../../app/_layout.tsx", import.meta.url), "utf8");

test("enabled push registration refreshes its token and listens for token rotation", () => {
  assert.match(registration, /PUSH_ENABLED_KEY/);
  assert.match(registration, /refreshRadarPushIfEnabled/);
  assert.match(registration, /addPushTokenListener/);
  assert.match(registration, /registerPushDevice/);
});

test("root notification responses use the safe explicit Radar Matches route", () => {
  assert.match(rootLayout, /radarRouteForNotificationData/);
  assert.match(rootLayout, /router\.push\(route\)/);
  assert.doesNotMatch(rootLayout, /router\.push\("\/\(app\)\/\(tabs\)\/radar"\)/);
});
