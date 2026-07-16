import type { MemberWeeklyIntelligence } from "./member-weekly-intelligence.ts";
import type { MemberWeeklyServerUser } from "./member-weekly-server.ts";
import type { MemberWeeklyDryRun } from "./member-weekly-email.ts";
import { isPaidTier } from "./entitlements.ts";
import { normalizeNotificationPreferences } from "./notification-preferences.ts";
import {
  explicitOptIn,
  isMemberWeeklyDeliveryWindowOpen,
  masterUnsubscribed,
  resolveMemberWeeklyDeliveryMode,
  type MemberWeeklyDeliveryConfig,
  type MemberWeeklyDeliveryLedgerEntry,
} from "./member-weekly-delivery.ts";

export interface PreparedMemberWeeklyDelivery {
  report: MemberWeeklyIntelligence;
  dryRun: MemberWeeklyDryRun;
  recipient: string;
  unsubscribeUrl: string;
}

export interface MemberWeeklyDeliveryRunnerDependencies {
  prepare(user: MemberWeeklyServerUser): Promise<PreparedMemberWeeklyDelivery>;
  refreshUser(memberId: string): Promise<MemberWeeklyServerUser>;
  recipientMasterUnsubscribed(recipient: string): Promise<boolean>;
  reserveMemberWeek(user: MemberWeeklyServerUser, entry: MemberWeeklyDeliveryLedgerEntry): Promise<boolean>;
  send(prepared: PreparedMemberWeeklyDelivery, input: { idempotencyKey: string }): Promise<{ messageId: string }>;
  markMemberWeekDelivered(user: MemberWeeklyServerUser, entry: MemberWeeklyDeliveryLedgerEntry): Promise<void>;
  sleep(milliseconds: number): Promise<void>;
}

export type MemberWeeklyMemberResultStatus = MemberWeeklyDryRun["status"]
  | "skipped_master_unsubscribed"
  | "skipped_ineligible_member"
  | "blocked_quiet_hours"
  | "blocked_run_cap"
  | "reserved_elsewhere"
  | "sent"
  | "error";

export interface MemberWeeklyDeliveryRunResult {
  ok: boolean;
  mode: "dry_run" | "live" | "blocked";
  reason: string | null;
  windowOpen: boolean;
  membersEnumerated: number;
  membersConsidered: number;
  wouldSend: number;
  sent: number;
  errors: number;
  results: Array<{ memberId: string; status: MemberWeeklyMemberResultStatus }>;
}

function currentMemberBlockStatus(user: MemberWeeklyServerUser): MemberWeeklyMemberResultStatus | null {
  const publicMetadata = user.publicMetadata || {};
  const privateMetadata = user.privateMetadata || {};
  const weeklyPreference = normalizeNotificationPreferences(publicMetadata.notificationPreferences).weeklyIntelligence;
  if (!isPaidTier(publicMetadata)) return "skipped_ineligible_member";
  if (masterUnsubscribed(publicMetadata, privateMetadata)) return "skipped_master_unsubscribed";
  if (explicitOptIn(weeklyPreference)) return null;
  return weeklyPreference.unsubscribedAt
    ? "skipped_unsubscribed"
    : weeklyPreference.emailEnabled
      ? "skipped_missing_explicit_opt_in"
      : "skipped_not_opted_in";
}

