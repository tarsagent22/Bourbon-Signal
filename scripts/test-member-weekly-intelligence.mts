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
  weeklyIntelligenceUnsubscribeUrl,
} from "../src/lib/member-weekly-email.ts";
import {
  assertMemberWeeklyDeliveryAuthorized,
  buildMemberWeeklyDeliveryConfig,
  isMemberWeeklyDeliveryWindowOpen,
  memberWeekReservationActive,
  normalizeMemberWeeklyDeliveryLedger,
  resolveMemberWeeklyDeliveryMode,
  upsertMemberWeeklyDeliveryLedger,
} from "../src/lib/member-weekly-delivery.ts";
import {
  applyWeeklyIntelligencePreferenceTransition,
  applyWeeklyIntelligenceUnsubscribe,
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
    {
      id: "alert-canonical-city-match",
      dedupeKey: "signal-canonical-city-match",
      bottleName: "Weller Antique 107",
      stateCode: "NC",
      locationLabel: "Store 41",
      deliveryAreaMatched: true,
      deliveryMatchFields: ["Raleigh", "Wake County", "NC Board 17", "41"],
      freshnessHours: 1,
      freshnessPolicyHours: 2,
      eligibleForDelivery: true,
      eligibleForEmail: true,
      priority: "standard",
      score: 100,
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
    {
      id: "radar-nationwide",
      title: "National bourbon release window",
      summary: "Relevant in every saved market.",
      stateCodes: ["NATIONWIDE"],
      bottleKeys: [],
      startDate: "2026-07-19",
      href: "/release-radar/releases/national",
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
assert.deepEqual(report.sections[0]?.items.map((item) => item.id), ["alert-z", "alert-canonical-city-match"], "canonical delivery-area acceptance survives a lossy display label");
assert.deepEqual(report.sections[1]?.items.map((item) => item.id), ["radar-va", "radar-bottle", "radar-nationwide"], "Radar treats NATIONWIDE as a saved-market wildcard");
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
  requested: { action: "subscribe", expectedVersion: 0 },
  now,
});
assert.deepEqual(optedIn, { emailEnabled: true, optedInAt: now, unsubscribedAt: null, version: 1 });
const optedOutAt = "2026-07-17T10:00:00.000Z";
const optedOut = applyWeeklyIntelligencePreferenceTransition({ existing: optedIn, requested: { action: "unsubscribe", expectedVersion: 1 }, now: optedOutAt });
assert.deepEqual(optedOut, { emailEnabled: false, optedInAt: now, unsubscribedAt: optedOutAt, version: 2 });
const signedUnsubscribe = applyWeeklyIntelligenceUnsubscribe(optedIn, optedOutAt);
assert.deepEqual(signedUnsubscribe, { emailEnabled: false, optedInAt: now, unsubscribedAt: optedOutAt, version: 2 });
assert.deepEqual(
  applyWeeklyIntelligenceUnsubscribe(signedUnsubscribe, "2026-07-18T10:00:00.000Z"),
  signedUnsubscribe,
  "unsubscribe POST replay preserves the first signed unsubscribe time",
);
const resubscribedAt = "2026-07-18T10:00:00.000Z";
const resubscribed = applyWeeklyIntelligencePreferenceTransition({
  existing: signedUnsubscribe,
  requested: { action: "subscribe", expectedVersion: 2 },
  now: resubscribedAt,
});
assert.deepEqual(resubscribed, {
  emailEnabled: true,
  optedInAt: resubscribedAt,
  unsubscribedAt: optedOutAt,
  version: 3,
}, "resubscribe retains monotonic suppression history and records newer explicit consent");

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
  preferences: resubscribed,
  killSwitchActive: false,
}).status, "would_send", "newer explicit consent can reactivate delivery without deleting suppression history");

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
assert.equal(buildWeeklyIntelligenceDryRun({
  ...dryRunBase,
  preferences: { emailEnabled: true, optedInAt: null, unsubscribedAt: null, version: 0 },
  killSwitchActive: false,
}).status, "skipped_missing_explicit_opt_in", "a boolean copied from another channel is not explicit weekly consent");

const secret = "test-secret";
const unsubscribeExpiry = "2026-08-15T14:00:00.000Z";
const signature = signWeeklyIntelligenceUnsubscribe({ memberId: "member_123", issuedAt: now, expiresAt: unsubscribeExpiry, secret });
assert.equal(verifyWeeklyIntelligenceUnsubscribe({ memberId: "member_123", issuedAt: now, expiresAt: unsubscribeExpiry, signature, secret, now }), true);
assert.equal(verifyWeeklyIntelligenceUnsubscribe({ memberId: "member_124", issuedAt: now, expiresAt: unsubscribeExpiry, signature, secret, now }), false);
assert.equal(verifyWeeklyIntelligenceUnsubscribe({ memberId: "member_123", issuedAt: now, expiresAt: unsubscribeExpiry, signature: "bad-signature", secret, now }), false);
assert.equal(verifyWeeklyIntelligenceUnsubscribe({ memberId: "member_123", issuedAt: now, expiresAt: unsubscribeExpiry, signature, secret, now: "2026-08-16T00:00:00.000Z" }), false, "expired links fail closed");
assert.equal(verifyWeeklyIntelligenceUnsubscribe({ memberId: "member_123", issuedAt: now, expiresAt: unsubscribeExpiry, signature, secret, now, purpose: "newsletter-unsubscribe" }), false, "purpose cannot be substituted");
assert.equal(verifyWeeklyIntelligenceUnsubscribe({ memberId: "member_123", issuedAt: now, expiresAt: unsubscribeExpiry, signature, secret, now, version: "2" }), false, "unknown token versions fail closed");
assert.equal(verifyWeeklyIntelligenceUnsubscribe({ memberId: "member_123", issuedAt: "2026-07-17T14:00:00.000Z", expiresAt: unsubscribeExpiry, signature, secret, now }), false, "future-issued links fail closed");
const unsubscribeUrl = new URL(weeklyIntelligenceUnsubscribeUrl({ memberId: "member_123", baseUrl: "https://example.com", secret, now }));
assert.equal(unsubscribeUrl.searchParams.get("purpose"), "weekly-intelligence-unsubscribe");
assert.equal(unsubscribeUrl.searchParams.get("v"), "1");
assert.equal(unsubscribeUrl.searchParams.get("iat"), now);
assert.ok(unsubscribeUrl.searchParams.get("exp"));

