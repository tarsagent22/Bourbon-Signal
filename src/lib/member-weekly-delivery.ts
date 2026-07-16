import { timingSafeEqual } from "node:crypto";
import {
  weeklyIntelligenceExplicitlyEnabled,
  type WeeklyIntelligencePreference,
} from "./notification-preferences.ts";

type UnknownRecord = Record<string, unknown>;

export type MemberWeeklyDeliveryBlockReason =
  | "kill_switch"
  | "delivery_disabled"
  | "live_not_supported"
  | "live_not_authorized";

export interface MemberWeeklyDeliveryConfig {
  killSwitchActive: boolean;
  deliveryEnabled: boolean;
  liveSendSupported: boolean;
  liveSendAuthorized: boolean;
  timeZone: string;
  deliveryWeekday: number;
  startHour: number;
  endHour: number;
  maxEmailsPerRun: number;
  maxMembersPerRun: number;
  batchSize: number;
  minSendIntervalMs: number;
  batchPauseMs: number;
  reservationTtlMinutes: number;
}

export interface MemberWeeklyDeliveryLedgerEntry {
  memberId: string;
  weekKey: string;
  dedupeKey: string;
  status: "reserved" | "delivered";
  reservedAt: string;
  deliveredAt: string | null;
  providerMessageId: string | null;
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

export function buildMemberWeeklyDeliveryConfig(env: NodeJS.ProcessEnv = process.env): MemberWeeklyDeliveryConfig {
  return {
    killSwitchActive: env.WEEKLY_INTELLIGENCE_EMAIL_KILL_SWITCH !== "0",
    deliveryEnabled: env.WEEKLY_INTELLIGENCE_DELIVERY_ENABLED === "1",
    liveSendSupported: env.WEEKLY_INTELLIGENCE_LIVE_SEND_SUPPORTED === "1",
    liveSendAuthorized: env.WEEKLY_INTELLIGENCE_LIVE_SEND_AUTHORIZED === "1",
    timeZone: env.WEEKLY_INTELLIGENCE_DELIVERY_TIME_ZONE || "America/New_York",
    deliveryWeekday: boundedInteger(env.WEEKLY_INTELLIGENCE_DELIVERY_WEEKDAY, 4, 0, 6),
    startHour: boundedInteger(env.WEEKLY_INTELLIGENCE_DELIVERY_START_HOUR, 9, 0, 23),
    endHour: boundedInteger(env.WEEKLY_INTELLIGENCE_DELIVERY_END_HOUR, 17, 1, 24),
    maxEmailsPerRun: boundedInteger(env.WEEKLY_INTELLIGENCE_MAX_EMAILS_PER_RUN, 25, 1, 500),
    maxMembersPerRun: boundedInteger(env.WEEKLY_INTELLIGENCE_MAX_MEMBERS_PER_RUN, 1000, 1, 10_000),
    batchSize: boundedInteger(env.WEEKLY_INTELLIGENCE_BATCH_SIZE, 25, 1, 100),
    minSendIntervalMs: boundedInteger(env.WEEKLY_INTELLIGENCE_MIN_SEND_INTERVAL_MS, 600, 0, 60_000),
    batchPauseMs: boundedInteger(env.WEEKLY_INTELLIGENCE_BATCH_PAUSE_MS, 1_000, 0, 60_000),
    reservationTtlMinutes: boundedInteger(env.WEEKLY_INTELLIGENCE_RESERVATION_TTL_MINUTES, 1_440, 5, 10_080),
  };
}

export function resolveMemberWeeklyDeliveryMode(input: {
  requestLive: boolean;
  config: MemberWeeklyDeliveryConfig;
}): { mode: "dry_run" | "live" | "blocked"; reason: MemberWeeklyDeliveryBlockReason | null } {
  if (!input.requestLive) return { mode: "dry_run", reason: null };
  if (input.config.killSwitchActive) return { mode: "blocked", reason: "kill_switch" };
  if (!input.config.deliveryEnabled) return { mode: "blocked", reason: "delivery_disabled" };
  if (!input.config.liveSendSupported) return { mode: "blocked", reason: "live_not_supported" };
  if (!input.config.liveSendAuthorized) return { mode: "blocked", reason: "live_not_authorized" };
  return { mode: "live", reason: null };
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function isMemberWeeklyDeliveryWindowOpen(now: string, config: MemberWeeklyDeliveryConfig) {
  const timestamp = Date.parse(now);
  if (!Number.isFinite(timestamp) || config.endHour <= config.startHour) return false;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: config.timeZone,
      weekday: "short",
      hour: "numeric",
      hourCycle: "h23",
    }).formatToParts(new Date(timestamp));
    const weekday = WEEKDAY_INDEX[parts.find((part) => part.type === "weekday")?.value || ""];
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    return weekday === config.deliveryWeekday && Number.isInteger(hour) && hour >= config.startHour && hour < config.endHour;
  } catch {
    return false;
  }
}

