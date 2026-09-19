import assert from "node:assert/strict";
import test from "node:test";
import { createPendingPushNavigation, radarRouteForNotificationData, signalRouteForRequestedAlert } from "./push-navigation";

test("Radar notification taps always open the explicit Matches view", () => {
  assert.deepEqual(radarRouteForNotificationData({ screen: "radar", alertId: "alert_123" }), {
    pathname: "/(app)/(tabs)/radar",
    params: { section: "matches", alert: "alert_123" },
  });
  assert.equal(radarRouteForNotificationData({ screen: "radar" }), null);
  assert.equal(radarRouteForNotificationData({ screen: "radar", alertId: "javascript:bad" }), null);
  assert.equal(radarRouteForNotificationData({ screen: "account", alertId: "alert_123" }), null);
});

test("notification queue preserves the user-bound alert lookup token while deduping OS responses", () => {
  const queue = createPendingPushNavigation();
  queue.receive("os-1", { screen: "radar", alertId: "alert_123" });
  assert.deepEqual(queue.take(true, true), {
    pathname: "/(app)/(tabs)/radar",
    params: { section: "matches", alert: "alert_123", request: "os-1" },
  });
});

test("the authenticated member alert resolves to the exact qualifying Signal", () => {
  assert.deepEqual(signalRouteForRequestedAlert([
    { id: "alert_123", signalId: "trusted_source:signal-9" },
  ], "alert_123"), {
    pathname: "/(app)/signal/[id]",
    params: { id: "trusted_source:signal-9" },
  });
  assert.equal(signalRouteForRequestedAlert([{ id: "alert_123" }], "alert_123"), null);
  assert.equal(signalRouteForRequestedAlert([{ id: "alert_other", signalId: "trusted_source:signal-9" }], "alert_123"), null);
});
