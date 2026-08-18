import { timingSafeEqual } from "node:crypto";
import { getEntitlements } from "./entitlements";
import { masterUnsubscribed } from "./member-weekly-delivery";
import { membershipTrialEligibility } from "./membership-trial";

export const FREE_MEMBER_DAY_TWO_CAMPAIGN_ID = "free-member-day-two-trial-v2";
export const FREE_MEMBER_DAY_TWO_SUBJECT = "Try Bourbon Signal free for 7 days";
export const FREE_MEMBER_DAY_TWO_PREHEADER = "Try the full Drop Feed, personalized alerts, watchlists, and member tools free for 7 days.";
// Copy approved after Gmail-draft review and local desktop/mobile rendering. Runtime flags,
// suppression, current eligibility, and idempotency still gate every live provider call.
export const FREE_MEMBER_DAY_TWO_LIVE_SEND_SUPPORTED = true;

export interface FreeMemberDayTwoUser {
  id: string;
  createdAt: string | number | Date;
  firstName?: string | null;
  publicMetadata?: Record<string, unknown>;
  privateMetadata?: Record<string, unknown>;
  unsafeMetadata?: Record<string, unknown>;
  banned?: boolean;
  locked?: boolean;
}

export interface FreeMemberDayTwoConfig {
  killSwitchActive: boolean;
  deliveryEnabled: boolean;
  liveSendAuthorized: boolean;
  liveSendSupported: boolean;
  providerSuppressionConfigured: boolean;
  maxEmailsPerRun: number;
  maxMembersPerRun: number;
  reservationTtlMinutes: number;
}

export type FreeMemberDayTwoCandidateStatus =
  | "eligible"
  | "skipped_not_free"
  | "skipped_operational_account"
  | "skipped_disabled_account"
  | "skipped_trial_or_paid_history"
  | "skipped_unsubscribed"
  | "skipped_already_delivered"
  | "skipped_reserved"
  | "skipped_not_due";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

export function buildFreeMemberDayTwoConfig(env: NodeJS.ProcessEnv = process.env): FreeMemberDayTwoConfig {
  return {
    killSwitchActive: env.FREE_MEMBER_DAY_TWO_EMAIL_KILL_SWITCH !== "0",
    deliveryEnabled: env.FREE_MEMBER_DAY_TWO_DELIVERY_ENABLED === "1",
    liveSendAuthorized: env.FREE_MEMBER_DAY_TWO_LIVE_SEND_AUTHORIZED === "1",
    liveSendSupported: FREE_MEMBER_DAY_TWO_LIVE_SEND_SUPPORTED,
    providerSuppressionConfigured: Boolean((env.RESEND_DIGEST_AUDIENCE_ID || env.NEWSLETTER_AUDIENCE_ID)?.trim()),
    maxEmailsPerRun: boundedInteger(env.FREE_MEMBER_DAY_TWO_MAX_EMAILS_PER_RUN, 25, 1, 250),
    maxMembersPerRun: boundedInteger(env.FREE_MEMBER_DAY_TWO_MAX_MEMBERS_PER_RUN, 1000, 1, 10_000),
    reservationTtlMinutes: boundedInteger(env.FREE_MEMBER_DAY_TWO_RESERVATION_TTL_MINUTES, 10, 5, 1_440),
  };
}

export function resolveFreeMemberDayTwoDeliveryMode(input: { requestLive: boolean; config: FreeMemberDayTwoConfig }) {
  if (!input.requestLive) return { mode: "dry_run" as const, reason: null };
  if (!input.config.liveSendSupported) return { mode: "blocked" as const, reason: "live_not_supported" as const };
  if (input.config.killSwitchActive) return { mode: "blocked" as const, reason: "kill_switch" as const };
  if (!input.config.deliveryEnabled) return { mode: "blocked" as const, reason: "delivery_disabled" as const };
  if (!input.config.liveSendAuthorized) return { mode: "blocked" as const, reason: "live_not_authorized" as const };
  if (!input.config.providerSuppressionConfigured) return { mode: "blocked" as const, reason: "suppression_unavailable" as const };
  return { mode: "live" as const, reason: null };
}

export function isFreeMemberDayTwoWindow(input: { createdAt: string | number | Date; now: string | number | Date }) {
  const createdAt = new Date(input.createdAt).getTime();
  const now = new Date(input.now).getTime();
  if (!Number.isFinite(createdAt) || !Number.isFinite(now)) return false;
  const ageMs = now - createdAt;
  return ageMs >= 24 * 60 * 60_000 && ageMs < 48 * 60 * 60_000;
}

export function evaluateFreeMemberDayTwoCandidate(input: {
  user: FreeMemberDayTwoUser;
  now: string;
  reservationTtlMinutes?: number;
}): FreeMemberDayTwoCandidateStatus {
  const publicMetadata = record(input.user.publicMetadata);
  const privateMetadata = record(input.user.privateMetadata);
  const unsafeMetadata = record(input.user.unsafeMetadata);
  if (getEntitlements(publicMetadata).tier !== "free") return "skipped_not_free";
  if (!membershipTrialEligibility("standard_monthly", publicMetadata, privateMetadata).eligible) {
    return "skipped_trial_or_paid_history";
  }
  if (input.user.banned || input.user.locked) return "skipped_disabled_account";
  const accountType = String(unsafeMetadata.accountType || publicMetadata.accountType || "").toLowerCase();
  const role = String(publicMetadata.role || unsafeMetadata.role || "").toLowerCase();
  if (["retailer", "vendor", "admin", "owner"].includes(accountType) || ["retailer", "vendor", "admin", "owner"].includes(role)) {
    return "skipped_operational_account";
  }
  if (masterUnsubscribed(publicMetadata, privateMetadata)) return "skipped_unsubscribed";
  const delivery = record(privateMetadata.freeMemberDayTwoDelivery);
  if (delivery.status === "delivered" || typeof delivery.deliveredAt === "string") return "skipped_already_delivered";
  if (!isFreeMemberDayTwoWindow({
    createdAt: input.user.createdAt,
    now: input.now,
  })) return "skipped_not_due";
  if (delivery.status === "reserved" && typeof delivery.reservedAt === "string") {
    const reservedAt = Date.parse(delivery.reservedAt);
    const now = Date.parse(input.now);
    const ttl = (input.reservationTtlMinutes ?? 10) * 60_000;
    if (Number.isFinite(reservedAt) && Number.isFinite(now) && now - reservedAt < ttl) return "skipped_reserved";
  }
  return "eligible";
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function assertFreeMemberDayTwoDeliveryAuthorized(request: Request, env: NodeJS.ProcessEnv = process.env) {
  const expected = [env.FREE_MEMBER_DAY_TWO_DELIVERY_SECRET, env.CRON_SECRET]
    .map((value) => value?.trim() || "")
    .filter(Boolean);
  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : request.headers.get("x-free-member-day-two-secret")?.trim() || "";
  if (!expected.length || !supplied || !expected.some((value) => safeEqual(value, supplied))) {
    throw new Error("Unauthorized Day-2 delivery request");
  }
}
