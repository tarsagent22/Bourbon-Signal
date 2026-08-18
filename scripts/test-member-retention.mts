import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import retentionModule from "../src/lib/member-retention.ts";
import guidanceModule from "../src/lib/alert-setup-guidance.ts";

const { buildPaidMemberRetentionSnapshot, normalizeRetentionFeedback, paidMemberRescueEligible } = retentionModule;
const { buildAlertSetupGuidance } = guidanceModule;

const now = "2026-08-17T16:00:00.000Z";

function member(input: {
  id: string;
  tier?: "standard" | "barrel" | "bottled-in-bond" | "free";
  plan?: string;
  status?: string;
  activatedAt?: string;
  setupAt?: string;
  firstAlertAt?: string;
  createdAt?: string;
  lastSignInAt?: string;
  states?: string[];
  bottleNames?: string[];
  alertMode?: "specific_bottles" | "anything_notable";
  channels?: { onSite?: boolean; email?: boolean; sms?: boolean };
  weeklyOptInAt?: string | null;
}) {
  const activation: Record<string, string> = {};
  if (input.activatedAt) activation.membership_activated = input.activatedAt;
  if (input.setupAt) activation.paid_activation_completed = input.setupAt;
  if (input.firstAlertAt) activation.first_alert_created = input.firstAlertAt;
  return {
    id: input.id,
    firstName: input.id,
    primaryEmailAddressId: `email-${input.id}`,
    emailAddresses: [{ id: `email-${input.id}`, emailAddress: `${input.id}@example.com` }],
    createdAt: input.createdAt || input.activatedAt,
    lastSignInAt: input.lastSignInAt,
    publicMetadata: {
      tier: input.tier || "barrel",
      membershipStatus: input.status || "active",
      billingPlan: input.plan || "barrel_monthly",
      areaPreferences: { states: input.states || ["VA"] },
      alertMode: input.alertMode || "specific_bottles",
      bottleAlertPreferences: { bottleNames: input.bottleNames || ["Weller 12"], bottleKeys: input.bottleNames || ["weller 12"] },
      notificationPreferences: {
        onSite: { enabled: input.channels?.onSite ?? true },
        email: { enabled: input.channels?.email ?? true },
        sms: { enabled: input.channels?.sms ?? false },
        weeklyIntelligence: input.weeklyOptInAt === undefined ? { emailEnabled: false, optedInAt: null, unsubscribedAt: null } : { emailEnabled: Boolean(input.weeklyOptInAt), optedInAt: input.weeklyOptInAt, unsubscribedAt: null },
      },
    },
    privateMetadata: { activation },
  };
}

const snapshot = buildPaidMemberRetentionSnapshot([
  member({ id: "healthy", activatedAt: "2026-08-10T12:00:00.000Z", setupAt: "2026-08-10T12:30:00.000Z", firstAlertAt: "2026-08-11T09:00:00.000Z" }),
  member({ id: "setup", activatedAt: "2026-08-13T12:00:00.000Z", states: [], bottleNames: [], channels: { onSite: false, email: false, sms: false } }),
  member({ id: "waiting", activatedAt: "2026-08-15T12:00:00.000Z", setupAt: "2026-08-15T12:15:00.000Z" }),
  member({ id: "rescue", activatedAt: "2026-08-13T12:00:00.000Z", setupAt: "2026-08-13T12:15:00.000Z", weeklyOptInAt: "2026-08-13T12:20:00.000Z" }),
  member({ id: "annual", tier: "standard", plan: "standard_annual", activatedAt: "2026-08-13T12:00:00.000Z", setupAt: "2026-08-13T12:15:00.000Z" }),
  member({ id: "founder", tier: "bottled-in-bond", plan: "bib_lifetime", status: "lifetime", activatedAt: "2026-08-01T12:00:00.000Z", setupAt: "2026-08-01T12:15:00.000Z" }),
  member({ id: "free", tier: "free", plan: "", status: "free", activatedAt: "2026-08-01T12:00:00.000Z" }),
], now);

assert.deepEqual(snapshot.counts, {
  recurringPaid: 5,
  healthy: 1,
  firstValueReached: 1,
  setupIncomplete: 1,
  awaitingFirstValue: 1,
  rescueDue: 2,
});
assert.deepEqual(snapshot.attention.map((item) => item.memberId), ["annual", "rescue", "setup"], "highest-risk recurring members are prioritized deterministically");

const upgradedOldAccount = member({ id: "recent-upgrade", activatedAt: "2026-08-17T12:00:00.000Z" });
upgradedOldAccount.createdAt = "2025-01-01T00:00:00.000Z";
(upgradedOldAccount.publicMetadata as Record<string, unknown>).membershipUpdatedAt = "2026-08-17T12:00:00.000Z";
(upgradedOldAccount.privateMetadata as Record<string, unknown>).activation = { paid_activation_completed: "2026-08-17T12:15:00.000Z" };
const recentUpgrade = buildPaidMemberRetentionSnapshot([upgradedOldAccount], now).members[0];
assert.equal(recentUpgrade.membershipAgeHours, 4, "public membership update time is the safe fallback when the private activation write fails");
assert.equal(recentUpgrade.stage, "awaiting_first_value", "an older free account is not rescued immediately after upgrading");

