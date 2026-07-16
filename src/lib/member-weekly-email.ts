import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { MemberWeeklyIntelligence } from "./member-weekly-intelligence.ts";
import type { WeeklyIntelligencePreference } from "./notification-preferences.ts";

export const MEMBER_WEEKLY_LIVE_SEND_SUPPORTED = false as const;

export type MemberWeeklyDryRunStatus =
  | "would_send"
  | "skipped_not_opted_in"
  | "skipped_unsubscribed"
  | "skipped_suppressed"
  | "skipped_member_week_duplicate"
  | "skipped_empty_week"
  | "skipped_invalid_recipient"
  | "blocked_kill_switch";

export interface MemberWeeklySuppression {
  suppressed: boolean;
  deliveredMemberWeeks: string[];
}

export interface MemberWeeklyDryRun {
  mode: "dry_run";
  status: MemberWeeklyDryRunStatus;
  memberId: string;
  recipient: string;
  weekKey: string;
  dedupeKey: string;
  sendAttempted: false;
  liveSendSupported: false;
  previewAvailable: boolean;
}

export function buildMemberWeekDedupeKey(memberId: string, weekKey: string) {
  return createHash("sha256").update(`${memberId.trim()}:${weekKey.trim()}`).digest("hex").slice(0, 32);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function buildWeeklyIntelligenceDryRun(input: {
  memberId: string;
  recipient: string;
  report: MemberWeeklyIntelligence;
  preferences: WeeklyIntelligencePreference;
  suppression: MemberWeeklySuppression;
  killSwitchActive: boolean;
}): MemberWeeklyDryRun {
  const dedupeKey = buildMemberWeekDedupeKey(input.memberId, input.report.weekKey);
  let status: MemberWeeklyDryRunStatus = "would_send";

  if (!input.preferences.emailEnabled) status = "skipped_not_opted_in";
  else if (input.preferences.unsubscribedAt) status = "skipped_unsubscribed";
  else if (input.suppression.suppressed) status = "skipped_suppressed";
  else if (input.report.isEmpty) status = "skipped_empty_week";
  else if (input.suppression.deliveredMemberWeeks.includes(dedupeKey)) status = "skipped_member_week_duplicate";
  else if (!validEmail(input.recipient)) status = "skipped_invalid_recipient";
  else if (input.killSwitchActive) status = "blocked_kill_switch";

  return {
    mode: "dry_run",
    status,
    memberId: input.memberId,
    recipient: input.recipient.trim().toLowerCase(),
    weekKey: input.report.weekKey,
    dedupeKey,
    sendAttempted: false,
    liveSendSupported: MEMBER_WEEKLY_LIVE_SEND_SUPPORTED,
    previewAvailable: !input.report.isEmpty,
  };
}

export function weeklyIntelligenceEmailKillSwitchActive(env: NodeJS.ProcessEnv = process.env) {
  return env.WEEKLY_INTELLIGENCE_EMAIL_KILL_SWITCH !== "0";
}

export function weeklyIntelligenceUnsubscribeSecret(env: NodeJS.ProcessEnv = process.env) {
  return env.WEEKLY_INTELLIGENCE_UNSUBSCRIBE_SECRET || env.NEWSLETTER_UNSUBSCRIBE_SECRET || env.RESEND_API_KEY || "";
}

export function signWeeklyIntelligenceUnsubscribe(memberId: string, secret: string) {
  if (!memberId.trim() || !secret) return "";
  return createHmac("sha256", secret).update(`weekly-intelligence:${memberId.trim()}`).digest("hex");
}

export function verifyWeeklyIntelligenceUnsubscribe(memberId: string, signature: string, secret: string) {
  const expected = signWeeklyIntelligenceUnsubscribe(memberId, secret);
  if (!expected || !signature) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function weeklyIntelligenceUnsubscribeUrl(input: {
  memberId: string;
  baseUrl?: string;
  secret?: string;
}) {
  const baseUrl = (input.baseUrl || process.env.NEXT_PUBLIC_APP_URL || "https://www.bourbonsignal.com").replace(/\/$/, "");
  const secret = input.secret ?? weeklyIntelligenceUnsubscribeSecret();
  const params = new URLSearchParams({
    member: input.memberId,
    sig: signWeeklyIntelligenceUnsubscribe(input.memberId, secret),
  });
  return `${baseUrl}/weekly-intelligence/unsubscribe?${params.toString()}`;
}
