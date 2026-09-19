import { timingSafeEqual } from "node:crypto";
import {
  APPLE_MEMBERSHIP_PRODUCT_IDS,
  AppleMembershipError,
  appleMembershipAccessTier,
  appleMembershipPlanForProduct,
  isAppleMembershipProductId,
  type AppleMembershipEnvironment,
  type AppleMembershipOfferState,
  type AppleMembershipSnapshot,
  type AppleMembershipStatus,
} from "./apple-membership.ts";

export type RevenueCatConfigurationBlocker =
  | "server_credentials_missing"
  | "products_not_configured"
  | "storekit_trial_policy_unconfirmed";

export type RevenueCatConfiguration =
  | { ready: false; blocker: RevenueCatConfigurationBlocker }
  | { ready: true; apiKey: string; webhookSecret: string };

type Environment = Record<string, string | undefined>;
type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const text = stringValue(value);
  if (!text || !Number.isFinite(Date.parse(text))) {
    throw new AppleMembershipError("PROVIDER_RESPONSE_INVALID", "RevenueCat returned invalid subscription timing.");
  }
  return new Date(text).toISOString();
}

function latestTimestamp(values: Array<string | null>) {
  const valid = values.filter((value): value is string => Boolean(value));
  if (!valid.length) throw new AppleMembershipError("PROVIDER_RESPONSE_INVALID", "RevenueCat omitted ordered subscription timing.");
  return valid.sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}

function sameProductSet(configured: string[]) {
  return configured.length === APPLE_MEMBERSHIP_PRODUCT_IDS.length
    && new Set(configured).size === configured.length
    && APPLE_MEMBERSHIP_PRODUCT_IDS.every((productId) => configured.includes(productId));
}

export function revenueCatConfiguration(env: Environment = process.env): RevenueCatConfiguration {
  const apiKey = env.REVENUECAT_SERVER_API_KEY?.trim() || "";
  const webhookSecret = env.REVENUECAT_WEBHOOK_SECRET?.trim() || "";
  if (!apiKey || !webhookSecret) return { ready: false, blocker: "server_credentials_missing" };
  const configuredProducts = (env.REVENUECAT_APPLE_PRODUCT_IDS || "").split(",").map((value) => value.trim()).filter(Boolean);
  if (!sameProductSet(configuredProducts)) return { ready: false, blocker: "products_not_configured" };
  if (env.REVENUECAT_APPLE_TRIAL_POLICY?.trim() !== "intro_offers_disabled") {
    return { ready: false, blocker: "storekit_trial_policy_unconfirmed" };
  }
  return { ready: true, apiKey, webhookSecret };
}

function statusFromSubscription(subscription: JsonRecord, now: Date): {
  status: AppleMembershipStatus;
  offerState: AppleMembershipOfferState;
  expiresAt: string;
  orderedEventAt: string;
} {
  const purchaseAt = nullableDate(subscription.purchase_date);
  const expiresAt = nullableDate(subscription.expires_date);
  if (!purchaseAt || !expiresAt) throw new AppleMembershipError("PROVIDER_RESPONSE_INVALID", "RevenueCat returned an incomplete auto-renewing subscription.");
  const revokedAt = nullableDate(subscription.revoked_at || subscription.revocation_date);
  const refundedAt = nullableDate(subscription.refunded_at);
  const graceAt = nullableDate(subscription.grace_period_expires_date);
  const billingIssueAt = nullableDate(subscription.billing_issues_detected_at || subscription.billing_issue_detected_at);
  const unsubscribeAt = nullableDate(subscription.unsubscribe_detected_at);
  const periodType = stringValue(subscription.period_type).toLowerCase();
  const offerCode = stringValue(subscription.offer_code || subscription.offer_identifier).toLowerCase();

  const offerState: AppleMembershipOfferState = periodType === "trial"
    ? "introductory_trial"
    : periodType === "intro"
      ? "introductory_offer"
      : offerCode
        ? "promotional_offer"
        : periodType && periodType !== "normal"
          ? "unknown"
          : "none";

  if (revokedAt) return { status: "revoked", offerState, expiresAt, orderedEventAt: latestTimestamp([revokedAt, refundedAt, purchaseAt]) };
  if (refundedAt) return { status: "refunded", offerState, expiresAt, orderedEventAt: latestTimestamp([refundedAt, purchaseAt]) };
  if (Date.parse(expiresAt) <= now.getTime()) return { status: "expired", offerState, expiresAt, orderedEventAt: expiresAt };
  if (billingIssueAt && graceAt && Date.parse(graceAt) > now.getTime()) {
    return { status: "grace_period", offerState, expiresAt: graceAt, orderedEventAt: latestTimestamp([billingIssueAt, purchaseAt]) };
  }
  if (billingIssueAt) return { status: "billing_issue", offerState, expiresAt, orderedEventAt: billingIssueAt };
  if (unsubscribeAt) return { status: "canceled_period_end", offerState, expiresAt, orderedEventAt: unsubscribeAt };
  if (periodType === "trial") return { status: "trialing", offerState, expiresAt, orderedEventAt: purchaseAt };
  return { status: "active", offerState, expiresAt, orderedEventAt: purchaseAt };
}

