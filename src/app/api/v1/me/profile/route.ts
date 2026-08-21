import { auth, clerkClient } from "@clerk/nextjs/server";
import { getServerEntitlements } from "@/lib/server-entitlements";
import {
  buildSignalMemberProfile,
} from "@/lib/signals/signal-api-contract";
import { PRIVATE_SIGNAL_API_HEADERS, signalApiError } from "@/lib/signals/signal-api-route";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return signalApiError(401, "UNAUTHORIZED", "Sign in to continue.");

  try {
    const user = await (await clerkClient()).users.getUser(userId);
    const metadata = user.publicMetadata || {};
    const entitlements = await getServerEntitlements(metadata);
    const response = buildSignalMemberProfile(metadata, entitlements);
    return Response.json(response, { headers: PRIVATE_SIGNAL_API_HEADERS });
  } catch {
    return signalApiError(503, "UPSTREAM_UNAVAILABLE", "Member access is temporarily unavailable.", true);
  }
}
