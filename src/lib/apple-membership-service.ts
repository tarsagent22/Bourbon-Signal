import { clerkClient } from "@clerk/nextjs/server";
import {
  createAppleMembershipProjector,
  createAppleMembershipRepair,
  createAppleMembershipReconciler,
} from "./apple-membership.ts";
import { getAppleMembershipRepository } from "./apple-membership-repository.ts";
import { getMembershipTrialRepository } from "./membership-trial-repository";
import { createRevenueCatSubscriberFetcher, revenueCatConfiguration } from "./revenuecat.ts";

export function configuredAppleMembershipService(env: NodeJS.ProcessEnv = process.env) {
  const configuration = revenueCatConfiguration(env);
  if (!configuration.ready) return { ready: false, configuration } as const;
  const repository = getAppleMembershipRepository();
  const fetchCurrentSubscriber = createRevenueCatSubscriberFetcher({ apiKey: configuration.apiKey });
  const projectMembership = createAppleMembershipProjector({
    getUser: async (userId) => {
      const user = await (await clerkClient()).users.getUser(userId);
      return { publicMetadata: user.publicMetadata as Record<string, unknown>, privateMetadata: user.privateMetadata as Record<string, unknown> };
    },
    updateUserMetadata: async (userId, input) => (await clerkClient()).users.updateUserMetadata(userId, input),
  });
  const reconciler = createAppleMembershipReconciler({
    repository,
    fetchCurrentSubscriber,
    claimAuthoritativeTrial: (input) => getMembershipTrialRepository().claimAuthoritativeAppleTrial(input),
    projectMembership,
  });
  return { ready: true, configuration, repository, fetchCurrentSubscriber, reconciler } as const;
}

export { createAppleMembershipProjector, createAppleMembershipRepair };
