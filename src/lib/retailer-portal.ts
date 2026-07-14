import { normalizeRetailerTimeZone, zonedLocalDateTimeToIso, type RetailerTimeZone } from "./retailer-time-zone.ts";

export type RetailerVerificationStatus = "not_started" | "pending" | "verified" | "rejected";
export type RetailerSubmissionStatus = "pending_review" | "reviewed" | "rejected";
export type RetailerSubmissionKind = "bottle_drop" | "barrel_pick" | "tasting" | "lottery" | "other";
export type RetailerAvailabilityTiming = "now" | "scheduled";
export type RetailerSubmissionLifecycle = "upcoming" | "live" | "ended" | "submitted";
export const CURRENT_RETAILER_TERMS_VERSION = "2026-07-01";

export interface RetailerTermsAcceptance {
  termsVersion: typeof CURRENT_RETAILER_TERMS_VERSION;
}

export interface RetailerApplication {
  storeName: string;
  storeAddress: string;
  website: string;
  listedPhone: string;
  applicantRole: string;
}

export interface RetailerStore {
  storeName: string;
  storeAddress: string;
  website: string;
  listedPhone: string;
}

export interface RetailerSubmission {
  id?: string;
  storeId: string;
  kind: RetailerSubmissionKind;
  bottleId: string;
  title: string;
  locationDetails: string;
  price: string;
  availability: string;
  availabilityTiming: RetailerAvailabilityTiming | "";
  startsAt: string;
  soldOutAt: string;
  timeZone: RetailerTimeZone | "";
  notes: string;
  expiresAt: string;
  status: RetailerSubmissionStatus;
  createdAt?: string;
  reviewedAt?: string;
}

export interface RetailerAccountNotification {
  to: "chandler@bourbonsignal.com";
  replyTo: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}

export interface RetailerDecisionNotification {
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}