export function normalizeRevenueCatSubscriber(clerkUserId: string, payload: unknown, now = new Date()): AppleMembershipSnapshot {
  const subscriber = record(record(payload)?.subscriber);
  if (!subscriber) throw new AppleMembershipError("PROVIDER_RESPONSE_INVALID", "RevenueCat returned an invalid subscriber.");
  const owner = stringValue(subscriber.original_app_user_id);
  if (!owner || owner !== clerkUserId) {
    throw new AppleMembershipError("PURCHASE_OWNED_BY_ANOTHER_ACCOUNT", "RevenueCat subscriber owner does not match the authenticated account.");
  }
  const subscriptions = record(subscriber.subscriptions);
  if (!subscriptions) throw new AppleMembershipError("PROVIDER_RESPONSE_INVALID", "RevenueCat returned invalid subscriptions.");
  const entries = Object.entries(subscriptions);
  const disallowed = entries.find(([productId]) => !isAppleMembershipProductId(productId));
  if (disallowed) throw new AppleMembershipError("PRODUCT_NOT_ALLOWED", "RevenueCat returned a product outside the Apple membership allowlist.");

  const candidates = entries.map(([productId, value]) => {
    if (!isAppleMembershipProductId(productId)) throw new AppleMembershipError("PRODUCT_NOT_ALLOWED", "RevenueCat returned a disallowed product.");
    const subscription = record(value);
    if (!subscription) throw new AppleMembershipError("PROVIDER_RESPONSE_INVALID", "RevenueCat returned an invalid subscription.");
    const originalTransactionId = stringValue(subscription.original_transaction_id || subscription.original_transaction_identifier);
    if (!originalTransactionId) {
      throw new AppleMembershipError("PROVIDER_RESPONSE_INVALID", "RevenueCat did not return original transaction authority.");
    }
    if (typeof subscription.is_sandbox !== "boolean") {
      throw new AppleMembershipError("PROVIDER_RESPONSE_INVALID", "RevenueCat did not identify the transaction environment.");
    }
    const state = statusFromSubscription(subscription, now);
    const environment: AppleMembershipEnvironment = subscription.is_sandbox ? "sandbox" : "production";
    const candidate: AppleMembershipSnapshot = { clerkUserId, environment, productId, originalTransactionId, ...state };
    if (candidate.offerState === "introductory_trial" && !candidate.productId.endsWith(".monthly")) {
      throw new AppleMembershipError("PRODUCT_NOT_ALLOWED", "Annual Apple products may not carry a trial.");
    }
    return candidate;
  });
  if (!candidates.length) throw new AppleMembershipError("NO_APPLE_SUBSCRIPTION", "RevenueCat has no Apple membership for this account.");

  const accessStatuses = new Set<AppleMembershipStatus>(["trialing", "active", "canceled_period_end", "grace_period"]);
  return candidates.sort((a, b) => {
    const access = Number(accessStatuses.has(b.status)) - Number(accessStatuses.has(a.status));
    if (access) return access;
    const ordered = Date.parse(b.orderedEventAt) - Date.parse(a.orderedEventAt);
    if (ordered) return ordered;
    const aTier = appleMembershipAccessTier({ ...a, lastProviderEventId: null, createdAt: a.orderedEventAt, updatedAt: a.orderedEventAt, lastReconciledAt: a.orderedEventAt, projectedAt: null }, now);
    const bTier = appleMembershipAccessTier({ ...b, lastProviderEventId: null, createdAt: b.orderedEventAt, updatedAt: b.orderedEventAt, lastReconciledAt: b.orderedEventAt, projectedAt: null }, now);
    return (bTier === "barrel" ? 2 : bTier === "standard" ? 1 : 0) - (aTier === "barrel" ? 2 : aTier === "standard" ? 1 : 0);
  })[0];
}

