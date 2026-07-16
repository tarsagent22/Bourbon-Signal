import assert from "node:assert/strict";
import { firstAlertCreatedMetadata } from "../src/lib/member-activation.ts";

const metadata = { activation: { paid_activation_completed: "2026-07-01T00:00:00.000Z" } };
assert.deepEqual(firstAlertCreatedMetadata(metadata, false, "2026-07-15T12:00:00.000Z"), metadata);
assert.deepEqual(firstAlertCreatedMetadata(metadata, true, "2026-07-15T12:00:00.000Z"), {
  activation: {
    paid_activation_completed: "2026-07-01T00:00:00.000Z",
    first_alert_created: "2026-07-15T12:00:00.000Z",
  },
});
assert.deepEqual(firstAlertCreatedMetadata({ activation: { first_alert_created: "2026-07-10T12:00:00.000Z" } }, true, "2026-07-15T12:00:00.000Z"), {
  activation: { first_alert_created: "2026-07-10T12:00:00.000Z" },
});
console.log("First on-site alert milestone contract passed.");
