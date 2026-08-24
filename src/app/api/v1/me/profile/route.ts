import { auth, clerkClient } from "@clerk/nextjs/server";
import { getServerEntitlements } from "@/lib/server-entitlements";
import {
  buildSignalMemberProfile,
  publicSignalIdentityFromMetadata,
} from "@/lib/signals/signal-api-contract";
import { PRIVATE_SIGNAL_API_HEADERS, signalApiError } from "@/lib/signals/signal-api-route";
import { createSignalProfilePatchHandler } from "@/lib/signals/signal-profile-route";
import { COMMUNITY_DISPLAY_NAME_METADATA_KEY, communityDisplayNameFromMetadata, resolvedCommunityDisplayName } from "@/lib/community-display-name";
import { createCommunitySightingsRepository } from "@/lib/community-sightings-repository";

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

const patchProfile = createSignalProfilePatchHandler({
  saveDisplayName: async (userId, displayName) => {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const metadata = (user.publicMetadata && typeof user.publicMetadata === "object" ? user.publicMetadata : {}) as Record<string, unknown>;
    const identity = publicSignalIdentityFromMetadata(metadata);
    if (!identity) throw new Error("A numbered public identity is required.");
    const oldCustomDisplayName = communityDisplayNameFromMetadata(metadata);
    const oldResolvedDisplayName = resolvedCommunityDisplayName(metadata, identity.label);
    const oldActor = { ...identity, ...(oldCustomDisplayName ? { displayName: oldCustomDisplayName } : {}) };
    const nextMetadata = { ...metadata, [COMMUNITY_DISPLAY_NAME_METADATA_KEY]: displayName };
    const nextActor = { ...identity, ...(displayName ? { displayName } : {}) };
    const repository = createCommunitySightingsRepository();

    await repository.updateReporterDisplayName(userId, displayName || identity.label, nextActor);
    try {
      await client.users.updateUserMetadata(userId, { publicMetadata: nextMetadata });
    } catch (error) {
      await repository.updateReporterDisplayName(userId, oldResolvedDisplayName, oldActor).catch(() => undefined);
      throw error;
    }

    const entitlements = await getServerEntitlements(nextMetadata);
    return buildSignalMemberProfile(nextMetadata, entitlements);
  },
});

export async function PATCH(request: Request) {
  const { userId } = await auth();
  if (!userId) return signalApiError(401, "UNAUTHORIZED", "Sign in to continue.");
  return patchProfile(request, userId);
}
