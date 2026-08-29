import type { TierEntitlements } from "./entitlements.ts";

export type CellarAccessPolicy = {
  canRead: boolean;
  canEditExisting: boolean;
  canAdd: boolean;
  limit: number | null;
  remaining: number | null;
  showCapacityNotice: boolean;
};

export function getCellarAccessPolicy(
  entitlements: Pick<TierEntitlements, "canUseCollection" | "collectionBottleLimit">,
  currentBottleCount: number,
): CellarAccessPolicy {
  const currentCount = Number.isFinite(currentBottleCount)
    ? Math.max(0, Math.floor(currentBottleCount))
    : 0;
  const limit = entitlements.collectionBottleLimit;
  const canRead = entitlements.canUseCollection;
  const remaining = limit === null ? null : Math.max(0, limit - currentCount);

  return {
    canRead,
    canEditExisting: canRead,
    canAdd: canRead && (limit === null || currentCount < limit),
    limit,
    remaining,
    showCapacityNotice: canRead && limit !== null && currentCount >= Math.max(0, limit - 2),
  };
}
