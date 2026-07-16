import assert from "node:assert/strict";
import { deriveMemberActivation, mergeActivationMilestones } from "../src/lib/member-activation.ts";

const base = { tier: "standard" as const, areas: [], bottleKeys: [], alertMode: "anything_notable" as const, channels: { onSite: false, email: false, sms: false } };
assert.deepEqual(deriveMemberActivation({ ...base, tier: "free" }), { eligible: false, complete: false, remaining: [] });
assert.deepEqual(deriveMemberActivation(base), { eligible: true, complete: false, remaining: ["area", "channel"] });
assert.deepEqual(deriveMemberActivation({ ...base, areas: ["NC"], channels: { ...base.channels, onSite: true } }), { eligible: true, complete: true, remaining: [] });
assert.deepEqual(deriveMemberActivation({ ...base, areas: ["SC"], alertMode: "specific_bottles", bottleKeys: [], channels: { ...base.channels, email: true } }).remaining, ["watchlist"]);
const existing = { firstTouch: { surface: "pricing" }, activation: { alert_area_saved: "2026-07-01T00:00:00.000Z" } };
assert.deepEqual(mergeActivationMilestones(existing, ["alert_area_saved", "paid_activation_completed"], "2026-07-02T00:00:00.000Z"), {
  firstTouch: { surface: "pricing" },
  activation: { alert_area_saved: "2026-07-01T00:00:00.000Z", paid_activation_completed: "2026-07-02T00:00:00.000Z" },
});
console.log("Member activation contract passed.");
