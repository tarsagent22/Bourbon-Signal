export type RetailerVerificationStatus = "not_started" | "pending" | "verified" | "rejected";
export type RetailerSubmissionStatus = "pending_review" | "reviewed" | "rejected";
export type RetailerSubmissionKind = "bottle_drop" | "barrel_pick" | "tasting" | "lottery" | "other";

export interface RetailerApplication {
  storeName: string;
  storeAddress: string;
  website: string;
  listedPhone: string;
  applicantRole: string;
}

export interface RetailerSubmission {
  id?: string;
  kind: RetailerSubmissionKind;
  title: string;
  locationDetails: string;
  price: string;
  availability: string;
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

export function safeRetailerRedirect(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/retailers/portal";
  const path = value.split("#", 1)[0];
  return /^\/retailers\/(?:portal|onboarding)(?:[/?]|$)/.test(path) ? path : "/retailers/portal";
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

export function normalizeRetailerStatus(value: unknown): RetailerVerificationStatus {
  return value === "pending" || value === "verified" || value === "rejected" ? value : "not_started";
}

export function normalizeRetailerSubmission(input: unknown): Result<RetailerSubmission> {
  const row = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const allowedKinds = new Set<RetailerSubmissionKind>(["bottle_drop", "barrel_pick", "tasting", "lottery", "other"]);
  const kind = text(row.kind, 40) as RetailerSubmissionKind;
  const value: RetailerSubmission = {
    kind: allowedKinds.has(kind) ? kind : "other",
    title: text(row.title, 160),
    locationDetails: text(row.locationDetails, 180),
    price: text(row.price, 40),
    availability: text(row.availability, 100),
    notes: text(row.notes, 1_000),
    expiresAt: text(row.expiresAt, 40),
    status: "reviewed",
  };
  if (!value.title) return { ok: false, error: "A bottle, event, or promotion title is required." };
  return { ok: true, value };
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
