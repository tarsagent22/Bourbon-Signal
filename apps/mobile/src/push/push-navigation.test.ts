import assert from "node:assert/strict";
import test from "node:test";
import { radarRouteForNotificationData } from "./push-navigation";

test("Radar notification taps always open the explicit Matches view", () => {
  assert.deepEqual(radarRouteForNotificationData({ screen: "radar", alertId: "alert_123" }), {
    pathname: "/(app)/(tabs)/radar",
    params: { section: "matches", request: "alert_123" },
  });
  assert.equal(radarRouteForNotificationData({ screen: "radar", alertId: "javascript:bad" }), null);
  assert.equal(radarRouteForNotificationData({ screen: "account", alertId: "alert_123" }), null);
});