export function explicitOptIn(preference: WeeklyIntelligencePreference) {
  return weeklyIntelligenceExplicitlyEnabled(preference);
}

export function masterUnsubscribed(publicMetadata: unknown, privateMetadata: unknown) {
  const publicRecord = record(publicMetadata);
  const privateRecord = record(privateMetadata);
  const notifications = record(publicRecord.notificationPreferences);
  const email = record(notifications.email);
  const communications = record(publicRecord.communications);
  const suppression = record(privateRecord.emailSuppression);
  const weeklyDelivery = record(privateRecord.weeklyIntelligenceDelivery);
  return email.masterUnsubscribed === true
    || Boolean(text(email.unsubscribedAt))
    || Boolean(text(notifications.masterEmailUnsubscribedAt))
    || Boolean(text(communications.emailUnsubscribedAt))
    || suppression.suppressed === true
    || Boolean(text(suppression.suppressedAt))
    || weeklyDelivery.suppressed === true
    || Boolean(text(weeklyDelivery.suppressedAt));
}

export function normalizeMemberWeeklyDeliveryLedger(input: unknown): MemberWeeklyDeliveryLedgerEntry[] {
  const rows = Array.isArray(input) ? input : Array.isArray(record(input).deliveries) ? record(input).deliveries as unknown[] : [];
  const normalized = rows.flatMap((value) => {
    const row = record(value);
    const memberId = text(row.memberId);
    const weekKey = text(row.weekKey);
    const dedupeKey = text(row.dedupeKey);
    const reservedAt = text(row.reservedAt);
    const status = row.status === "delivered" ? "delivered" : row.status === "reserved" ? "reserved" : null;
    if (!memberId || !weekKey || !dedupeKey || !reservedAt || !status) return [];
    return [{
      memberId,
      weekKey,
      dedupeKey,
      status,
      reservedAt,
      deliveredAt: text(row.deliveredAt) || null,
      providerMessageId: text(row.providerMessageId) || null,
    } satisfies MemberWeeklyDeliveryLedgerEntry];
  });
  return normalized
    .filter((entry, index, entries) => entries.findIndex((candidate) => candidate.dedupeKey === entry.dedupeKey) === index)
    .sort((left, right) => right.weekKey.localeCompare(left.weekKey) || right.reservedAt.localeCompare(left.reservedAt) || left.dedupeKey.localeCompare(right.dedupeKey))
    .slice(0, 52);
}

export function upsertMemberWeeklyDeliveryLedger(
  ledger: MemberWeeklyDeliveryLedgerEntry[],
  entry: MemberWeeklyDeliveryLedgerEntry,
) {
  return normalizeMemberWeeklyDeliveryLedger([entry, ...ledger.filter((candidate) => candidate.dedupeKey !== entry.dedupeKey)]);
}

export function memberWeekReservationActive(entry: MemberWeeklyDeliveryLedgerEntry, now: string, ttlMinutes: number) {
  if (entry.status === "delivered") return true;
  const reservedAt = Date.parse(entry.reservedAt);
  const nowTime = Date.parse(now);
  return Number.isFinite(reservedAt) && Number.isFinite(nowTime) && nowTime - reservedAt < ttlMinutes * 60_000;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function assertMemberWeeklyDeliveryAuthorized(request: Request, env: NodeJS.ProcessEnv = process.env) {
  const expected = env.WEEKLY_INTELLIGENCE_DELIVERY_SECRET || env.CRON_SECRET || "";
  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : request.headers.get("x-weekly-delivery-secret")?.trim() || "";
  if (!expected || !supplied || !safeEqual(expected, supplied)) throw new Error("Unauthorized weekly delivery request");
}
