import { normalizeCommunityDisplayName } from "../community-display-name.ts";
import type { SignalMemberProfileResponse } from "./signal-api-contract.ts";
import { PRIVATE_SIGNAL_API_HEADERS, signalApiError } from "./signal-api-route.ts";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function createSignalProfilePatchHandler({
  saveDisplayName,
}: {
  saveDisplayName: (userId: string, displayName: string | null) => Promise<SignalMemberProfileResponse>;
}) {
  return async function handleSignalProfilePatch(request: Request, userId: string) {
    const body = record(await request.json().catch(() => null));
    if (!Object.prototype.hasOwnProperty.call(body, "displayName")) {
      return signalApiError(400, "INVALID_REQUEST", "displayName is required.");
    }
    let displayName: string | null = null;
    if (body.displayName !== null) {
      const normalized = normalizeCommunityDisplayName(body.displayName);
      if (!normalized.ok) return signalApiError(400, "INVALID_REQUEST", normalized.error);
      displayName = normalized.value;
    }
    try {
      const profile = await saveDisplayName(userId, displayName);
      return Response.json(profile, { headers: PRIVATE_SIGNAL_API_HEADERS });
    } catch {
      return signalApiError(503, "UPSTREAM_UNAVAILABLE", "Community display name could not be updated.", true);
    }
  };
}