export function createRevenueCatSubscriberFetcher(input: {
  apiKey: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}) {
  const fetchImpl = input.fetchImpl || fetch;
  const baseUrl = (input.baseUrl || "https://api.revenuecat.com/v1").replace(/\/$/, "");
  return async function fetchCurrentSubscriber(clerkUserId: string) {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/subscribers/${encodeURIComponent(clerkUserId)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${input.apiKey}`, Accept: "application/json" },
        cache: "no-store",
      });
    } catch {
      throw new AppleMembershipError("PROVIDER_UNAVAILABLE", "RevenueCat subscription verification is temporarily unavailable.");
    }
    if (!response.ok) {
      throw new AppleMembershipError("PROVIDER_UNAVAILABLE", "RevenueCat subscription verification is temporarily unavailable.");
    }
    const payload = await response.json().catch(() => null);
    return normalizeRevenueCatSubscriber(clerkUserId, payload);
  };
}

function authorized(actual: string | null, expected: string) {
  if (!actual) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createRevenueCatWebhookHandler(input: {
  secret: string | null;
  reconcile: (input: { clerkUserId: string; providerEventId: string }) => Promise<{ outcome: string; effectiveTier: MembershipTierLike }>;
}) {
  return async function handleRevenueCatWebhook(request: Request) {
    if (!input.secret) return Response.json({ error: "RevenueCat webhook is not configured." }, { status: 503 });
    if (!authorized(request.headers.get("authorization"), input.secret)) {
      return Response.json({ error: "RevenueCat webhook authorization failed." }, { status: 401 });
    }
    const body = record(await request.json().catch(() => null));
    const event = record(body?.event);
    const providerEventId = stringValue(event?.id);
    const clerkUserId = stringValue(event?.app_user_id);
    if (!providerEventId || !clerkUserId || providerEventId.length > 500 || clerkUserId.length > 500) {
      return Response.json({ error: "RevenueCat webhook payload is invalid." }, { status: 400 });
    }
    try {
      const result = await input.reconcile({ clerkUserId, providerEventId });
      return Response.json({ received: true, outcome: result.outcome });
    } catch (error) {
      if (error instanceof AppleMembershipError && (error.code === "PURCHASE_OWNED_BY_ANOTHER_ACCOUNT" || error.code === "PROVIDER_EVENT_CONFLICT" || error.code === "PRODUCT_NOT_ALLOWED")) {
        return Response.json({ error: "RevenueCat event requires billing review." }, { status: 409 });
      }
      return Response.json({ error: "RevenueCat reconciliation is temporarily unavailable." }, { status: 503 });
    }
  };
}

type MembershipTierLike = "free" | "standard" | "barrel" | "bottled-in-bond";

export function revenueCatProductPlan(productId: unknown) {
  return appleMembershipPlanForProduct(productId);
}
