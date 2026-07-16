import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { MemberWeeklyIntelligence } from "./member-weekly-intelligence.ts";
import type { WeeklyIntelligencePreference } from "./notification-preferences.ts";

export const MEMBER_WEEKLY_UNSUBSCRIBE_PURPOSE = "weekly-intelligence-unsubscribe";
export const MEMBER_WEEKLY_UNSUBSCRIBE_VERSION = "1";
export const MEMBER_WEEKLY_LIVE_SEND_SUPPORTED = process.env.WEEKLY_INTELLIGENCE_LIVE_SEND_SUPPORTED === "1";
const MEMBER_WEEKLY_UNSUBSCRIBE_TTL_DAYS = 90;

export type MemberWeeklyDryRunStatus =
  | "would_send"
  | "skipped_not_opted_in"
  | "skipped_missing_explicit_opt_in"
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
  liveSendSupported: boolean;
  liveDeliveryAuthorized: boolean;
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
  else if (!input.preferences.optedInAt || !Number.isFinite(Date.parse(input.preferences.optedInAt))) status = "skipped_missing_explicit_opt_in";
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
    liveDeliveryAuthorized: MEMBER_WEEKLY_LIVE_SEND_SUPPORTED
      && process.env.WEEKLY_INTELLIGENCE_DELIVERY_ENABLED === "1"
      && process.env.WEEKLY_INTELLIGENCE_LIVE_SEND_AUTHORIZED === "1"
      && !input.killSwitchActive,
    previewAvailable: !input.report.isEmpty,
  };
}

export function weeklyIntelligenceEmailKillSwitchActive(env: NodeJS.ProcessEnv = process.env) {
  return env.WEEKLY_INTELLIGENCE_EMAIL_KILL_SWITCH !== "0";
}

export function weeklyIntelligenceUnsubscribeSecret(env: NodeJS.ProcessEnv = process.env) {
  return env.WEEKLY_INTELLIGENCE_UNSUBSCRIBE_SECRET || env.NEWSLETTER_UNSUBSCRIBE_SECRET || "";
}

export function signWeeklyIntelligenceUnsubscribe(input: {
  memberId: string;
  issuedAt: string;
  expiresAt: string;
  secret: string;
  purpose?: string;
  version?: string;
}) {
  const memberId = input.memberId.trim();
  const purpose = input.purpose || MEMBER_WEEKLY_UNSUBSCRIBE_PURPOSE;
  const version = input.version || MEMBER_WEEKLY_UNSUBSCRIBE_VERSION;
  if (!memberId || !input.secret || !Number.isFinite(Date.parse(input.issuedAt)) || !Number.isFinite(Date.parse(input.expiresAt))) return "";
  return createHmac("sha256", input.secret).update(`${purpose}:${version}:${memberId}:${input.issuedAt}:${input.expiresAt}`).digest("hex");
}

export function verifyWeeklyIntelligenceUnsubscribe(input: {
  memberId: string;
  issuedAt: string;
  expiresAt: string;
  signature: string;
  secret: string;
  now?: string;
  purpose?: string;
  version?: string;
}) {
  const purpose = input.purpose ?? MEMBER_WEEKLY_UNSUBSCRIBE_PURPOSE;
  const version = input.version ?? MEMBER_WEEKLY_UNSUBSCRIBE_VERSION;
  if (purpose !== MEMBER_WEEKLY_UNSUBSCRIBE_PURPOSE || version !== MEMBER_WEEKLY_UNSUBSCRIBE_VERSION) return false;
  const issuedAt = Date.parse(input.issuedAt);
  const expiresAt = Date.parse(input.expiresAt);
  const now = Date.parse(input.now || new Date().toISOString());
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || !Number.isFinite(now) || issuedAt > now || expiresAt <= now || expiresAt <= issuedAt) return false;
  const expected = signWeeklyIntelligenceUnsubscribe({
    memberId: input.memberId,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    secret: input.secret,
    purpose,
    version,
  });
  if (!expected || !input.signature) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(input.signature);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function weeklyIntelligenceUnsubscribeUrl(input: {
  memberId: string;
  baseUrl?: string;
  secret?: string;
  now?: string;
  expiresAt?: string;
}) {
  const baseUrl = (input.baseUrl || process.env.NEXT_PUBLIC_APP_URL || "https://www.bourbonsignal.com").replace(/\/$/, "");
  const secret = input.secret ?? weeklyIntelligenceUnsubscribeSecret();
  const now = new Date(input.now || new Date().toISOString());
  const issuedAt = now.toISOString();
  const expiresAt = input.expiresAt || new Date(now.getTime() + MEMBER_WEEKLY_UNSUBSCRIBE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    member: input.memberId,
    purpose: MEMBER_WEEKLY_UNSUBSCRIBE_PURPOSE,
    v: MEMBER_WEEKLY_UNSUBSCRIBE_VERSION,
    iat: issuedAt,
    exp: expiresAt,
    sig: signWeeklyIntelligenceUnsubscribe({ memberId: input.memberId, issuedAt, expiresAt, secret }),
  });
  return `${baseUrl}/weekly-intelligence/unsubscribe?${params.toString()}`;
}
