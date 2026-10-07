import {
  achievementDefinition,
  canonicalBadgeId,
} from "./achievement-catalog.ts";
import {
  PRIVATE_SIGNAL_API_HEADERS,
  signalApiError,
} from "./signals/signal-api-route.ts";
import { communityLeaderBadge } from "../../shared/community-leader-badges.ts";
export function featuredBadgeLabels(metadata: Record<string, unknown>) {
  const profile = metadata.memberRewards as
    | { badges?: Array<{ id: string; tier?: string }> }
    | undefined;
  const selected = Array.isArray(metadata.featuredBadgeIds)
    ? metadata.featuredBadgeIds
        .filter((id): id is string => typeof id === "string")
        .slice(0, 3)
    : [];
  return selected.flatMap((id) => {
    const award = profile?.badges?.find((badge) => badge.id === id);
    if (!award) return [];
    const leader = communityLeaderBadge(id);
    if (leader) return [leader.label];
    const definition = achievementDefinition(id);
    const name =
      definition?.name ||
      (id.startsWith("clean_signal")
        ? "Clean Signal"
        : id.startsWith("sharp_eye")
          ? "Sharp Eye"
          : null);
    const tier = canonicalBadgeId(id).endsWith("_gold") ? "gold" : award.tier;
    return name
      ? [`${name}${tier ? ` · ${tier[0].toUpperCase() + tier.slice(1)}` : ""}`]
      : [];
  });
}
export function createFeaturedBadgesHandler(deps: {
  earnedIds: (userId: string) => Promise<string[]>;
  save: (userId: string, ids: string[]) => Promise<void>;
}) {
  return async (request: Request, userId: string) => {
    const body = await request.json().catch(() => null);
    const ids = body?.featuredBadgeIds;
    if (
      !Array.isArray(ids) ||
      ids.length > 3 ||
      ids.some((id) => typeof id !== "string" || !id || id.length > 100) ||
      new Set(ids).size !== ids.length
    )
      return signalApiError(
        400,
        "INVALID_REQUEST",
        "Choose up to 3 different earned badges.",
      );
    try {
      const earned = await deps.earnedIds(userId);
      if (ids.some((id) => !earned.includes(id)))
        return signalApiError(
          400,
          "INVALID_REQUEST",
          "Only earned badges can be featured.",
        );
      await deps.save(userId, ids);
      return Response.json(
        { ok: true, featuredBadgeIds: ids },
        { headers: PRIVATE_SIGNAL_API_HEADERS },
      );
    } catch {
      return signalApiError(
        503,
        "UPSTREAM_UNAVAILABLE",
        "Featured badges could not be saved. Try again.",
        true,
      );
    }
  };
}
