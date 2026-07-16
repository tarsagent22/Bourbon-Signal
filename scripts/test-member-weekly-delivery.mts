import assert from "node:assert/strict";
import { buildMemberWeeklyDeliveryConfig } from "../src/lib/member-weekly-delivery.ts";
import { executeMemberWeeklyDeliveryRun } from "../src/lib/member-weekly-delivery-runner.ts";

const now = "2026-07-16T14:00:00.000Z";
const optedIn = { emailEnabled: true, optedInAt: "2026-07-01T12:00:00.000Z", unsubscribedAt: null };
const config = buildMemberWeeklyDeliveryConfig({
  WEEKLY_INTELLIGENCE_EMAIL_KILL_SWITCH: "0",
  WEEKLY_INTELLIGENCE_DELIVERY_ENABLED: "1",
  WEEKLY_INTELLIGENCE_LIVE_SEND_SUPPORTED: "1",
  WEEKLY_INTELLIGENCE_LIVE_SEND_AUTHORIZED: "1",
  NEWSLETTER_AUDIENCE_ID: "audience_test",
  WEEKLY_INTELLIGENCE_DELIVERY_WEEKDAY: "4",
  WEEKLY_INTELLIGENCE_DELIVERY_START_HOUR: "9",
  WEEKLY_INTELLIGENCE_DELIVERY_END_HOUR: "17",
  WEEKLY_INTELLIGENCE_DELIVERY_TIME_ZONE: "America/New_York",
  WEEKLY_INTELLIGENCE_MAX_EMAILS_PER_RUN: "2",
  WEEKLY_INTELLIGENCE_BATCH_SIZE: "2",
  WEEKLY_INTELLIGENCE_MIN_SEND_INTERVAL_MS: "10",
  WEEKLY_INTELLIGENCE_BATCH_PAUSE_MS: "20",
} as NodeJS.ProcessEnv);

function user(id: string, weeklyIntelligence = optedIn, privateMetadata: Record<string, unknown> = {}) {
  return {
    id,
    emailAddresses: [{ id: `email_${id}`, emailAddress: `${id}@example.com` }],
    primaryEmailAddressId: `email_${id}`,
    publicMetadata: { tier: "standard", membershipStatus: "active", notificationPreferences: { weeklyIntelligence } },
    privateMetadata,
  };
}

function prepared(id: string) {
  return {
    report: {
      memberId: id,
      weekKey: "2026-07-13",
      generatedAt: now,
      eyebrow: "Your weekly intelligence",
      headline: "One signal",
      introduction: "A brief.",
      sections: [{ kind: "radar" as const, title: "Radar", items: [{ id: "item", title: "Release", summary: "Soon", meta: "2026-07-18" }] }],
      primaryAction: { kind: "radar" as const, label: "Open Radar", href: "/release-radar" },
      isEmpty: false,
    },
    dryRun: {
      mode: "dry_run" as const,
      status: "would_send" as const,
      memberId: id,
      recipient: `${id}@example.com`,
      weekKey: "2026-07-13",
      dedupeKey: `dedupe-${id}`,
      sendAttempted: false as const,
      liveSendSupported: true,
      liveDeliveryAuthorized: true,
      previewAvailable: true,
    },
    recipient: `${id}@example.com`,
    unsubscribeUrl: `https://example.com/unsubscribe/${id}`,
  };
}

let prepareCalls = 0;
let reserveCalls = 0;
let sendCalls = 0;
let markCalls = 0;
const dryRun = await executeMemberWeeklyDeliveryRun({
  users: [
    user("member_e"),
    user("member_c"),
    user("member_b", optedIn, { weeklyIntelligenceDelivery: { suppressedAt: now } }),
    user("member_a"),
    user("member_d", { emailEnabled: false, optedInAt: null, unsubscribedAt: null }),
    { ...user("member_f"), publicMetadata: { tier: "free", membershipStatus: "free", notificationPreferences: { weeklyIntelligence: optedIn } } },
    user("member_g"),
  ],
  now,
  requestLive: false,
  config,
  dependencies: {
    prepare: async (member) => { prepareCalls += 1; return prepared(member.id); },
    refreshUser: async (memberId) => user(memberId),
    recipientMasterUnsubscribed: async (recipient) => recipient.startsWith("member_g@"),
    reserveMemberWeek: async () => { reserveCalls += 1; return true; },
    send: async () => { sendCalls += 1; return { messageId: "must-not-send" }; },
    markMemberWeekDelivered: async () => { markCalls += 1; },
    sleep: async () => undefined,
  },
});
assert.deepEqual(dryRun.results, [
  { memberId: "member_a", status: "would_send" },
  { memberId: "member_b", status: "skipped_master_unsubscribed" },
  { memberId: "member_c", status: "would_send" },
  { memberId: "member_d", status: "skipped_not_opted_in" },
  { memberId: "member_e", status: "blocked_run_cap" },
  { memberId: "member_f", status: "skipped_ineligible_member" },
  { memberId: "member_g", status: "skipped_master_unsubscribed" },
], "subscriber processing is deterministic and applies consent, suppression, and the run cap");
assert.equal(prepareCalls, 4, "only eligible subscribers reach composition before recipient-level master suppression");
assert.deepEqual({ reserveCalls, sendCalls, markCalls }, { reserveCalls: 0, sendCalls: 0, markCalls: 0 }, "dry-run cannot reserve, send, or mutate a ledger");

