import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const registration = readFileSync(new URL("./push-registration.ts", import.meta.url), "utf8");
const pushRegistration = registration;
const rootLayout = readFileSync(new URL("../../app/_layout.tsx", import.meta.url), "utf8");
const startupBoundary = readFileSync(new URL("../startup/StartupErrorBoundary.tsx", import.meta.url), "utf8");

test("enabled push registration refreshes its token and listens for token rotation", () => {
  assert.match(registration, /PUSH_ENABLED_KEY/);
  assert.match(registration, /refreshRadarPushIfEnabled/);
  assert.match(registration, /addPushTokenListener/);
  assert.match(registration, /registerPushDevice/);
  assert.match(registration, /PENDING_PUSH_REVOCATION_KEY/);
  assert.match(registration, /flushPendingPushRevocation/);
});

test("root retries a durable offline-logout revocation intent without an unhandled boot rejection", () => {
  assert.match(rootLayout, /StartupMaintenance/);
  assert.match(rootLayout, /flushPendingPushRevocation\(\)\.catch\(\(\) => false\)/);
  assert.doesNotMatch(rootLayout, /useEffect\(\(\) => \{ void flushPendingPushRevocation\(\); \}, \[\]\)/);
});

test("notification native setup is deferred and guarded instead of running at module load", () => {
  assert.match(rootLayout, /configureRadarNotifications/);
  assert.match(pushRegistration, /export function configureRadarNotifications/);
  assert.doesNotMatch(pushRegistration, /^Notifications\.setNotificationHandler\(/m);
});

test("root boot is protected by a visible startup error boundary", () => {
  assert.match(rootLayout, /StartupErrorBoundary/);
  assert.match(startupBoundary, /Try again/);
  assert.match(startupBoundary, /componentDidCatch/);
});

test("root notification responses use the safe explicit Radar Matches route", () => {
  assert.match(rootLayout, /createPendingPushNavigation/);
  assert.match(rootLayout, /queue.current.take\(isLoaded/);
  assert.match(rootLayout, /router\.push\(route\)/);
  assert.doesNotMatch(rootLayout, /router\.push\("\/\(app\)\/\(tabs\)\/radar"\)/);
});
