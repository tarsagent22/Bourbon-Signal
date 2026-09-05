import assert from "node:assert/strict";
import test from "node:test";
import { radarPushState } from "./radar-push-state";

test("push errors, unavailable status, and denied permission override an enabled registration", () => {
  const enabled = { supported: true, enabled: true, registeredDeviceCount: 1, currentDeviceRegistered: true };
  assert.equal(radarPushState({ status: enabled, permission: "granted", preferenceEnabled: true, error: "Registration warning" }).readiness, "Setup needed");
  assert.equal(radarPushState({ status: enabled, permission: "granted", preferenceEnabled: true, statusLoadFailed: true }).action, "retry-status");
  assert.equal(radarPushState({ status: enabled, permission: "denied", preferenceEnabled: true }).action, "settings");
});

test("an explicitly disabled device stays Off even when OS permission remains granted", () => {
  const state = radarPushState({
    status: { supported: true, enabled: false, registeredDeviceCount: 0, currentDeviceRegistered: false },
    permission: "granted",
    preferenceEnabled: false,
  });
  assert.deepEqual({ readiness: state.readiness, action: state.action }, { readiness: "Off", action: "enable" });
});

test("intentional Off stays Off when OS notification permission is denied", () => {
  assert.equal(radarPushState({status: { supported: true, enabled: false, registeredDeviceCount: 0, currentDeviceRegistered: false }, permission: "denied", preferenceEnabled: false}).readiness, "Off");
});

test("failed disable recovery retries disable rather than enabling", () => {
  const state = radarPushState({
    status: { supported: true, enabled: true, registeredDeviceCount: 1, currentDeviceRegistered: true },
    permission: "granted",
    preferenceEnabled: true,
    error: "Push couldn't be turned off.",
    failedAction: "disable",
  });
  assert.deepEqual({ readiness: state.readiness, action: state.action }, { readiness: "Setup needed", action: "retry-disable" });
});
