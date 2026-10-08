import { resolveEffectiveMembershipTier } from "./entitlements";
import {
  APPLE_MEMBERSHIP_SELLABLE_PRODUCT_IDS,
  AppleMembershipError,
  applePurchaseAccountBlocker,
} from "./apple-membership";
import {
  normalizeRevenueCatSubscriber,
  type RevenueCatConfiguration,
} from "./revenuecat";

// Store-specific ledgers share the proven transition/ownership machinery. Product identity is
// the same membership SKU across stores; Google's only allowed base plan is monthly, without offers.
export const GOOGLE_MEMBERSHIP_PRODUCT_IDS =
  APPLE_MEMBERSHIP_SELLABLE_PRODUCT_IDS;
const allowed = new Set<string>(GOOGLE_MEMBERSHIP_PRODUCT_IDS);
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
export function googleMembershipConfiguration(
  env: Record<string, string | undefined> = process.env,
  userId?: string,
  options: { verificationOnly?: boolean } = {},
): RevenueCatConfiguration {
  const apiKey = env.REVENUECAT_SERVER_API_KEY?.trim(),
    webhookSecret = env.REVENUECAT_WEBHOOK_SECRET?.trim();
  if (!apiKey || !webhookSecret)
    return { ready: false, blocker: "server_credentials_missing" };
  const products = (env.REVENUECAT_GOOGLE_PRODUCT_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    products.length !== 2 ||
    new Set(products).size !== 2 ||
    products.some((p) => !allowed.has(p))
  )
    return { ready: false, blocker: "google_products_not_configured" };
  if (env.REVENUECAT_GOOGLE_TRIAL_POLICY !== "intro_offers_disabled")
    return { ready: false, blocker: "google_trial_policy_unconfirmed" };
  const testers = (env.GOOGLE_PLAY_SANDBOX_USER_IDS || "")
    .split(",")
    .map((s) => s.trim());
  if (
    !options.verificationOnly &&
    env.GOOGLE_PLAY_BILLING_ENABLED !== "true" &&
    (!userId || !testers.includes(userId))
  )
    return { ready: false, blocker: "google_billing_not_activated" };
  return { ready: true, apiKey, webhookSecret };
}
export function googlePurchaseAccountBlocker(
  pub: Record<string, unknown>,
  priv: Record<string, unknown>,
) {
  const blocker = applePurchaseAccountBlocker(
    { ...pub, googleMembershipTier: "free", googleMembershipStatus: "expired" },
    priv,
  );
  if (blocker) return blocker;
  const appleOnly = {
    tier: "free",
    appleMembershipTier: pub.appleMembershipTier,
    appleMembershipPlan: pub.appleMembershipPlan,
    appleMembershipStatus: pub.appleMembershipStatus,
    appleMembershipExpiresAt: pub.appleMembershipExpiresAt,
  };
  return resolveEffectiveMembershipTier(appleOnly) !== "free"
    ? "active_apple_subscription"
    : null;
}
export function normalizeGoogleRevenueCatSubscriber(
  userId: string,
  payload: unknown,
  options: { now?: Date; allowSandbox?: boolean } = {},
) {
  const outer = record(payload),
    subscriber = record(outer?.subscriber),
    subscriptions = record(subscriber?.subscriptions);
  if (!subscriber || !subscriptions)
    throw new AppleMembershipError(
      "PROVIDER_RESPONSE_INVALID",
      "RevenueCat returned an invalid Google subscriber.",
    );
  // RevenueCat is the server-side verifier connected to Google Play; never accept a client receipt
  // or webhook's claimed tier as purchase proof. Original customer ownership must match exactly.
  if (subscriber.original_app_user_id !== userId)
    throw new AppleMembershipError(
      "PURCHASE_OWNED_BY_ANOTHER_ACCOUNT",
      "Google purchase belongs to another account.",
    );
  const google: Record<string, unknown> = {};
  for (const [storeId, value] of Object.entries(subscriptions)) {
    const row = record(value);
    if (row?.store === "app_store") continue;
    if (!row || row.store !== "play_store")
      throw new AppleMembershipError(
        "PRODUCT_NOT_ALLOWED",
        "Unsupported purchase store.",
      );
    const sku = storeId.endsWith(":monthly") ? storeId.slice(0, -8) : storeId;
    if (
      !allowed.has(sku) ||
      (row.base_plan_id !== undefined && row.base_plan_id !== "monthly")
    )
      throw new AppleMembershipError(
        "PRODUCT_NOT_ALLOWED",
        "Unsupported Google membership plan.",
      );
    if (row.is_sandbox === true && !options.allowSandbox)
      throw new AppleMembershipError(
        "PRODUCT_NOT_ALLOWED",
        "Sandbox membership is restricted to configured test accounts.",
      );
    const order = String(
      row.store_transaction_id || row.original_transaction_id || "",
    );
    if (!/^GPA\.[0-9-]+(?:\.\.\d+)?$/.test(order))
      throw new AppleMembershipError(
        "PROVIDER_RESPONSE_INVALID",
        "Google order authority is missing.",
      );
    if (google[sku])
      throw new AppleMembershipError(
        "PROVIDER_RESPONSE_INVALID",
        "Ambiguous Google base plan authority.",
      );
    google[sku] = {
      ...row,
      store: "app_store",
      original_transaction_id: order.split("..")[0],
    };
  }
  return normalizeRevenueCatSubscriber(
    userId,
    { subscriber: { ...subscriber, subscriptions: google } },
    options.now,
  );
}
export function createGoogleSubscriberFetcher(options: {
  apiKey: string;
  fetchImpl?: typeof fetch;
  allowSandboxFor?: (userId: string) => boolean;
  now?: () => Date;
}) {
  return async (userId: string) => {
    let response: Response;
    try {
      response = await (options.fetchImpl || fetch)(
        `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
        {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(10000),
        },
      );
    } catch {
      throw new AppleMembershipError(
        "PROVIDER_UNAVAILABLE",
        "Google subscription verification is unavailable.",
      );
    }
    if (!response.ok)
      throw new AppleMembershipError(
        "PROVIDER_UNAVAILABLE",
        "Google subscription verification is unavailable.",
      );
    return normalizeGoogleRevenueCatSubscriber(userId, await response.json(), {
      now: options.now?.(),
      allowSandbox: options.allowSandboxFor?.(userId),
    });
  };
}
