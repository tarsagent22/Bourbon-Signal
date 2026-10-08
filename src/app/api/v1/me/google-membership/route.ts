import { getGoogleMembershipRepository } from "@/lib/google-membership-repository";
import { configuredGoogleMembershipService } from "@/lib/google-membership-service";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAppleMembershipApiHandlers } from "@/lib/apple-membership-api";
import {
  googleMembershipConfiguration,
  googlePurchaseAccountBlocker,
  GOOGLE_MEMBERSHIP_PRODUCT_IDS,
} from "@/lib/google-membership";
import { signalApiError } from "@/lib/signals/signal-api-route";

export const dynamic = "force-dynamic";

const handlers = createAppleMembershipApiHandlers(
  {
    configuration: (userId) =>
      googleMembershipConfiguration(process.env, userId),
    getAccount: async (userId) => {
      const user = await (await clerkClient()).users.getUser(userId);
      return {
        publicMetadata: (user.publicMetadata || {}) as Record<string, unknown>,
        privateMetadata: (user.privateMetadata || {}) as Record<
          string,
          unknown
        >,
      };
    },
    readCurrent: (userId) =>
      getGoogleMembershipRepository().readCurrentForUser(userId),
    reconcile: async (input) => {
      const service = configuredGoogleMembershipService(input.clerkUserId);
      if (!service.ready)
        throw new Error("Google membership is not configured.");
      return service.reconciler.reconcile(input);
    },
  },
  {
    store: "google",
    accountBlocker: googlePurchaseAccountBlocker,
    productIds: GOOGLE_MEMBERSHIP_PRODUCT_IDS,
  },
);

export async function GET() {
  const { userId } = await auth();
  if (!userId)
    return signalApiError(401, "UNAUTHORIZED", "Sign in to continue.");
  return handlers.readiness(userId);
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId)
    return signalApiError(401, "UNAUTHORIZED", "Sign in to continue.");
  return handlers.reconcile(request, userId);
}
