import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const registration = readFileSync(new URL("./push-registration.ts", import.meta.url), "utf8");
const pushRegistration = registration;
const rootLayout = readFileSync(new URL("../../app/_layout.tsx", import.meta.url), "utf8");
const tabsIndex = readFileSync(new URL("../../app/(app)/(tabs)/index.tsx", import.meta.url), "utf8");
const responseHandler = readFileSync(new URL("./PushResponseHandler.tsx", import.meta.url), "utf8");
const startupBoundary = readFileSync(new URL("../startup/StartupErrorBoundary.tsx", import.meta.url), "utf8");

test("enabled push registration refreshes its token and listens for token rotation", () => {
  assert.match(registration, /PUSH_ENABLED_KEY/);
  assert.match(registration, /refreshRadarPushIfEnabled/);
  assert.match(registration, /addPushTokenListener/);
  assert.match(registration, /registerPushDevice/);
  assert.match(registration, /PENDING_PUSH_REVOCATION_KEY/);
  assert.match(registration, /flushPendingPushRevocation/);
});

test("push maintenance is deferred until the authenticated app mounts", () => {
  assert.doesNotMatch(rootLayout, /configureRadarNotifications|flushPendingPushRevocation/);
  assert.match(tabsIndex, /<PushMaintenance \/>/);
  assert.match(responseHandler, /flushPendingPushRevocation\(\)\.catch\(\(\) => false\)/);
});

test("notification native setup is deferred and guarded instead of running at module load", () => {
  assert.match(responseHandler, /configureRadarNotifications/);
  assert.match(pushRegistration, /export function configureRadarNotifications/);
  assert.doesNotMatch(pushRegistration, /^Notifications\.setNotificationHandler\(/m);
});

test("root boot is protected by a visible startup error boundary that preserves the error detail", () => {
  assert.match(rootLayout, /StartupErrorBoundary/);
  assert.match(startupBoundary, /Try again/);
  assert.match(startupBoundary, /componentDidCatch/);
  assert.match(startupBoundary, /this\.state\.error\.message/);
});

test("root notification responses use the safe explicit Radar Matches route", () => {
  assert.match(responseHandler, /createPendingPushNavigation/);
  assert.match(responseHandler, /queue\.current\.take\(isLoaded/);
  assert.match(responseHandler, /router\.push\(route\)/);
  assert.match(responseHandler, /typeof getLastResponse === "function"/);
  assert.match(responseHandler, /typeof clearLastResponse === "function"/);
  assert.doesNotMatch(responseHandler, /router\.push\("\/\(app\)\/\(tabs\)\/radar"\)/);
});

test("push response handling is deferred until the authenticated navigator mounts", () => {
  assert.doesNotMatch(rootLayout, /<PushResponseHandler \/>/);
  assert.match(tabsIndex, /<PushResponseHandler \/>/);
});