type Result<T> = { ok: true; value: T; error?: never } | { ok: false; value?: never; error: string };

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validHttpUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parsedDate(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isAvailabilityKind(kind: RetailerSubmissionKind) {
  return kind === "bottle_drop" || kind === "barrel_pick";
}

const RETAILER_SIGNAL_FRESHNESS_MS = 24 * 60 * 60 * 1_000;

export function safeRetailerRedirect(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/retailers/portal";
  const path = value.split("#", 1)[0];
  return /^\/retailers\/(?:portal|onboarding)(?:[/?]|$)/.test(path) ? path : "/retailers/portal";
}

export function normalizeRetailerTermsAcceptance(input: unknown): Result<RetailerTermsAcceptance> {
  const row = input && typeof input === "object" ? input as Record<string, unknown> : {};
  if (text(row.termsAccepted, 20) !== "yes" || text(row.termsVersion, 40) !== CURRENT_RETAILER_TERMS_VERSION) {
    return { ok: false, error: "Read the retailer terms and select I understand to continue." };
  }
  return { ok: true, value: { termsVersion: CURRENT_RETAILER_TERMS_VERSION } };
}

export function normalizeRetailerApplication(input: unknown): Result<RetailerApplication> {
  const row = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const value: RetailerApplication = {
    storeName: text(row.storeName, 120),
    storeAddress: text(row.storeAddress, 240),
    website: text(row.website, 240),
    listedPhone: text(row.listedPhone, 40),
    applicantRole: text(row.applicantRole, 80),
  };
  if (!value.storeName) return { ok: false, error: "Store name is required." };
  if (!value.storeAddress) return { ok: false, error: "Store address is required." };
  if (!value.listedPhone) return { ok: false, error: "The store's publicly listed phone is required." };
  if (!value.applicantRole) return { ok: false, error: "Your role at the store is required." };
  if (!validHttpUrl(value.website)) return { ok: false, error: "Website must be a valid http or https URL." };
  return { ok: true, value };
}

export function normalizeRetailerStore(input: unknown): Result<RetailerStore> {
  const row = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const value: RetailerStore = {
    storeName: text(row.storeName, 120),
    storeAddress: text(row.storeAddress, 240),
    website: text(row.website, 240),
    listedPhone: text(row.listedPhone, 40),
  };
  if (!value.storeName) return { ok: false, error: "Store name is required." };
  if (!value.storeAddress) return { ok: false, error: "Store address is required." };
  if (!value.listedPhone) return { ok: false, error: "The store's publicly listed phone is required." };
  if (!validHttpUrl(value.website)) return { ok: false, error: "Website must be a valid http or https URL." };
  return { ok: true, value };
}

export function normalizeRetailerStatus(value: unknown): RetailerVerificationStatus {
  return value === "pending" || value === "verified" || value === "rejected" ? value : "not_started";
}

export function normalizeRetailerSubmission(input: unknown, now = new Date()): Result<RetailerSubmission> {
  const row = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const allowedKinds = new Set<RetailerSubmissionKind>(["bottle_drop", "barrel_pick", "tasting", "lottery", "other"]);
  const requestedKind = text(row.kind, 40) as RetailerSubmissionKind;
  const kind = allowedKinds.has(requestedKind) ? requestedKind : "other";
  const supportsTiming = isAvailabilityKind(kind);
  const requestedTiming = text(row.availabilityTiming, 20);
  const availabilityTiming: RetailerAvailabilityTiming | "" = supportsTiming
    ? requestedTiming === "scheduled" ? "scheduled" : "now"
    : "";
  const nowDate = Number.isNaN(now.getTime()) ? new Date() : now;
  const requestedTimeZone = text(row.timeZone, 64);
  const timeZone = requestedTimeZone ? normalizeRetailerTimeZone(requestedTimeZone) : "";
  const requestedStart = text(row.startsAt, 40);
  const requestedEnd = text(row.expiresAt, 40);
  const usesLocalDateTime = [requestedStart, requestedEnd].some((value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value));
  if (usesLocalDateTime && !timeZone) return { ok: false, error: "Choose your store time zone." };
  const conversionTimeZone = timeZone || "America/New_York";

  let startsAt = "";
  let expiresAt = requestedEnd;
  if (supportsTiming) {
    const startDate = availabilityTiming === "scheduled"
      ? parsedDate(zonedLocalDateTimeToIso(requestedStart, conversionTimeZone) || "")
      : nowDate;
    if (!startDate) return { ok: false, error: "Choose a valid go-live date and time." };
    if (availabilityTiming === "scheduled" && startDate.getTime() <= nowDate.getTime()) {
      return { ok: false, error: "Scheduled availability must use a future go-live date and time." };
    }
    startsAt = startDate.toISOString();
    const endDate = requestedEnd
      ? parsedDate(zonedLocalDateTimeToIso(requestedEnd, conversionTimeZone) || "")
      : new Date(startDate.getTime() + RETAILER_SIGNAL_FRESHNESS_MS);
    if (!endDate) return { ok: false, error: "Choose a valid availability end date and time." };
    if (endDate.getTime() <= startDate.getTime()) {
      return { ok: false, error: "Availability must end after it goes live." };
    }
    expiresAt = endDate.toISOString();
  } else if (requestedEnd) {
    expiresAt = zonedLocalDateTimeToIso(requestedEnd, conversionTimeZone) || requestedEnd;
  }

  const value: RetailerSubmission = {
    storeId: text(row.storeId, 160),
    kind,
    bottleId: kind === "bottle_drop" || kind === "barrel_pick" || kind === "lottery" ? text(row.bottleId, 120) : "",
    title: text(row.title, 160),
    locationDetails: text(row.locationDetails, 180),
    price: kind === "other" ? "" : text(row.price, 40),
    availability: kind === "other" ? "" : text(row.availability, 100),
    availabilityTiming,
    startsAt,
    soldOutAt: "",
    timeZone,
    notes: text(row.notes, 1_000),
    expiresAt,
    status: "reviewed",
  };
  if (!value.storeId) return { ok: false, error: "Choose the store for this signal." };
  if (!value.title) return { ok: false, error: "A bottle, event, or promotion title is required." };
  if (value.kind === "tasting" && !value.expiresAt) return { ok: false, error: "An event date and time is required for tastings." };
  if (value.kind === "lottery" && !value.expiresAt) return { ok: false, error: "An entry deadline is required for lotteries." };
  if (value.kind === "tasting" && !parsedDate(value.expiresAt)) return { ok: false, error: "Enter a valid event date and time." };
  if (value.kind === "lottery" && !parsedDate(value.expiresAt)) return { ok: false, error: "Enter a valid entry deadline." };
  if (!supportsTiming && value.expiresAt) value.expiresAt = parsedDate(value.expiresAt)?.toISOString() || value.expiresAt;
  return { ok: true, value };
}

export function retailerSubmissionLifecycle(
  submission: Pick<RetailerSubmission, "kind" | "startsAt" | "expiresAt" | "soldOutAt">,
  now = new Date(),
): RetailerSubmissionLifecycle {
  if (!isAvailabilityKind(submission.kind)) return "submitted";
  if (!submission.startsAt || !submission.expiresAt) return "ended";
  if (submission.soldOutAt) return "ended";
  const nowMs = now.getTime();
  const startsAt = parsedDate(submission.startsAt)?.getTime();
  const expiresAt = parsedDate(submission.expiresAt)?.getTime();
  if (expiresAt !== undefined && expiresAt !== null && expiresAt <= nowMs) return "ended";
  if (startsAt !== undefined && startsAt !== null && startsAt > nowMs) return "upcoming";
  return "live";
}

export function buildRetailerAccountNotification(input: {
  userId: string;
  email: string;
  firstName?: string | null;
  application: RetailerApplication;
}): RetailerAccountNotification {
  const applicant = input.firstName?.trim() || "A retailer";
  return {
    to: "chandler@bourbonsignal.com",
    replyTo: input.email,
    subject: `New retailer account: ${input.application.storeName}`,
    idempotencyKey: `retailer-account-created-${input.userId}`,
    text: [
      `${applicant} created a retailer account on Bourbon Signal.`,
      "",
      `Store: ${input.application.storeName}`,
      `Address: ${input.application.storeAddress}`,
      `Website: ${input.application.website || "Not provided"}`,
      `Public phone: ${input.application.listedPhone}`,
      `Applicant role: ${input.application.applicantRole}`,
      `Account email: ${input.email}`,
      `Clerk user: ${input.userId}`,
      "",
      "The account is pending. Verify the applicant through a phone number or business email sourced independently before approving access.",
      "Review: https://www.bourbonsignal.com/admin/retailers",
    ].join("\n"),
  };
}

export function buildRetailerDecisionNotification(input: {
  userId: string;
  email: string;
  firstName?: string | null;
  storeName: string;
  status: "verified" | "rejected";
  decisionAt: string;
}): RetailerDecisionNotification {
  const approved = input.status === "verified";
  const greeting = input.firstName?.trim() ? `Hi ${input.firstName.trim()},` : "Hello,";
  const appUrl = "https://www.bourbonsignal.com";
  return {
    to: input.email.trim().toLowerCase(),
    replyTo: "support@bourbonsignal.com",
    subject: approved
      ? `Your Bourbon Signal retailer account is approved — ${input.storeName}`
      : `Your Bourbon Signal retailer account was not approved — ${input.storeName}`,
    idempotencyKey: `retailer-decision-${input.userId}-${input.status}-${input.decisionAt}`,
    text: approved
      ? [
          greeting,
          "",
          `Your retailer account for ${input.storeName} is approved.`,
          "You can now submit bottle availability, barrel picks, tastings, and lotteries directly to Bourbon Signal.",
          "",
          `Open the retailer portal: ${appUrl}/retailers/portal`,
          "",
          "Bourbon Signal Retailer Support",
        ].join("\n")
      : [
          greeting,
          "",
          `We could not approve the retailer account request for ${input.storeName}.`,
          "If the store or contact details need to be corrected, reply to this email and we will help review the request.",
          "",
          "Bourbon Signal Retailer Support",
        ].join("\n"),
  };
}
