import assert from "node:assert/strict";
import {
  buildMemberWeeklyIntelligence,
  memberWeekKey,
  type MemberWeeklyIntelligenceInput,
} from "../src/lib/member-weekly-intelligence.ts";
import {
  buildMemberWeekDedupeKey,
  buildWeeklyIntelligenceDryRun,
  signWeeklyIntelligenceUnsubscribe,
  verifyWeeklyIntelligenceUnsubscribe,
} from "../src/lib/member-weekly-email.ts";
import {
  applyWeeklyIntelligencePreferenceTransition,
  getDefaultNotificationPreferences,
  normalizeNotificationPreferences,
} from "../src/lib/notification-preferences.ts";

const now = "2026-07-16T14:00:00.000Z";

assert.equal(memberWeekKey(now), "2026-07-13", "member weeks start on Monday UTC");
assert.equal(memberWeekKey("2026-07-19T23:59:59.000Z"), "2026-07-13");
assert.equal(memberWeekKey("2026-07-20T00:00:00.000Z"), "2026-07-20");

const input: MemberWeeklyIntelligenceInput = {
  member: {
    id: "member_123",
    firstName: "Taylor",
    savedAreas: [
      { stateCode: "NC", labels: ["Wake"] },
      { stateCode: "VA", labels: [] },
    ],
    trackedBottles: [
      { key: "weller antique 107", name: "Weller Antique 107" },
      { key: "blanton s single barrel", name: "Blanton's Single Barrel" },
    ],
    alertMode: "specific_bottles",
  },
  now,
  alerts: [
    {
      id: "alert-z",
      dedupeKey: "signal-z",
      bottleName: "Weller Antique 107",
      stateCode: "NC",
      locationLabel: "Wake County ABC - Sandy Fork",
      freshnessHours: 1.5,
      freshnessPolicyHours: 2,
      eligibleForDelivery: true,
      eligibleForEmail: true,
      priority: "major",
      score: 180,
      href: "/dashboard?section=alerts",
    },
    {
      id: "alert-ineligible",
      dedupeKey: "signal-ineligible",
      bottleName: "Weller Antique 107",
      stateCode: "NC",
      locationLabel: "Wake County ABC",
      freshnessHours: 0.25,
      freshnessPolicyHours: 2,
      eligibleForDelivery: false,
      eligibleForEmail: true,
      priority: "major",
      score: 999,
      href: "/dashboard?section=alerts",
    },
    {
      id: "alert-stale",
      dedupeKey: "signal-stale",
      bottleName: "Weller Antique 107",
      stateCode: "NC",
      locationLabel: "Wake County ABC",
      freshnessHours: 4,
      freshnessPolicyHours: 2,
      eligibleForDelivery: true,
      eligibleForEmail: true,
      priority: "major",
      score: 900,
      href: "/dashboard?section=alerts",
    },
    {
      id: "alert-wrong-area",
      dedupeKey: "signal-area",
      bottleName: "Weller Antique 107",
      stateCode: "NC",
      locationLabel: "Mecklenburg County ABC",
      freshnessHours: 1,
      freshnessPolicyHours: 2,
      eligibleForDelivery: true,
      eligibleForEmail: true,
      priority: "major",
      score: 800,
      href: "/dashboard?section=alerts",
    },
    {
      id: "alert-wrong-bottle",
      dedupeKey: "signal-bottle",
      bottleName: "Booker's",
      stateCode: "VA",
      locationLabel: "Richmond ABC",
      freshnessHours: 1,
      freshnessPolicyHours: 2,
      eligibleForDelivery: true,
      eligibleForEmail: true,
      priority: "standard",
      score: 200,
      href: "/dashboard?section=alerts",
    },
  ],
  radar: [
    {
      id: "radar-va",
      title: "Virginia ABC rare whiskey lottery",
      summary: "Entry closes this week.",
      stateCodes: ["VA"],
      bottleKeys: [],
      startDate: "2026-07-12",
      endDate: "2026-07-16",
      href: "/release-radar/lotteries/virginia",
    },
    {
      id: "radar-bottle",
      title: "Weller Antique 107 release watch",
      summary: "Distribution begins soon.",
      stateCodes: ["NATIONWIDE"],
      bottleKeys: ["weller antique 107"],
      startDate: "2026-07-18",
      href: "/release-radar/releases/weller",
    },
    {
      id: "radar-unrelated",
      title: "Kentucky tasting",
      summary: "An unrelated event.",
      stateCodes: ["KY"],
      bottleKeys: [],
      startDate: "2026-07-18",
      href: "/release-radar/events/kentucky",
    },
  ],
  coverage: [
    {
      stateCode: "NC",
      label: "North Carolina",
      status: "stale_useful",
      summary: "Recent useful signal is retained while a source refresh recovers.",
      sourceLabel: "North Carolina ABC + county boards",
      notable: true,
    },
    {
      stateCode: "VA",
      label: "Virginia",
      status: "useful",
      summary: "No material coverage change.",
      sourceLabel: "Virginia ABC",
      notable: false,
    },
    {
      stateCode: "KY",
      label: "Kentucky",
      status: "degraded",
      summary: "Not a saved market.",
      sourceLabel: "Kentucky sources",
      notable: true,
    },
  ],
};

