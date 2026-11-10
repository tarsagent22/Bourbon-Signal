import { clerkClient } from "@clerk/nextjs/server";
import {
  createAppleMembershipProjector,
  createAppleMembershipReconciler,
} from "./apple-membership";
import {
  googleMembershipConfiguration,
  createGoogleSubscriberFetcher,
} from "./google-membership";
import { getGoogleMembershipRepository } from "./google-membership-repository";
import { createVerifiedMembershipTransfer } from './apple-membership-transfer';
export function configuredGoogleMembershipService(
  userId: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const configuration = googleMembershipConfiguration(env, userId, {
    verificationOnly: true,
  });
  if (!configuration.ready) return { ready: false, configuration } as const;
  const testers = new Set(
    (env.GOOGLE_PLAY_SANDBOX_USER_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const fetchCurrentSubscriber = createGoogleSubscriberFetcher({
    apiKey: configuration.apiKey,
    allowSandboxFor: (id) => testers.has(id),
  });
  const projectMembership = createAppleMembershipProjector({
    store: "google",
    getUser: async (id) => {
      const user = await (await clerkClient()).users.getUser(id);
      return {
        publicMetadata: user.publicMetadata as Record<string, unknown>,
        privateMetadata: user.privateMetadata as Record<string, unknown>,
      };
    },
    updateUserMetadata: async (id, metadata) =>
      (await clerkClient()).users.updateUserMetadata(id, metadata),
  });
  const repository = getGoogleMembershipRepository();
  const recoverVerifiedOwnership = createVerifiedMembershipTransfer({
    repository, fetchCurrentSubscriber, projectMembership,
    identityExists: async id => {
      try { await (await clerkClient()).users.getUser(id); return true; }
      catch (error) { if (error && typeof error === 'object' && 'status' in error && error.status === 404) return false; throw error; }
    },
    reconcileRemaining: id => reconciler.reconcile({ clerkUserId: id, providerEventId: null }),
  });
  const reconciler = createAppleMembershipReconciler({
    repository,
    fetchCurrentSubscriber,
    projectMembership,
    recoverVerifiedOwnership,
    // Existing authoritative trials are honored; Google products/base plans and native option
    // selection disable all new introductory offers. No trial is initiated by this endpoint.
    claimAuthoritativeTrial: async () => ({ accepted: true }),
  });
  return { ready: true, configuration, repository, reconciler } as const;
}
