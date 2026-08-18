import type { MembershipTier } from "./entitlements.ts";
import { getPlanByPriceId } from "./stripe-plans.ts";

export const MEMBERSHIP_CREDIT_REWARD_KEYS = [
  "standard_membership_credit_month",
  "barrel_membership_credit_month",
] as const;
export type MembershipCreditRewardKey = typeof MEMBERSHIP_CREDIT_REWARD_KEYS[number];

type Metadata = Record<string, unknown>;
type SubscriptionLike = {
  id?: unknown;
  status?: unknown;
  cancel_at_period_end?: unknown;
  cancel_at?: unknown;
  pause_collection?: unknown;
  customer?: unknown;
  items?: { data?: Array<{ quantity?: unknown; price?: { id?: unknown } }> };
};

type EligibilityInput = {
  itemKey: unknown;
  tier: MembershipTier;
  privateMetadata: Metadata;
  subscription: SubscriptionLike;
};

type BalanceTransactionClient = {
  customers: {
    createBalanceTransaction(customerId: string, params: {
      amount: number;
      currency: "usd";
      description: string;
      metadata: Record<string, string>;
    }, options: { idempotencyKey: string }): Promise<{ id: string }>;
  };
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export function isMembershipCreditRewardKey(value: unknown): value is MembershipCreditRewardKey {
  return MEMBERSHIP_CREDIT_REWARD_KEYS.includes(value as MembershipCreditRewardKey);
}

export function membershipCreditCatalogForTier<T extends { key: string }>(catalog: T[], tier: MembershipTier) {
  return catalog.filter((item) => {
    if (!isMembershipCreditRewardKey(item.key)) return true;
    return item.key === `${tier}_membership_credit_month`;
  });
}

export function membershipCreditEligibility(input: EligibilityInput):
  | { ok: true; customerId: string; subscriptionId: string; plan: "standard_monthly" | "standard_annual" | "barrel_monthly" | "barrel_annual"; creditCents: 300 | 600 }
  | { ok: false; error: string } {
  if (!isMembershipCreditRewardKey(input.itemKey)) return { ok: false, error: "Choose an available membership credit." };
  const expectedTier = input.itemKey === "standard_membership_credit_month" ? "standard" : "barrel";
  if (input.tier !== expectedTier) return { ok: false, error: `An active ${expectedTier === "standard" ? "Standard Proof" : "Barrel Proof"} membership is required.` };

  const customerId = text(input.privateMetadata.stripeCustomerId);
  const subscriptionId = text(input.privateMetadata.stripeSubscriptionId);
  const metadataPlan = text(input.privateMetadata.stripePlan);
  if (!customerId || !subscriptionId || !["standard_monthly", "standard_annual", "barrel_monthly", "barrel_annual"].includes(metadataPlan)) {
    return { ok: false, error: "A directly billed active membership is required." };
  }
  if (text(input.subscription.id) !== subscriptionId || text(input.subscription.customer) !== customerId) {
    return { ok: false, error: "The active billing subscription could not be verified." };
  }
  if (input.subscription.status !== "active" || input.subscription.cancel_at_period_end === true || input.subscription.cancel_at || input.subscription.pause_collection) {
    return { ok: false, error: "Membership credits require an active, renewing subscription in good standing." };
  }
  const items = input.subscription.items?.data || [];
  if (items.length !== 1) return { ok: false, error: "The active membership plan could not be verified." };
  if (Number(items[0]?.quantity ?? 1) !== 1) return { ok: false, error: "The active membership plan could not be verified." };
  const livePlan = getPlanByPriceId(text(items[0]?.price?.id));
  if (!livePlan || livePlan.stripeMode !== "subscription" || livePlan.id !== metadataPlan || livePlan.tier !== expectedTier) {
    return { ok: false, error: "The active membership plan could not be verified." };
  }
  return {
    ok: true,
    customerId,
    subscriptionId,
    plan: livePlan.id as "standard_monthly" | "standard_annual" | "barrel_monthly" | "barrel_annual",
    creditCents: expectedTier === "standard" ? 300 : 600,
  };
}

export async function applyMembershipCredit(input: {
  stripe: BalanceTransactionClient;
  customerId: string;
  redemptionId: string;
  itemKey: MembershipCreditRewardKey;
  creditCents: 300 | 600;
}) {
  const transaction = await input.stripe.customers.createBalanceTransaction(input.customerId, {
    amount: -input.creditCents,
    currency: "usd",
    description: "Bourbon Signal — one month on us",
    metadata: {
      signalPointsRedemptionId: input.redemptionId,
      signalPointsRewardKey: input.itemKey,
    },
  }, { idempotencyKey: `signal-points-membership-credit:${input.redemptionId}` });
  return { transactionId: transaction.id };
}