const report = buildMemberWeeklyIntelligence(input);
assert.equal(report.weekKey, "2026-07-13");
assert.equal(report.isEmpty, false);
assert.deepEqual(report.sections.map((section) => section.kind), ["alerts", "radar", "coverage"]);
assert.deepEqual(report.sections[0]?.items.map((item) => item.id), ["alert-z"], "only fresh, eligible, area + watchlist alert matches are included");
assert.deepEqual(report.sections[1]?.items.map((item) => item.id), ["radar-va", "radar-bottle"], "Radar is personalized by saved market or tracked bottle");
assert.deepEqual(report.sections[2]?.items.map((item) => item.id), ["coverage-NC"], "coverage only includes notable saved-market changes");
assert.deepEqual(report.primaryAction, {
  kind: "alerts",
  label: "Review the fresh signal",
  href: "/dashboard?section=alerts",
});
assert.equal(Object.hasOwn(report, "actions"), false, "the report exposes exactly one action, not an action list");

const reordered = buildMemberWeeklyIntelligence({
  ...input,
  alerts: [...input.alerts].reverse(),
  radar: [...input.radar].reverse(),
  coverage: [...input.coverage].reverse(),
});
assert.deepEqual(reordered, report, "composition and ordering are deterministic");

const empty = buildMemberWeeklyIntelligence({
  member: { id: "member_empty", savedAreas: [], trackedBottles: [], alertMode: "specific_bottles" },
  now,
  alerts: input.alerts,
  radar: input.radar,
  coverage: input.coverage,
});
assert.equal(empty.isEmpty, true);
assert.deepEqual(empty.sections, []);
assert.equal(empty.primaryAction, null, "empty weeks may remain silent");

const broad = buildMemberWeeklyIntelligence({
  ...input,
  member: { ...input.member, alertMode: "anything_notable", trackedBottles: [] },
});
assert.ok(broad.sections[0]?.items.some((item) => item.id === "alert-wrong-bottle"), "broad alert mode does not require a watchlist match");

const defaultNotifications = getDefaultNotificationPreferences();
assert.equal(defaultNotifications.weeklyIntelligence.emailEnabled, false, "weekly intelligence is a separate, default-off opt-in");
const normalizedLegacy = normalizeNotificationPreferences({ email: { enabled: true, mode: "all" } });
assert.equal(normalizedLegacy.email.enabled, true);
assert.equal(normalizedLegacy.weeklyIntelligence.emailEnabled, false, "real-time email consent never implies weekly consent");

const optedIn = applyWeeklyIntelligencePreferenceTransition({
  existing: defaultNotifications.weeklyIntelligence,
  requested: { emailEnabled: true },
  now,
});
assert.deepEqual(optedIn, { emailEnabled: true, optedInAt: now, unsubscribedAt: null });
const optedOutAt = "2026-07-17T10:00:00.000Z";
const optedOut = applyWeeklyIntelligencePreferenceTransition({ existing: optedIn, requested: { emailEnabled: false }, now: optedOutAt });
assert.deepEqual(optedOut, { emailEnabled: false, optedInAt: now, unsubscribedAt: optedOutAt });

const weekDedupeKey = buildMemberWeekDedupeKey("member_123", "2026-07-13");
assert.equal(weekDedupeKey, buildMemberWeekDedupeKey("member_123", "2026-07-13"));
assert.notEqual(weekDedupeKey, buildMemberWeekDedupeKey("member_123", "2026-07-20"));

const dryRunBase = {
  memberId: "member_123",
  recipient: "taylor@example.com",
  report,
  preferences: optedIn,
  suppression: { suppressed: false, deliveredMemberWeeks: [] },
};

const wouldSend = buildWeeklyIntelligenceDryRun({ ...dryRunBase, killSwitchActive: false });
assert.equal(wouldSend.status, "would_send");
assert.equal(wouldSend.sendAttempted, false);
assert.equal(wouldSend.liveSendSupported, false, "the feature has no live-send capability");
assert.equal(wouldSend.dedupeKey, weekDedupeKey);

assert.equal(buildWeeklyIntelligenceDryRun({
  ...dryRunBase,
  preferences: { ...optedIn, emailEnabled: false },
  killSwitchActive: false,
}).status, "skipped_not_opted_in");
assert.equal(buildWeeklyIntelligenceDryRun({
  ...dryRunBase,
  preferences: { ...optedIn, unsubscribedAt: optedOutAt },
  killSwitchActive: false,
}).status, "skipped_unsubscribed");
assert.equal(buildWeeklyIntelligenceDryRun({
  ...dryRunBase,
  suppression: { suppressed: true, deliveredMemberWeeks: [] },
  killSwitchActive: false,
}).status, "skipped_suppressed");
assert.equal(buildWeeklyIntelligenceDryRun({
  ...dryRunBase,
  suppression: { suppressed: false, deliveredMemberWeeks: [weekDedupeKey] },
  killSwitchActive: false,
}).status, "skipped_member_week_duplicate");
assert.equal(buildWeeklyIntelligenceDryRun({ ...dryRunBase, report: empty, killSwitchActive: false }).status, "skipped_empty_week");
assert.equal(buildWeeklyIntelligenceDryRun({ ...dryRunBase, killSwitchActive: true }).status, "blocked_kill_switch");

const secret = "test-secret";
const signature = signWeeklyIntelligenceUnsubscribe("member_123", secret);
assert.equal(verifyWeeklyIntelligenceUnsubscribe("member_123", signature, secret), true);
assert.equal(verifyWeeklyIntelligenceUnsubscribe("member_124", signature, secret), false);
assert.equal(verifyWeeklyIntelligenceUnsubscribe("member_123", "bad-signature", secret), false);

console.log("Member weekly intelligence contracts passed.");
