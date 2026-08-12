import "server-only";
import { createHash } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { FreeMemberDayTwoEmail } from "@/components/emails/FreeMemberDayTwoEmail";
import { ALERT_REPLY_TO, getResendClient } from "@/lib/email-alerts";
import {
  NEWSLETTER_AUDIENCE_ID,
  isValidNewsletterEmail,
  newsletterOneClickUnsubscribeUrl,
  newsletterUnsubscribeUrl,
  normalizeNewsletterEmail,
} from "@/lib/newsletter";
import {
  FREE_MEMBER_DAY_TWO_CAMPAIGN_ID,
  FREE_MEMBER_DAY_TWO_LIVE_SEND_SUPPORTED,
  FREE_MEMBER_DAY_TWO_SUBJECT,
  buildFreeMemberDayTwoConfig,
  evaluateFreeMemberDayTwoCandidate,
  resolveFreeMemberDayTwoDeliveryMode,
  type FreeMemberDayTwoUser,
} from "@/lib/free-member-day-two";
import { resolveServerEffectiveMembershipTier } from "@/lib/server-entitlements";

const FREE_MEMBER_DAY_TWO_FROM = "Chandler from Bourbon Signal <chandler@bourbonsignal.com>";
type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function primaryEmail(user: any) {
  const primary = user.primaryEmailAddress;
  if (!primary || primary.verification?.status !== "verified") return "";
  return normalizeNewsletterEmail(primary.emailAddress || "");
}

function toCandidateUser(user: any): FreeMemberDayTwoUser {
  return {
    id: user.id,
    createdAt: user.createdAt,
    firstName: user.firstName,
    publicMetadata: record(user.publicMetadata),
    privateMetadata: record(user.privateMetadata),
    unsafeMetadata: record(user.unsafeMetadata),
    banned: user.banned === true,
    locked: user.locked === true,
  };
}

async function enumerateRecentUsers(client: Awaited<ReturnType<typeof clerkClient>>, maxMembers: number) {
  const users: any[] = [];
  let offset = 0;
  while (users.length < maxMembers) {
    const page = await client.users.getUserList({
      limit: Math.min(100, maxMembers - users.length),
      offset,
      orderBy: "-created_at",
    });
    users.push(...page.data);
    offset += page.data.length;
    if (!page.data.length || !page.totalCount || offset >= page.totalCount) break;
  }
  return users;
}

export async function recipientMasterSubscription(recipient: string): Promise<"active" | "missing" | "unsubscribed"> {
  if (!NEWSLETTER_AUDIENCE_ID) return "missing";
  const result = await getResendClient().contacts.get({ audienceId: NEWSLETTER_AUDIENCE_ID, email: recipient });
  if (result.error) {
    const error = record(result.error);
    if (error.statusCode === 404) return "missing";
    throw new Error("Unable to verify lifecycle email suppression");
  }
  return result.data?.unsubscribed === true ? "unsubscribed" : "active";
}

function deliveryMetadata(user: any) {
  return record(record(user.privateMetadata).freeMemberDayTwoDelivery);
}

async function toDurableCandidateUser(user: any) {
  const candidate = toCandidateUser(user);
  const tier = await resolveServerEffectiveMembershipTier(candidate.publicMetadata);
  return {
    ...candidate,
    publicMetadata: {
      ...candidate.publicMetadata,
      tier,
      membershipTier: tier,
      membershipStatus: tier === "free" ? "free" : candidate.publicMetadata?.membershipStatus,
    },
  };
}

async function reserveDelivery(client: Awaited<ReturnType<typeof clerkClient>>, user: any, now: string) {
  const current = await client.users.getUser(user.id);
  const currentCandidate = await toDurableCandidateUser(current);
  const status = evaluateFreeMemberDayTwoCandidate({ user: currentCandidate, now });
  if (status !== "eligible") return false;
  await client.users.updateUserMetadata(user.id, {
    privateMetadata: {
      freeMemberDayTwoDelivery: {
        ...deliveryMetadata(current),
        campaignId: FREE_MEMBER_DAY_TWO_CAMPAIGN_ID,
        status: "reserved",
        reservedAt: now,
      },
    },
  });
  return true;
}

async function markDeliveryFailed(client: Awaited<ReturnType<typeof clerkClient>>, userId: string, now: string) {
  const current = await client.users.getUser(userId);
  await client.users.updateUserMetadata(userId, {
    privateMetadata: {
      freeMemberDayTwoDelivery: {
        ...deliveryMetadata(current),
        campaignId: FREE_MEMBER_DAY_TWO_CAMPAIGN_ID,
        status: "failed",
        failedAt: now,
        reservedAt: null,
      },
    },
  });
}

async function markDelivered(client: Awaited<ReturnType<typeof clerkClient>>, userId: string, now: string, providerMessageId: string) {
  const current = await client.users.getUser(userId);
  await client.users.updateUserMetadata(userId, {
    privateMetadata: {
      freeMemberDayTwoDelivery: {
        ...deliveryMetadata(current),
        campaignId: FREE_MEMBER_DAY_TWO_CAMPAIGN_ID,
        status: "delivered",
        deliveredAt: now,
        providerMessageId,
      },
    },
  });
}

