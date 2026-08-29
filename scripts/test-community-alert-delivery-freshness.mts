import assert from "node:assert/strict";
import test from "node:test";
import {
  ALERT_FRESHNESS_HARD_CAP_HOURS,
  COMMUNITY_ALERT_FRESHNESS_HARD_CAP_HOURS,
  alertFreshnessIsDeliverable,
  resolveAlertFreshnessCapHours,
} from "../src/lib/alert-run-safety.ts";

test("trusted-source alerts retain the one-hour hard cap", () => {
  assert.equal(ALERT_FRESHNESS_HARD_CAP_HOURS, 1);
  assert.equal(resolveAlertFreshnessCapHours(2), 1);
  assert.equal(alertFreshnessIsDeliverable(1.01, 2), false);
});

test("community alerts may remain deliverable for the agreed internal two-hour window", () => {
  assert.equal(COMMUNITY_ALERT_FRESHNESS_HARD_CAP_HOURS, 2);
  assert.equal(resolveAlertFreshnessCapHours(2, COMMUNITY_ALERT_FRESHNESS_HARD_CAP_HOURS), 2);
  assert.equal(alertFreshnessIsDeliverable(1.5, 2, COMMUNITY_ALERT_FRESHNESS_HARD_CAP_HOURS), true);
  assert.equal(alertFreshnessIsDeliverable(2.01, 2, COMMUNITY_ALERT_FRESHNESS_HARD_CAP_HOURS), false);
});
