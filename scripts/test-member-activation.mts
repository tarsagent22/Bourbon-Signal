import assert from "node:assert/strict";
import {
  buildActivationChecklist,
  buildAlertEmptyState,
  deriveMemberActivation,
  mergeActivationMilestones,
} from "../src/lib/member-activation.ts";

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

assert.deepEqual(buildActivationChecklist(["area", "channel"], false), {
  complete: false,
  completedCount: 1,
  total: 3,
  nextHref: "/dashboard?section=alerts",
  items: [
    { key: "area", label: "Save an alert area", complete: false },
    { key: "watchlist", label: "Choose what to watch", complete: true },
    { key: "channel", label: "Enable an alert channel", complete: false },
  ],
});
assert.equal(buildActivationChecklist([], true).completedCount, 3);

assert.deepEqual(buildAlertEmptyState({ tab: "all", activationComplete: false, loadFailed: false }), {
  title: "Finish alert setup",
  body: "Save an area, choose what to watch, and turn on a notification channel before matches can reach you.",
  actionLabel: "Finish setup",
  actionHref: "/dashboard?section=alerts",
});
assert.deepEqual(buildAlertEmptyState({ tab: "unread", activationComplete: true, loadFailed: false }), {
  title: "You’re caught up",
  body: "Your signal is active. New matches in your saved area will appear here.",
  actionLabel: "Review alert setup",
  actionHref: "/dashboard?section=alerts",
});
assert.deepEqual(buildAlertEmptyState({ tab: "all", activationComplete: true, loadFailed: false }), {
  title: "No current alerts",
  body: "Your signal is active. Archived alerts remain available under Archived.",
  actionLabel: "Review alert setup",
  actionHref: "/dashboard?section=alerts",
});
assert.equal(buildAlertEmptyState({ tab: "archived", activationComplete: true, loadFailed: false }).title, "No archived alerts");
assert.equal(buildAlertEmptyState({ tab: "all", activationComplete: null, loadFailed: false }).title, "Setup status unavailable");
assert.equal(buildAlertEmptyState({ tab: "all", activationComplete: null, loadFailed: true }).title, "Alerts unavailable");
console.log("Member activation contract passed.");