const deliveryEnv = {
  WEEKLY_INTELLIGENCE_EMAIL_KILL_SWITCH: "0",
  WEEKLY_INTELLIGENCE_DELIVERY_ENABLED: "1",
  WEEKLY_INTELLIGENCE_LIVE_SEND_SUPPORTED: "1",
  WEEKLY_INTELLIGENCE_LIVE_SEND_AUTHORIZED: "1",
  WEEKLY_INTELLIGENCE_DELIVERY_WEEKDAY: "4",
  WEEKLY_INTELLIGENCE_DELIVERY_START_HOUR: "9",
  WEEKLY_INTELLIGENCE_DELIVERY_END_HOUR: "17",
  WEEKLY_INTELLIGENCE_DELIVERY_TIME_ZONE: "America/New_York",
  WEEKLY_INTELLIGENCE_MAX_EMAILS_PER_RUN: "20",
  WEEKLY_INTELLIGENCE_BATCH_SIZE: "5",
} as NodeJS.ProcessEnv;
const deliveryConfig = buildMemberWeeklyDeliveryConfig(deliveryEnv);
assert.equal(deliveryConfig.maxEmailsPerRun, 20);
assert.equal(deliveryConfig.batchSize, 5);
assert.equal(isMemberWeeklyDeliveryWindowOpen("2026-07-16T14:00:00.000Z", deliveryConfig), true, "Thursday 10am Eastern is inside the configured weekly window");
assert.equal(isMemberWeeklyDeliveryWindowOpen("2026-07-17T14:00:00.000Z", deliveryConfig), false, "live delivery is cadence-gated to the configured weekday");
assert.equal(resolveMemberWeeklyDeliveryMode({ requestLive: false, config: deliveryConfig }).mode, "dry_run", "dry-run is the default even when flags are enabled");
assert.equal(resolveMemberWeeklyDeliveryMode({ requestLive: true, config: deliveryConfig }).mode, "live");
assert.equal(resolveMemberWeeklyDeliveryMode({ requestLive: true, config: buildMemberWeeklyDeliveryConfig({ ...deliveryEnv, WEEKLY_INTELLIGENCE_EMAIL_KILL_SWITCH: "1" }) }).reason, "kill_switch");
assert.equal(resolveMemberWeeklyDeliveryMode({ requestLive: true, config: buildMemberWeeklyDeliveryConfig({ ...deliveryEnv, WEEKLY_INTELLIGENCE_LIVE_SEND_AUTHORIZED: "0" }) }).reason, "live_not_authorized");
const defaultDeliveryConfig = buildMemberWeeklyDeliveryConfig({});
assert.equal(defaultDeliveryConfig.killSwitchActive, true);
assert.equal(defaultDeliveryConfig.deliveryEnabled, false);
assert.equal(defaultDeliveryConfig.liveSendSupported, false);
assert.equal(defaultDeliveryConfig.liveSendAuthorized, false);
assert.doesNotThrow(() => assertMemberWeeklyDeliveryAuthorized(
  new Request("https://example.com/api/member-weekly-intelligence/deliver", { headers: { authorization: "Bearer owner-secret" } }),
  { WEEKLY_INTELLIGENCE_DELIVERY_SECRET: "owner-secret" } as NodeJS.ProcessEnv,
));
assert.throws(() => assertMemberWeeklyDeliveryAuthorized(
  new Request("https://example.com/api/member-weekly-intelligence/deliver", { headers: { authorization: "Bearer wrong" } }),
  { WEEKLY_INTELLIGENCE_DELIVERY_SECRET: "owner-secret" } as NodeJS.ProcessEnv,
));

const reservedLedger = upsertMemberWeeklyDeliveryLedger([], {
  memberId: "member_123",
  weekKey: report.weekKey,
  dedupeKey: weekDedupeKey,
  status: "reserved",
  reservedAt: now,
  deliveredAt: null,
  providerMessageId: null,
});
const deliveredLedger = upsertMemberWeeklyDeliveryLedger(reservedLedger, {
  ...reservedLedger[0]!,
  status: "delivered",
  deliveredAt: "2026-07-16T14:00:01.000Z",
  providerMessageId: "email_123",
});
assert.equal(deliveredLedger.length, 1, "member-week ledger upserts are replay-safe");
assert.equal(deliveredLedger[0]?.status, "delivered");
assert.deepEqual(normalizeMemberWeeklyDeliveryLedger({ deliveries: deliveredLedger }).map((entry) => entry.dedupeKey), [weekDedupeKey]);
assert.equal(memberWeekReservationActive(reservedLedger[0]!, "2026-07-16T14:30:00.000Z", 60), true);
assert.equal(memberWeekReservationActive(reservedLedger[0]!, "2026-07-16T16:00:00.000Z", 60), false, "stale pre-send reservations can recover while provider idempotency remains stable");

console.log("Member weekly intelligence contracts passed.");
