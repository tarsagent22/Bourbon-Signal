import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import Stripe from "stripe";
import {
  classifyCompanyMember,
  extractEngineControlRoomMetrics,
  summarizeMemberships,
  type CompanyMemberUser,
} from "@/lib/company-control-room";
import { buildOpsHealth, readAlertDeliveryHeartbeat } from "@/lib/ops-health";
import { readSiteExport } from "@/lib/site-engine-contract";
import { FOUNDER_SPOT_LIMIT } from "@/lib/entitlements";

interface RevenueSnapshot {
  source: "stripe" | "unavailable";
  currency: string;
  grossCollectedCents: number | null;
  collectedLast30DaysCents: number | null;
  refundedCents: number | null;
  activeSubscriptions: number | null;
  pastDueSubscriptions: number | null;
  monthlyRecurringCents: number | null;
}

interface AudienceSnapshot {
  source: "resend" | "unavailable";
  activeContacts: number | null;
  eligibleFreeMembers: number;
  reachableFreeMembers: number | null;
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function readStripeRevenue(): Promise<RevenueSnapshot> {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    return {
      source: "unavailable",
      currency: "usd",
      grossCollectedCents: null,
      collectedLast30DaysCents: null,
      refundedCents: null,
      activeSubscriptions: null,
      pastDueSubscriptions: null,
      monthlyRecurringCents: null,
    };
  }

  try {
    const stripe = new Stripe(secretKey, { timeout: 8_000, maxNetworkRetries: 1 });
    const cutoff = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
    let grossCollectedCents = 0;
    let collectedLast30DaysCents = 0;
    let refundedCents = 0;
    let currency = "usd";
    for await (const charge of stripe.charges.list({ limit: 100 })) {
      if (!charge.paid || charge.status !== "succeeded") continue;
      currency = charge.currency || currency;
      const net = Math.max(0, charge.amount - charge.amount_refunded);
      grossCollectedCents += net;
      refundedCents += charge.amount_refunded;
      if (charge.created >= cutoff) collectedLast30DaysCents += net;
    }

    let activeSubscriptions = 0;
    let pastDueSubscriptions = 0;
    let monthlyRecurringCents = 0;
    for await (const subscription of stripe.subscriptions.list({ status: "all", limit: 100 })) {
      if (subscription.status === "past_due") pastDueSubscriptions += 1;
      if (subscription.status !== "active" && subscription.status !== "trialing") continue;
      activeSubscriptions += 1;
      for (const item of subscription.items.data) {
        const amount = finiteNumber(item.price.unit_amount) * finiteNumber(item.quantity || 1);
        const interval = item.price.recurring?.interval;
        const intervalCount = finiteNumber(item.price.recurring?.interval_count || 1);
        if (interval === "month") monthlyRecurringCents += Math.round(amount / intervalCount);
        if (interval === "year") monthlyRecurringCents += Math.round(amount / (12 * intervalCount));
        if (interval === "week") monthlyRecurringCents += Math.round((amount * 52) / (12 * intervalCount));
        if (interval === "day") monthlyRecurringCents += Math.round((amount * 365) / (12 * intervalCount));
      }
    }

    return {
      source: "stripe",
      currency,
      grossCollectedCents,
      collectedLast30DaysCents,
      refundedCents,
      activeSubscriptions,
      pastDueSubscriptions,
      monthlyRecurringCents,
    };
  } catch {
    return {
      source: "unavailable",
      currency: "usd",
      grossCollectedCents: null,
      collectedLast30DaysCents: null,
      refundedCents: null,
      activeSubscriptions: null,
      pastDueSubscriptions: null,
      monthlyRecurringCents: null,
    };
  }
}

async function activeResendAudienceEmails() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const audienceId = process.env.RESEND_DIGEST_AUDIENCE_ID?.trim();
  if (!apiKey || !audienceId) return null;
  const emails = new Set<string>();
  let after = "";
  try {
    for (;;) {
      const query = new URLSearchParams({ limit: "100" });
      if (after) query.set("after", after);
      const response = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts?${query}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) return null;
      const payload = await response.json() as { data?: Array<{ id?: string; email?: string; unsubscribed?: boolean }>; has_more?: boolean };
      const contacts = Array.isArray(payload.data) ? payload.data : [];
      for (const contact of contacts) {
        const email = String(contact.email || "").trim().toLowerCase();
        if (email && contact.unsubscribed !== true) emails.add(email);
      }
      if (!payload.has_more || contacts.length === 0) break;
      after = String(contacts.at(-1)?.id || "");
      if (!after) break;
    }
    return emails;
  } catch {
    return null;
  }
}

async function readAudience(users: CompanyMemberUser[]): Promise<AudienceSnapshot> {
  const eligible = users.map(classifyCompanyMember).filter((member) => member.isCampaignEligibleFreeMember);
  const activeAudience = await activeResendAudienceEmails();
  return {
    source: activeAudience ? "resend" : "unavailable",
    activeContacts: activeAudience?.size ?? null,
    eligibleFreeMembers: eligible.length,
    reachableFreeMembers: activeAudience
      ? eligible.filter((member) => activeAudience.has(member.email)).length
      : null,
  };
}

export async function getCompanyControlRoomSnapshot() {
  const client = await clerkClient();
  const result = await client.users.getUserList({ limit: 500 });
  const users = (Array.isArray(result) ? result : result.data) as CompanyMemberUser[];
  const memberships = summarizeMemberships(users);
  const stats = await readSiteExport("stats") as Record<string, unknown> | null;
  const heartbeat = await readAlertDeliveryHeartbeat();
  const refreshHealth = stats?.refreshHealth && typeof stats.refreshHealth === "object"
    ? stats.refreshHealth as Record<string, unknown>
    : null;
  const health = buildOpsHealth({
    heartbeat,
    engineGeneratedAt: typeof stats?.engineGeneratedAt === "string"
      ? stats.engineGeneratedAt
      : typeof stats?.generatedAt === "string" ? stats.generatedAt : null,
    refreshHealth,
    currentDeploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
  });
  const engineMetrics = extractEngineControlRoomMetrics(stats);
  const [revenue, audience] = await Promise.all([
    readStripeRevenue(),
    readAudience(users),
  ]);

  return {
    checkedAt: new Date().toISOString(),
    memberships,
    founder: {
      limit: FOUNDER_SPOT_LIMIT,
      claimed: memberships.counts.founder,
      remaining: Math.max(0, FOUNDER_SPOT_LIMIT - memberships.counts.founder),
    },
    revenue,
    audience,
    engine: {
      status: health.engine.status,
      ageMinutes: health.engine.ageMinutes,
      generatedAt: health.engine.generatedAt,
      ...engineMetrics,
      failedStates: health.engine.failedStateCount,
      degradedStates: health.engine.degradedStateCount,
      staleStates: health.engine.staleStateCount,
    },
    alerts: {
      status: health.cron.status,
      lastRunAt: health.cron.lastRunAt,
      ageMinutes: health.cron.ageMinutes,
      emailEnabled: health.delivery.emailEnabled,
      smsEnabled: health.delivery.smsEnabled,
      onSiteEnabled: health.delivery.onSiteEnabled,
      counts: heartbeat?.counts || {},
    },
    release: health.release,
  };
}
