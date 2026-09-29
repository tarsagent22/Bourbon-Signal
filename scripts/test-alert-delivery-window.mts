import assert from "node:assert/strict";
import test from "node:test";
import * as windowModule from "../src/lib/alert-delivery-window.ts";

const {
  alertDeliveryWindowStatus,
  isWithinMemberAlertDeliveryWindow,
  normalizeAlertDeliveryTimeZone,
} = ((windowModule as { default?: unknown }).default || windowModule) as typeof import("../src/lib/alert-delivery-window.ts");

const OPEN = 8;
const CLOSE = 20;

test("opens at 8:00 AM and closes at 8:00 PM in the member IANA timezone", () => {
  assert.equal(isWithinMemberAlertDeliveryWindow("2026-09-28T11:59:59.999Z", "America/New_York", OPEN, CLOSE), false);
  assert.equal(isWithinMemberAlertDeliveryWindow("2026-09-28T12:00:00.000Z", "America/New_York", OPEN, CLOSE), true);
  assert.equal(isWithinMemberAlertDeliveryWindow("2026-09-28T23:59:59.999Z", "America/New_York", OPEN, CLOSE), true);
  assert.equal(isWithinMemberAlertDeliveryWindow("2026-09-29T00:00:00.000Z", "America/New_York", OPEN, CLOSE), false);
});

test("evaluates the same UTC instant independently for each member timezone", () => {
  const at = "2026-09-28T15:00:00.000Z";
  assert.equal(isWithinMemberAlertDeliveryWindow(at, "America/New_York", OPEN, CLOSE), true);
  assert.equal(isWithinMemberAlertDeliveryWindow(at, "Pacific/Honolulu", OPEN, CLOSE), false);
});

test("uses daylight-saving-aware local time", () => {
  assert.equal(isWithinMemberAlertDeliveryWindow("2026-11-01T12:59:59.999Z", "America/New_York", OPEN, CLOSE), false);
  assert.equal(isWithinMemberAlertDeliveryWindow("2026-11-01T13:00:00.000Z", "America/New_York", OPEN, CLOSE), true);
});

test("fails closed for missing, malformed, or non-IANA member timezones", () => {
  assert.equal(normalizeAlertDeliveryTimeZone(undefined), "");
  assert.equal(normalizeAlertDeliveryTimeZone("EST"), "");
  assert.equal(normalizeAlertDeliveryTimeZone("Not/AZone"), "");
  assert.deepEqual(alertDeliveryWindowStatus("2026-09-28T16:00:00.000Z", ""), {
    open: false,
    reason: "missing_time_zone",
  });
});

test("reports outside-hours separately from an unavailable timezone", () => {
  assert.deepEqual(alertDeliveryWindowStatus("2026-09-28T11:30:00.000Z", "America/New_York"), {
    open: false,
    reason: "outside_delivery_hours",
    localHour: 7,
  });
  assert.deepEqual(alertDeliveryWindowStatus("2026-09-28T12:30:00.000Z", "America/New_York"), {
    open: true,
    reason: "open",
    localHour: 8,
  });
});