export async function executeMemberWeeklyDeliveryRun(input: {
  users: MemberWeeklyServerUser[];
  now: string;
  requestLive: boolean;
  config: MemberWeeklyDeliveryConfig;
  dependencies: MemberWeeklyDeliveryRunnerDependencies;
}): Promise<MemberWeeklyDeliveryRunResult> {
  const modeDecision = resolveMemberWeeklyDeliveryMode({ requestLive: input.requestLive, config: input.config });
  const windowOpen = isMemberWeeklyDeliveryWindowOpen(input.now, input.config);
  const users = [...input.users]
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, input.config.maxMembersPerRun);
  const summary: MemberWeeklyDeliveryRunResult = {
    ok: modeDecision.mode !== "blocked",
    mode: modeDecision.mode,
    reason: modeDecision.reason,
    windowOpen,
    membersEnumerated: input.users.length,
    membersConsidered: 0,
    wouldSend: 0,
    sent: 0,
    errors: 0,
    results: [],
  };
  if (modeDecision.mode === "blocked") return summary;
  if (modeDecision.mode === "live" && !windowOpen) {
    return { ...summary, ok: false, mode: "blocked", reason: "quiet_hours_or_cadence" };
  }

  for (let batchStart = 0; batchStart < users.length; batchStart += input.config.batchSize) {
    const batch = users.slice(batchStart, batchStart + input.config.batchSize);
    for (const user of batch) {
      summary.membersConsidered += 1;
      try {
        const initialBlockStatus = currentMemberBlockStatus(user);
        if (initialBlockStatus) {
          summary.results.push({ memberId: user.id, status: initialBlockStatus });
          continue;
        }
        const prepared = await input.dependencies.prepare(user);
        const status: MemberWeeklyMemberResultStatus = prepared.dryRun.status;
        if (status !== "would_send") {
          summary.results.push({ memberId: user.id, status });
          continue;
        }
        if (await input.dependencies.recipientMasterUnsubscribed(prepared.recipient)) {
          summary.results.push({ memberId: user.id, status: "skipped_master_unsubscribed" });
          continue;
        }
        if (summary.wouldSend + summary.sent >= input.config.maxEmailsPerRun) {
          summary.results.push({ memberId: user.id, status: "blocked_run_cap" });
          continue;
        }
        if (modeDecision.mode === "dry_run") {
          summary.wouldSend += 1;
          summary.results.push({ memberId: user.id, status: "would_send" });
          continue;
        }

        const currentBeforeReservation = await input.dependencies.refreshUser(user.id);
        const preReservationBlockStatus = currentMemberBlockStatus(currentBeforeReservation);
        if (preReservationBlockStatus) {
          summary.results.push({ memberId: user.id, status: preReservationBlockStatus });
          continue;
        }

        const reservedAt = new Date(input.now).toISOString();
        const reservation: MemberWeeklyDeliveryLedgerEntry = {
          memberId: user.id,
          weekKey: prepared.report.weekKey,
          dedupeKey: prepared.dryRun.dedupeKey,
          status: "reserved",
          reservedAt,
          deliveredAt: null,
          providerMessageId: null,
        };
        const reserved = await input.dependencies.reserveMemberWeek(currentBeforeReservation, reservation);
        if (!reserved) {
          summary.results.push({ memberId: user.id, status: "reserved_elsewhere" });
          continue;
        }
        if (await input.dependencies.recipientMasterUnsubscribed(prepared.recipient)) {
          summary.results.push({ memberId: user.id, status: "skipped_master_unsubscribed" });
          continue;
        }
        const currentBeforeSend = await input.dependencies.refreshUser(user.id);
        const preSendBlockStatus = currentMemberBlockStatus(currentBeforeSend);
        if (preSendBlockStatus) {
          summary.results.push({ memberId: user.id, status: preSendBlockStatus });
          continue;
        }
        const sent = await input.dependencies.send(prepared, { idempotencyKey: `member-weekly-${reservation.dedupeKey}` });
        await input.dependencies.markMemberWeekDelivered(user, {
          ...reservation,
          status: "delivered",
          deliveredAt: new Date(input.now).toISOString(),
          providerMessageId: sent.messageId,
        });
        summary.sent += 1;
        summary.results.push({ memberId: user.id, status: "sent" });
        if (input.config.minSendIntervalMs > 0 && summary.sent < input.config.maxEmailsPerRun) {
          await input.dependencies.sleep(input.config.minSendIntervalMs);
        }
      } catch {
        summary.errors += 1;
        summary.results.push({ memberId: user.id, status: "error" });
      }
    }
    if (modeDecision.mode === "live" && input.config.batchPauseMs > 0 && batchStart + input.config.batchSize < users.length) {
      await input.dependencies.sleep(input.config.batchPauseMs);
    }
  }
  summary.ok = summary.errors === 0;
  return summary;
}
