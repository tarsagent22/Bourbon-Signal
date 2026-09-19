import {
  APPLE_MEMBERSHIP_PRODUCT_IDS,
  AppleMembershipError,
  applePurchaseAccountBlocker,
  isAppleMembershipProductId,
  type AppleMembershipRecord,
} from "./apple-membership.ts";
import type { RevenueCatConfiguration } from "./revenuecat.ts";

const CONTRACT_VERSION = "bourbon-signal/mobile-api@1";
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  Vary: "Cookie, Authorization",
};

function errorResponse(status: number, code: string, message: string, retryable = false) {
  return Response.json({
    contractVersion: "bourbon-signal/error@1",
    error: { code, message, ...(retryable ? { retryable: true } : {}) },
  }, { status, headers: PRIVATE_HEADERS });
}

function publicMembership(record: AppleMembershipRecord | null) {
  return record ? {
    productId: record.productId,
    status: record.status,
    environment: record.environment,
    expiresAt: record.expiresAt,
    offerState: record.offerState,
    updatedAt: record.updatedAt,
  } : null;
}

function mappedError(error: unknown) {
  if (!(error instanceof AppleMembershipError)) {
    return errorResponse(503, "APPLE_MEMBERSHIP_UNAVAILABLE", "Apple membership verification is temporarily unavailable.", true);
  }
  if (error.code === "PURCHASE_OWNED_BY_ANOTHER_ACCOUNT" || error.code === "PROVIDER_EVENT_CONFLICT") {
    return errorResponse(409, error.code, "This Apple purchase is already associated with another Bourbon Signal account.");
  }
  if (error.code === "PRODUCT_NOT_ALLOWED" || error.code === "PROVIDER_RESPONSE_INVALID") {
    return errorResponse(422, error.code, "Apple returned a subscription that Bourbon Signal cannot safely reconcile.");
  }
  if (error.code === "TRIAL_ALREADY_USED") {
    return errorResponse(409, error.code, "This Bourbon Signal account has already used its membership trial.");
  }
  if (error.code === "NO_APPLE_SUBSCRIPTION") {
    return errorResponse(404, error.code, "No Apple membership was found for this account.");
  }
  return errorResponse(503, error.code, "Apple membership verification is temporarily unavailable.", true);
}

export function createAppleMembershipApiHandlers(dependencies: {
  configuration: () => RevenueCatConfiguration;
  getAccount: (clerkUserId: string) => Promise<{ publicMetadata: Record<string, unknown>; privateMetadata: Record<string, unknown> }>;
  readCurrent: (clerkUserId: string) => Promise<AppleMembershipRecord | null>;
  reconcile: (input: { clerkUserId: string; providerEventId: null }) => Promise<{
    outcome: string;
    effectiveTier: "free" | "standard" | "barrel" | "bottled-in-bond";
    membership: AppleMembershipRecord;
  }>;
}) {
  async function readiness(clerkUserId: string) {
    const configuration = dependencies.configuration();
    if (!configuration.ready) {
      return Response.json({
        contractVersion: CONTRACT_VERSION,
        available: false,
        reason: "backend_not_configured",
        blocker: configuration.blocker,
        eligibleProductIds: [],
        restoreAvailable: false,
        membership: null,
      }, { headers: PRIVATE_HEADERS });
    }
    try {
      const [account, current] = await Promise.all([
        dependencies.getAccount(clerkUserId),
        dependencies.readCurrent(clerkUserId),
      ]);
      const blocker = applePurchaseAccountBlocker(account.publicMetadata, account.privateMetadata);
      return Response.json({
        contractVersion: CONTRACT_VERSION,
        available: !blocker,
        reason: blocker ? "account_ineligible" : "ready",
        ...(blocker ? { blocker } : {}),
        eligibleProductIds: blocker ? [] : APPLE_MEMBERSHIP_PRODUCT_IDS,
        restoreAvailable: !blocker,
        membership: publicMembership(current),
        trialPolicy: "intro_offers_disabled",
      }, { headers: PRIVATE_HEADERS });
    } catch {
      return errorResponse(503, "APPLE_MEMBERSHIP_UNAVAILABLE", "Apple membership status is temporarily unavailable.", true);
    }
  }

  async function reconcile(request: Request, clerkUserId: string) {
    const configuration = dependencies.configuration();
    if (!configuration.ready) {
      return errorResponse(503, "BACKEND_NOT_CONFIGURED", "Secure Apple membership reconciliation is not configured.");
    }
    const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
    const action = payload?.action;
    const productId = payload?.productId;
    if (action !== "purchase" && action !== "restore") {
      return errorResponse(400, "INVALID_REQUEST", "Action must be purchase or restore.");
    }
    if (action === "purchase" && !isAppleMembershipProductId(productId)) {
      return errorResponse(422, "PRODUCT_NOT_ALLOWED", "That Apple membership product is not supported.");
    }
    if (action === "restore" && productId !== undefined) {
      return errorResponse(400, "INVALID_REQUEST", "Restore does not accept a client-selected product.");
    }
    try {
      const account = await dependencies.getAccount(clerkUserId);
      const blocker = applePurchaseAccountBlocker(account.publicMetadata, account.privateMetadata);
      if (blocker) return errorResponse(409, "ACCOUNT_INELIGIBLE", "This account already has membership authority outside Apple.");
      const result = await dependencies.reconcile({ clerkUserId, providerEventId: null });
      if (action === "purchase" && result.membership.productId !== productId) {
        return errorResponse(409, "PURCHASE_PRODUCT_MISMATCH", "The verified Apple product does not match the completed purchase.");
      }
      return Response.json({
        contractVersion: CONTRACT_VERSION,
        status: "reconciled",
        effectiveTier: result.effectiveTier,
        membership: publicMembership(result.membership),
      }, { headers: PRIVATE_HEADERS });
    } catch (error) {
      return mappedError(error);
    }
  }

  return { readiness, reconcile };
}
