import { auth, clerkClient } from "@clerk/nextjs/server";
import {
  createFeaturedBadgesHandler,
  featuredBadgeLabels,
} from "@/lib/featured-badges";
import { createCommunitySightingsRepository } from "@/lib/community-sightings-repository";
import { signalApiError } from "@/lib/signals/signal-api-route";
import { createSignalPointsRepository } from "@/lib/signal-points-repository";
import { createCommunityLeaderBadgeQuery, readCommunityLeaderAwards } from "@/lib/community-leader-badges";

async function earnedProfile(userId: string, legacy: unknown) {
  const [profile, leaders] = await Promise.all([
    createSignalPointsRepository().readRewardProfile(userId, legacy) as Promise<{ badges?: Array<{ id: string }> } | undefined>,
    readCommunityLeaderAwards(createCommunityLeaderBadgeQuery(), userId),
  ]);
  return { ...profile, badges: [...(profile?.badges || []), ...leaders] };
}
const handler = createFeaturedBadgesHandler({
  earnedIds: async (userId) => {
    const user = await (await clerkClient()).users.getUser(userId);
    const rewards = await earnedProfile(userId, user.privateMetadata.memberRewards);
    return rewards?.badges?.map((badge) => badge.id) || [];
  },
  save: async (userId, ids) => {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const previous = user.privateMetadata as Record<string, unknown>;
    const latestRewards = await earnedProfile(userId, previous.memberRewards);
    if (
      ids.some((id) => !latestRewards?.badges?.some((badge) => badge.id === id))
    )
      throw new Error("Badge is no longer earned.");
    const next = { ...previous, memberRewards: latestRewards, featuredBadgeIds: ids };
    const repository = createCommunitySightingsRepository();
    await repository.updateReporterBadges(userId, featuredBadgeLabels(next));
    try {
      await client.users.updateUserMetadata(userId, {
        privateMetadata: { featuredBadgeIds: ids },
      });
    } catch (error) {
      await repository
        .updateReporterBadges(userId, featuredBadgeLabels({ ...previous, memberRewards: latestRewards }))
        .catch(() => undefined);
      throw error;
    }
  },
});
export async function PATCH(request: Request) {
  const { userId } = await auth();
  if (!userId)
    return signalApiError(401, "UNAUTHORIZED", "Sign in to continue.");
  return handler(request, userId);
}
