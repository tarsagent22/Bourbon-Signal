import { auth } from "@clerk/nextjs/server";
import { createAccountDeletionIdentityProvider } from "@/lib/account-deletion-identity-provider";
import { createAccountDeletionRepository } from "@/lib/account-deletion-repository";
import {
  AccountDeletionRecentAuthenticationError,
  requestAccountDeletion,
} from "@/lib/account-deletion";

import { PRIVATE_SIGNAL_API_HEADERS, signalApiError } from "@/lib/signals/signal-api-route";
import { withMemberAlertLease } from "@/lib/alert-queue/member-lease";

export const dynamic = "force-dynamic";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function DELETE(request: Request) {
  const authentication = await auth();
  const { userId, factorVerificationAge } = authentication;
  if (!userId) return signalApiError(401, "UNAUTHORIZED", "Sign in to continue.");

  const body = record(await request.json().catch(() => null));
  if (body.confirmation !== "DELETE") {
    return signalApiError(400, "INVALID_CONFIRMATION", "Type DELETE to confirm permanent account deletion.");
  }

  try {
    const identityProvider = await createAccountDeletionIdentityProvider();
    const leased = await withMemberAlertLease(userId, async (assertHeld) => {
      await assertHeld();
      return requestAccountDeletion({
        userId,
        factorVerificationAge,
        assertLeaseHeld: assertHeld,
        repository: createAccountDeletionRepository(),
        identityProvider,
      });
    }, { requireDurable: true });
    if (!leased.acquired) {
      return signalApiError(409, "ACCOUNT_DELETION_UNAVAILABLE", "Account delivery is busy. Try again shortly.", true);
    }
    const result = leased.result;
    if (!result.accessRevoked) {
      return signalApiError(503, "ACCESS_REVOCATION_PENDING", "Account access could not be revoked yet. Try again.", true);
    }
    return Response.json(result, { status: result.identityDeleted ? 200 : 202, headers: PRIVATE_SIGNAL_API_HEADERS });
  } catch (error) {
    if (error instanceof AccountDeletionRecentAuthenticationError) {
      return signalApiError(403, "RECENT_AUTHENTICATION_REQUIRED", error.message);
    }
    return signalApiError(503, "ACCOUNT_DELETION_UNAVAILABLE", "Account deletion could not start safely. Try again.", true);
  }
}
