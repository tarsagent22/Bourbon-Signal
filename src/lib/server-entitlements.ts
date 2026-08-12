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

export async function resolveServerEffectiveMembershipTier(input: unknown, now = new Date()): Promise<MembershipTier> {
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

export async function getServerEntitlements(input: unknown, now = new Date()): Promise<TierEntitlements> {
  return getEntitlements(await resolveServerEffectiveMembershipTier(input, now));
}

export async function isServerPaidTier(input: unknown, now = new Date()) {
  return (await resolveServerEffectiveMembershipTier(input, now)) !== "free";
}
