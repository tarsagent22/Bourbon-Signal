import { configuredAppleMembershipService } from "@/lib/apple-membership-service";
import { createRevenueCatWebhookHandler } from "@/lib/revenuecat";

export const dynamic = "force-dynamic";

const handleRevenueCatWebhook = createRevenueCatWebhookHandler({
  secret: process.env.REVENUECAT_WEBHOOK_SECRET?.trim() || null,
  reconcile: async (input) => {
    const service = configuredAppleMembershipService();
    if (!service.ready) throw new Error("RevenueCat is not configured.");
    return service.reconciler.reconcile(input);
  },
});

export async function POST(request: Request) {
  return handleRevenueCatWebhook(request);
}
