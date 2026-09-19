import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAppleMembershipApiHandlers } from "@/lib/apple-membership-api";
import { getAppleMembershipRepository } from "@/lib/apple-membership-repository";
import { configuredAppleMembershipService } from "@/lib/apple-membership-service";
import { revenueCatConfiguration } from "@/lib/revenuecat";
import { signalApiError } from "@/lib/signals/signal-api-route";

export const dynamic = "force-dynamic";

const handlers = createAppleMembershipApiHandlers({
  configuration: () => revenueCatConfiguration(),
  getAccount: async (userId) => {
    const user = await (await clerkClient()).users.getUser(userId);
    return {
      publicMetadata: (user.publicMetadata || {}) as Record<string, unknown>,
      privateMetadata: (user.privateMetadata || {}) as Record<string, unknown>,
    };
  },
  readCurrent: (userId) => getAppleMembershipRepository().readCurrentForUser(userId),
  reconcile: async (input) => {
    const service = configuredAppleMembershipService();
    if (!service.ready) throw new Error("Apple membership is not configured.");
    return service.reconciler.reconcile(input);
  },
});

export async function GET() {
  const { userId } = await auth();
  if (!userId) return signalApiError(401, "UNAUTHORIZED", "Sign in to continue.");
  return handlers.readiness(userId);
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return signalApiError(401, "UNAUTHORIZED", "Sign in to continue.");
  return handlers.reconcile(request, userId);
}