export async function runFreeMemberDayTwoDelivery(input: { requestLive?: boolean; now?: string; env?: NodeJS.ProcessEnv } = {}) {
  const env = input.env || process.env;
  const now = input.now || new Date().toISOString();
  const config = buildFreeMemberDayTwoConfig(env);
  const decision = resolveFreeMemberDayTwoDeliveryMode({ requestLive: input.requestLive === true, config });
  const summary = {
    ok: decision.mode !== "blocked",
    mode: decision.mode,
    reason: decision.reason,
    liveSendSupported: FREE_MEMBER_DAY_TWO_LIVE_SEND_SUPPORTED,
    membersEnumerated: 0,
    membersConsidered: 0,
    eligible: 0,
    wouldSend: 0,
    sent: 0,
    errors: 0,
    skipped: {} as Record<string, number>,
  };
  if (decision.mode === "blocked") return summary;

  const client = await clerkClient();
  const users = await enumerateRecentUsers(client, config.maxMembersPerRun);
  summary.membersEnumerated = users.length;

  for (const user of users) {
    summary.membersConsidered += 1;
    try {
      const candidate = await toDurableCandidateUser(user);
      const status = evaluateFreeMemberDayTwoCandidate({
        user: candidate,
        now,
        reservationTtlMinutes: config.reservationTtlMinutes,
      });
      if (status !== "eligible") {
        summary.skipped[status] = (summary.skipped[status] || 0) + 1;
        continue;
      }
      const recipient = primaryEmail(user);
      if (!recipient) {
        summary.skipped.skipped_invalid_recipient = (summary.skipped.skipped_invalid_recipient || 0) + 1;
        continue;
      }
      const subscription = await recipientMasterSubscription(recipient);
      if (subscription !== "active") {
        const key = subscription === "unsubscribed" ? "skipped_provider_unsubscribed" : "skipped_provider_contact_missing";
        summary.skipped[key] = (summary.skipped[key] || 0) + 1;
        continue;
      }
      summary.eligible += 1;
      if (summary.wouldSend + summary.sent >= config.maxEmailsPerRun) {
        summary.skipped.blocked_run_cap = (summary.skipped.blocked_run_cap || 0) + 1;
        continue;
      }
      if (decision.mode === "dry_run") {
        summary.wouldSend += 1;
        continue;
      }
      if (!(await reserveDelivery(client, user, now))) {
        summary.skipped.reserved_elsewhere = (summary.skipped.reserved_elsewhere || 0) + 1;
        continue;
      }
      const refreshed = await client.users.getUser(user.id);
      if (evaluateFreeMemberDayTwoCandidate({ user: await toDurableCandidateUser(refreshed), now }) !== "skipped_reserved") {
        summary.skipped.skipped_pre_send_recheck = (summary.skipped.skipped_pre_send_recheck || 0) + 1;
        continue;
      }
      const refreshedRecipient = primaryEmail(refreshed);
      if (!isValidNewsletterEmail(refreshedRecipient)) {
        summary.skipped.skipped_invalid_recipient = (summary.skipped.skipped_invalid_recipient || 0) + 1;
        continue;
      }
      if (await recipientMasterSubscription(refreshedRecipient) !== "active") {
        summary.skipped.skipped_pre_send_suppression = (summary.skipped.skipped_pre_send_suppression || 0) + 1;
        continue;
      }
      const unsubscribeUrl = newsletterUnsubscribeUrl(refreshedRecipient, env.NEXT_PUBLIC_APP_URL);
      const oneClickUnsubscribeUrl = newsletterOneClickUnsubscribeUrl(refreshedRecipient, env.NEXT_PUBLIC_APP_URL);
      const idempotencyKey = `day-two-${createHash("sha256").update(`${FREE_MEMBER_DAY_TWO_CAMPAIGN_ID}:${user.id}`).digest("hex").slice(0, 32)}`;
      try {
        const result = await getResendClient().emails.send({
          from: FREE_MEMBER_DAY_TWO_FROM,
          to: [refreshedRecipient],
          replyTo: ALERT_REPLY_TO,
          subject: FREE_MEMBER_DAY_TWO_SUBJECT,
          react: FreeMemberDayTwoEmail({ firstName: user.firstName, unsubscribeUrl, baseUrl: env.NEXT_PUBLIC_APP_URL }),
          headers: {
            "List-Unsubscribe": `<${oneClickUnsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            "X-Entity-Ref-ID": idempotencyKey,
          },
        }, { idempotencyKey });
        if (result.error) throw new Error(result.error.message);
        await markDelivered(client, user.id, now, result.data?.id || idempotencyKey);
        summary.sent += 1;
      } catch (error) {
        await markDeliveryFailed(client, user.id, now).catch(() => undefined);
        throw error;
      }
    } catch {
      summary.errors += 1;
    }
  }
  summary.ok = summary.errors === 0;
  return summary;
}