const idempotencyKeys: string[] = [];
const delivered: string[] = [];
const sleepDurations: number[] = [];
const live = await executeMemberWeeklyDeliveryRun({
  users: [user("member_c"), user("member_a")],
  now,
  requestLive: true,
  config: { ...config, maxEmailsPerRun: 10, batchSize: 1 },
  dependencies: {
    prepare: async (member) => prepared(member.id),
    refreshUser: async (memberId) => user(memberId),
    recipientMasterUnsubscribed: async () => false,
    reserveMemberWeek: async (_member, entry) => entry.status === "reserved",
    send: async (_delivery, input) => { idempotencyKeys.push(input.idempotencyKey); return { messageId: `fake-${input.idempotencyKey}` }; },
    markMemberWeekDelivered: async (_member, entry) => { assert.equal(entry.status, "delivered"); delivered.push(entry.memberId); },
    sleep: async (milliseconds) => { sleepDurations.push(milliseconds); },
  },
});
assert.equal(live.sent, 2);
assert.deepEqual(live.results.map((result) => result.memberId), ["member_a", "member_c"]);
assert.deepEqual(idempotencyKeys, ["member-weekly-dedupe-member_a", "member-weekly-dedupe-member_c"], "provider calls carry stable member-week idempotency keys");
assert.deepEqual(delivered, ["member_a", "member_c"], "the ledger is marked only after the fake sender succeeds");
assert.ok(sleepDurations.includes(config.minSendIntervalMs), "live sends are rate limited");
assert.ok(sleepDurations.includes(config.batchPauseMs), "live sends pause between batches");

let currentRaceUser = user("member_race");
let raceSendCalls = 0;
const unsubscribeDuringRun = await executeMemberWeeklyDeliveryRun({
  users: [currentRaceUser],
  now,
  requestLive: true,
  config: { ...config, maxEmailsPerRun: 10 },
  dependencies: {
    prepare: async (member) => prepared(member.id),
    refreshUser: async () => currentRaceUser,
    recipientMasterUnsubscribed: async () => false,
    reserveMemberWeek: async () => {
      currentRaceUser = user("member_race", {
        emailEnabled: false,
        optedInAt: optedIn.optedInAt,
        unsubscribedAt: "2026-07-16T14:00:01.000Z",
      });
      return true;
    },
    send: async () => { raceSendCalls += 1; return { messageId: "must-not-send" }; },
    markMemberWeekDelivered: async () => undefined,
    sleep: async () => undefined,
  },
});
assert.deepEqual(unsubscribeDuringRun.results, [{ memberId: "member_race", status: "skipped_unsubscribed" }], "current Clerk consent is re-read after reservation and before the provider call");
assert.equal(raceSendCalls, 0, "an unsubscribe during a live run wins without a provider send");

let blockedPrepareCalls = 0;
const blocked = await executeMemberWeeklyDeliveryRun({
  users: [user("member_a")],
  now,
  requestLive: true,
  config: { ...config, liveSendAuthorized: false },
  dependencies: {
    prepare: async (member) => { blockedPrepareCalls += 1; return prepared(member.id); },
    refreshUser: async (memberId) => user(memberId),
    recipientMasterUnsubscribed: async () => false,
    reserveMemberWeek: async () => true,
    send: async () => ({ messageId: "must-not-send" }),
    markMemberWeekDelivered: async () => undefined,
    sleep: async () => undefined,
  },
});
assert.equal(blocked.mode, "blocked");
assert.equal(blocked.reason, "live_not_authorized");
assert.equal(blockedPrepareCalls, 0, "unauthorized live mode stops before composition or any sender work");

const suppressionUnavailable = await executeMemberWeeklyDeliveryRun({
  users: [user("member_a")],
  now,
  requestLive: true,
  config: { ...config, providerSuppressionConfigured: false },
  dependencies: {
    prepare: async (member) => prepared(member.id),
    refreshUser: async (memberId) => user(memberId),
    recipientMasterUnsubscribed: async () => false,
    reserveMemberWeek: async () => true,
    send: async () => ({ messageId: "must-not-send" }),
    markMemberWeekDelivered: async () => undefined,
    sleep: async () => undefined,
  },
});
assert.equal(suppressionUnavailable.mode, "blocked");
assert.equal(suppressionUnavailable.reason, "suppression_unavailable", "live mode fails closed when provider suppression cannot be checked");

console.log("Member weekly delivery sender contracts passed without sending email.");