const smsOnly = member({ id: "sms-only", channels: { onSite: false, email: false, sms: false } });
(smsOnly.publicMetadata as Record<string, unknown>).notificationPreferences = { onSite: { enabled: false }, email: { enabled: false }, sms: { enabled: true, verified: false } };
assert.equal(buildPaidMemberRetentionSnapshot([smsOnly], now).members[0].stage, "setup_incomplete", "unverified SMS is not treated as a deliverable channel");
assert.equal(snapshot.attention[0]?.recommendedAction, "Review coverage and watchlist; the member has waited more than 72 hours without a first alert.");
assert.equal(snapshot.members.some((item) => item.memberId === "founder"), false, "lifetime founders are not recurring-churn candidates");
assert.equal(snapshot.members.some((item) => item.memberId === "free"), false);
assert.equal(snapshot.members.find((item) => item.memberId === "waiting")?.stage, "awaiting_first_value");

assert.equal(paidMemberRescueEligible(snapshot.members.find((item) => item.memberId === "rescue")!, member({ id: "rescue", activatedAt: "2026-08-13T12:00:00.000Z", setupAt: "2026-08-13T12:15:00.000Z", weeklyOptInAt: "2026-08-13T12:20:00.000Z" }).publicMetadata.notificationPreferences), true);
assert.equal(paidMemberRescueEligible(snapshot.members.find((item) => item.memberId === "setup")!, member({ id: "setup-opted-in", activatedAt: "2026-08-13T12:00:00.000Z", states: [], bottleNames: [], channels: { onSite: false, email: false, sms: false }, weeklyOptInAt: "2026-08-13T12:20:00.000Z" }).publicMetadata.notificationPreferences), true, "72-hour setup gaps are rescue eligible too");
assert.equal(paidMemberRescueEligible({ ...snapshot.members.find((item) => item.memberId === "setup")!, setupCompletedAt: "2026-08-10T00:00:00.000Z" }, member({ id: "setup-opted-in", weeklyOptInAt: "2026-08-13T12:20:00.000Z" }).publicMetadata.notificationPreferences), false, "a long-standing member who recently changed setup is not treated as a new-member rescue");
assert.equal(paidMemberRescueEligible(snapshot.members.find((item) => item.memberId === "annual")!, member({ id: "annual", tier: "standard", plan: "standard_annual", activatedAt: "2026-08-13T12:00:00.000Z", setupAt: "2026-08-13T12:15:00.000Z" }).publicMetadata.notificationPreferences), false, "rescue email requires explicit weekly consent");

assert.deepEqual(buildAlertSetupGuidance({ states: [], alertMode: "specific_bottles", trackedBottleCount: 0, enabledChannelCount: 0 }), {
  tone: "action",
  title: "Finish your radar setup",
  message: "Add a market, choose bottles or all notable drops, and enable at least one delivery channel.",
});
assert.match(buildAlertSetupGuidance({ states: ["VA"], alertMode: "specific_bottles", trackedBottleCount: 4, enabledChannelCount: 2 }).message, /exact-bottle radar can be quiet/i);
assert.match(buildAlertSetupGuidance({ states: ["VA"], alertMode: "anything_notable", trackedBottleCount: 0, enabledChannelCount: 2 }).message, /broader coverage/i);

assert.deepEqual(normalizeRetentionFeedback({ reason: "too_few_alerts", details: "  I never saw a match.  ", nextStep: "manage_alerts" }), {
  reason: "too_few_alerts",
  details: "I never saw a match.",
  nextStep: "manage_alerts",
});
assert.throws(() => normalizeRetentionFeedback({ reason: "made_up", nextStep: "billing_portal" }), /valid reason/i);
assert.equal(normalizeRetentionFeedback({ reason: "other", details: "x".repeat(900), nextStep: "billing_portal" }).details.length, 300);

const settings = readFileSync(new URL("../src/app/settings/SettingsPageClient.tsx", import.meta.url), "utf8");
const feedbackRoute = readFileSync(new URL("../src/app/api/member-retention/feedback/route.ts", import.meta.url), "utf8");
const controlRoom = readFileSync(new URL("../src/app/admin/control-room/page.tsx", import.meta.url), "utf8");
assert.match(settings, /What would make your membership more useful\?/);
assert.match(settings, /Too few relevant alerts/);
assert.match(settings, /try\s*{\s*await saveRetentionFeedback\(nextStep\);\s*}\s*catch/, "optional feedback failure cannot block billing portal access");
assert.match(feedbackRoute, /slice\(-4\)/, "feedback history stays bounded well below Clerk metadata limits");
assert.match(settings, /Review a lower-cost plan/);
assert.match(settings, /Continue to billing/);
assert.match(feedbackRoute, /await auth\(\)/);
assert.match(feedbackRoute, /updateUserMetadata/);
assert.match(feedbackRoute, /retentionFeedback/);
assert.doesNotMatch(feedbackRoute, /STRIPE_SECRET_KEY|RESEND_API_KEY/);
assert.match(controlRoom, /Paid-member retention/);
assert.match(controlRoom, /retention\.attention/);

console.log("Paid-member retention contracts passed.");
