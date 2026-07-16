import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { MemberWeeklyIntelligenceEmail } from "@/components/emails/MemberWeeklyIntelligenceEmail";
import { ALERT_REPLY_TO, getResendClient } from "@/lib/email-alerts";
import { NEWSLETTER_AUDIENCE_ID } from "@/lib/newsletter";
import {
  buildMemberWeeklyDeliveryConfig,
  memberWeekReservationActive,
  normalizeMemberWeeklyDeliveryLedger,
  upsertMemberWeeklyDeliveryLedger,
  type MemberWeeklyDeliveryLedgerEntry,
} from "@/lib/member-weekly-delivery";
import { executeMemberWeeklyDeliveryRun } from "@/lib/member-weekly-delivery-runner";
import {
  buildWeeklyIntelligencePreviewFromSources,
  loadMemberWeeklySourceBundle,
  type MemberWeeklyServerUser,
} from "@/lib/member-weekly-server";

type UnknownRecord = Record<string, unknown>;

export const MEMBER_WEEKLY_FROM = "Bourbon Signal <alerts@bourbonsignal.com>";

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function legacyDeliveredDedupeKeys(value: unknown) {
  return Array.isArray(value) ? value.flatMap((item) => {
    if (typeof item === "string" && item.trim()) return [item.trim()];
    const dedupeKey = typeof record(item).dedupeKey === "string" ? String(record(item).dedupeKey).trim() : "";
    return dedupeKey ? [dedupeKey] : [];
  }) : [];
}

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function recipientMasterUnsubscribed(recipient: string) {
  if (!NEWSLETTER_AUDIENCE_ID) throw new Error("Provider suppression verification is unavailable");
  const result = await getResendClient().contacts.get({ audienceId: NEWSLETTER_AUDIENCE_ID, email: recipient });
  if (result.error) {
    const error = record(result.error);
    if (error.statusCode === 404) return false;
    throw new Error(typeof error.message === "string" ? error.message : "Unable to verify master email suppression");
  }
  return result.data?.unsubscribed === true;
}

async function enumerateSubscribersDeterministically(
  client: Awaited<ReturnType<typeof clerkClient>>,
  batchSize: number,
  maxMembersPerRun: number,
) {
  const users: MemberWeeklyServerUser[] = [];
  let offset = 0;
  while (users.length < maxMembersPerRun) {
    const page = await client.users.getUserList({
      limit: Math.min(batchSize, maxMembersPerRun - users.length),
      offset,
      orderBy: "+created_at",
    });
    users.push(...page.data);
    offset += page.data.length;
    if (!page.data.length || !page.totalCount || offset >= page.totalCount) break;
  }
  return users.sort((left, right) => left.id.localeCompare(right.id));
}

function deliveryMetadata(user: MemberWeeklyServerUser) {
  return record(record(user.privateMetadata).weeklyIntelligenceDelivery);
}

async function reserveMemberWeek(
  client: Awaited<ReturnType<typeof clerkClient>>,
  entry: MemberWeeklyDeliveryLedgerEntry,
  reservationTtlMinutes: number,
) {
  const user = await client.users.getUser(entry.memberId);
  const existingDelivery = deliveryMetadata(user);
  const legacyDeliveredMemberWeeks = legacyDeliveredDedupeKeys(existingDelivery.deliveredMemberWeeks);
  if (legacyDeliveredMemberWeeks.includes(entry.dedupeKey)) return false;
  const ledger = normalizeMemberWeeklyDeliveryLedger(existingDelivery);
  const existing = ledger.find((candidate) => candidate.dedupeKey === entry.dedupeKey);
  if (existing && memberWeekReservationActive(existing, entry.reservedAt, reservationTtlMinutes)) return false;
  await client.users.updateUserMetadata(entry.memberId, {
    privateMetadata: {
      weeklyIntelligenceDelivery: {
        ...existingDelivery,
        deliveries: upsertMemberWeeklyDeliveryLedger(ledger, entry),
      },
    },
  });
  return true;
}

async function markMemberWeekDelivered(
  client: Awaited<ReturnType<typeof clerkClient>>,
  entry: MemberWeeklyDeliveryLedgerEntry,
) {
  const user = await client.users.getUser(entry.memberId);
  const existingDelivery = deliveryMetadata(user);
  const ledger = normalizeMemberWeeklyDeliveryLedger(existingDelivery);
  await client.users.updateUserMetadata(entry.memberId, {
    privateMetadata: {
      weeklyIntelligenceDelivery: {
        ...existingDelivery,
        deliveries: upsertMemberWeeklyDeliveryLedger(ledger, entry),
        lastDeliveredAt: entry.deliveredAt,
      },
    },
  });
}

export async function runMemberWeeklyDelivery(input: {
  requestLive?: boolean;
  now?: string;
  env?: NodeJS.ProcessEnv;
} = {}) {
  const env = input.env || process.env;
  const now = input.now || new Date().toISOString();
  const config = buildMemberWeeklyDeliveryConfig(env);
  const client = await clerkClient();
  const users = await enumerateSubscribersDeterministically(client, config.batchSize, config.maxMembersPerRun);
  const sources = await loadMemberWeeklySourceBundle(now);
  const appUrl = env.NEXT_PUBLIC_APP_URL || "https://www.bourbonsignal.com";

  return executeMemberWeeklyDeliveryRun({
    users,
    now,
    requestLive: input.requestLive === true,
    config,
    dependencies: {
      prepare: async (user) => buildWeeklyIntelligencePreviewFromSources({ user, sources, now, appUrl }),
      refreshUser: async (memberId) => client.users.getUser(memberId),
      recipientMasterUnsubscribed,
      reserveMemberWeek: async (_user, entry) => reserveMemberWeek(client, entry, config.reservationTtlMinutes),
      send: async (prepared, { idempotencyKey }) => {
        const result = await getResendClient().emails.send({
          from: MEMBER_WEEKLY_FROM,
          to: [prepared.recipient],
          replyTo: ALERT_REPLY_TO,
          subject: `Your Bourbon Signal week of ${prepared.report.weekKey}`,
          react: MemberWeeklyIntelligenceEmail({
            report: prepared.report,
            unsubscribeUrl: prepared.unsubscribeUrl,
            baseUrl: appUrl,
          }),
          headers: { "X-Entity-Ref-ID": idempotencyKey.slice(0, 190) },
        }, { idempotencyKey });
        if (result.error) throw new Error(result.error.message);
        return { messageId: result.data?.id || idempotencyKey };
      },
      markMemberWeekDelivered: async (_user, entry) => markMemberWeekDelivered(client, entry),
      sleep,
    },
  });
}
