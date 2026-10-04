import {
  getEntitlements,
  resolveEffectiveMembershipTier,
  resolvePreviousMembershipTierAfterDirectFounder,
  resolvePreviousMembershipTierAfterGift,
  type MembershipTier,
  type TierEntitlements,
} from "@/lib/entitlements";

async function createGiftRepository() {
  return (await import("@/lib/gift-repository")).createGiftRepository();
}

function metadataValue(input: unknown, key: string) {
  if (!input || typeof input !== "object") return undefined;
  const record = input as Record<string, unknown>;
  const publicMetadata = record.publicMetadata && typeof record.publicMetadata === "object"
    ? record.publicMetadata as Record<string, unknown>
    : null;
  return record[key] ?? publicMetadata?.[key];
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function resolveBaseServerMembershipTier(input: unknown, now = new Date()): Promise<MembershipTier> {
  const giftOrderId = stringValue(metadataValue(input, "giftOrderId"));
  const giftVersion = stringValue(metadataValue(input, "giftEntitlementVersion"));
  const directFounderAttemptId = stringValue(metadataValue(input, "directFounderCheckoutAttemptId"));
  const directFounderVersion = stringValue(metadataValue(input, "directFounderEntitlementVersion"));

  if (giftOrderId) {
    const repository = await createGiftRepository();
    try {
      if (await repository.giftOwnsEffectiveAccess(giftOrderId, giftVersion, now)) {
        return resolveEffectiveMembershipTier(input, now);
      }
    } catch {
      // Durable gift authority is mandatory. Database uncertainty fails closed.
    }
    const previousTier = resolvePreviousMembershipTierAfterGift(input);
    if (previousTier === "bottled-in-bond" && directFounderAttemptId) {
      try {
        return await repository.directFounderOwnsEffectiveAccess(directFounderAttemptId, directFounderVersion)
          ? previousTier : resolvePreviousMembershipTierAfterDirectFounder(input);
      } catch {
        return resolvePreviousMembershipTierAfterDirectFounder(input);
      }
    }
    return previousTier;
  }

  if (directFounderAttemptId) {
    const repository = await createGiftRepository();
    try {
      if (await repository.directFounderOwnsEffectiveAccess(directFounderAttemptId, directFounderVersion)) {
        return resolveEffectiveMembershipTier(input, now);
      }
    } catch {
      // A refunded or disputed direct Founder purchase must not rely on stale Clerk metadata.
    }
    return resolvePreviousMembershipTierAfterDirectFounder(input);
  }

  return resolveEffectiveMembershipTier(input, now);
}

export async function resolveServerEffectiveMembershipTier(input: unknown, now = new Date()): Promise<MembershipTier> {
  const id = stringValue(metadataValue(input, "rewardMembershipRedemptionId"));
  if (!id) return resolveBaseServerMembershipTier(input, now);
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const publicMetadata = raw.publicMetadata && typeof raw.publicMetadata === "object" ? raw.publicMetadata as Record<string, unknown> : raw;
  const clean = { ...raw, ...publicMetadata, rewardMembershipExpiresAt: null, rewardMembershipRedemptionId: null, publicMetadata: { ...publicMetadata, rewardMembershipExpiresAt: null, rewardMembershipRedemptionId: null } };
  const base = await resolveBaseServerMembershipTier(clean, now);
  if (base !== "free") return base;
  try {
    const { membershipMonthQuery } = await import("./membership-month");
    const rows = await membershipMonthQuery().query(`SELECT 1 FROM signal_reward_redemptions WHERE id=$1 AND user_id=$2
      AND item_key='standard_membership_credit_month' AND status='delivered'
      AND details->>'monthProvider'='earned_access' AND (details->>'accessExpiresAt')::timestamptz>$3`,
      [id, stringValue(metadataValue(input, "rewardMembershipUserId")), now.toISOString()]);
    return rows[0] ? "standard" : "free";
  } catch { return "free"; }
}

export async function getServerEntitlements(input: unknown, now = new Date()): Promise<TierEntitlements> {
  return getEntitlements(await resolveServerEffectiveMembershipTier(input, now));
}

export async function isServerPaidTier(input: unknown, now = new Date()) {
  return (await resolveServerEffectiveMembershipTier(input, now)) !== "free";
}
