export const ACCOUNT_DELETION_REAUTH_MAX_AGE_MINUTES = 10;

// All application data cleanup is completed before the identity tombstone is
// terminally anonymized. Retry-only work is recorded dynamically.
export const ACCOUNT_DELETION_DURABLE_RESIDUALS = [] as const;

export class AccountDeletionRecentAuthenticationError extends Error {
  constructor() {
    super("For security, sign in again before permanently deleting your account.");
    this.name = "AccountDeletionRecentAuthenticationError";
  }
}

export interface AccountDeletionCleanupItem {
  userId: string;
  requestId: string;
}

export interface AccountDeletionRepository {
  begin(userId: string, now: string): Promise<{ requestId: string }>;
  eraseOwnedProductDataAndDisableDelivery(userId: string, requestId: string, now: string): Promise<string[]>;
  recordOutcome(userId: string, outcome: {
    accessRevoked: boolean;
    identityDeleted: boolean;
    completedSteps: string[];
    remainingCleanup: string[];
    now: string;
  }): Promise<void>;
  claimCleanupBatch?(now: string, limit: number): Promise<AccountDeletionCleanupItem[]>;
  terminalize?(userId: string, requestId: string, now: string, completedSteps: string[]): Promise<void>;
}

export interface AccountDeletionIdentityProvider {
  disableDeliveryMetadata(userId: string, requestId: string, now: string): Promise<void>;
  listSessionIds(userId: string): Promise<string[]>;
  revokeSession(sessionId: string): Promise<void>;
  banUser(userId: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
}

export function recentAuthenticationIsValid(
  factorVerificationAge: [number, number] | null | undefined,
  maxAgeMinutes = ACCOUNT_DELETION_REAUTH_MAX_AGE_MINUTES,
) {
  const firstFactorAge = factorVerificationAge?.[0];
  return typeof firstFactorAge === "number"
    && Number.isFinite(firstFactorAge)
    && firstFactorAge >= 0
    && firstFactorAge <= maxAgeMinutes;
}

async function continueAccountDeletion(input: {
  userId: string;
  requestId: string;
  repository: AccountDeletionRepository;
  identityProvider: AccountDeletionIdentityProvider;
  assertLeaseHeld?: () => Promise<void>;
  now: string;
}) {
  const assertLeaseHeld = input.assertLeaseHeld || (async () => {});
  const completedSteps: string[] = ["deletion_tombstone"];
  const remainingCleanup: string[] = [];

  let applicationCleanupFailed = false;
  await assertLeaseHeld();
  try {
    completedSteps.push(...await input.repository.eraseOwnedProductDataAndDisableDelivery(
      input.userId,
      input.requestId,
      input.now,
    ));
  } catch {
    applicationCleanupFailed = true;
    remainingCleanup.push("application_data_cleanup_retry");
  }

  await assertLeaseHeld();
  try {
    await input.identityProvider.disableDeliveryMetadata(input.userId, input.requestId, input.now);
    completedSteps.push("identity_delivery_disabled");
  } catch {
    remainingCleanup.push("identity_metadata_cleanup_retry");
  }

  if (applicationCleanupFailed) {
    const uniqueRemaining = [...new Set(remainingCleanup)];
    await assertLeaseHeld();
    try {
      await input.repository.recordOutcome(input.userId, {
        accessRevoked: false,
        identityDeleted: false,
        completedSteps,
        remainingCleanup: uniqueRemaining,
        now: input.now,
      });
    } catch {
      // begin() already persisted the retry authority.
    }
    return {
      contractVersion: "bourbon-signal/mobile-api@1" as const,
      status: "cleanup_queued" as const,
      requestId: input.requestId,
      accessRevoked: false,
      identityDeleted: false,
      remainingCleanup: uniqueRemaining,
    };
  }

  let sessionsRevoked = true;
  await assertLeaseHeld();
  try {
    const sessionIds = await input.identityProvider.listSessionIds(input.userId);
    await assertLeaseHeld();
    const results = await Promise.allSettled(
      sessionIds.map((sessionId) => input.identityProvider.revokeSession(sessionId)),
    );
    sessionsRevoked = results.every((result) => result.status === "fulfilled");
    if (sessionsRevoked) completedSteps.push("sessions_revoked");
    else remainingCleanup.push("session_revoke_audit");
  } catch {
    sessionsRevoked = false;
    remainingCleanup.push("session_revoke_audit");
  }

  let banned = false;
  await assertLeaseHeld();
  try {
    await input.identityProvider.banUser(input.userId);
    banned = true;
    completedSteps.push("identity_banned");
  } catch {
    remainingCleanup.push("identity_ban_retry");
  }

  let identityDeleted = false;
  await assertLeaseHeld();
  try {
    await input.identityProvider.deleteUser(input.userId);
    identityDeleted = true;
    completedSteps.push("identity_deleted");
  } catch {
    remainingCleanup.push("identity_delete_retry");
  }

  const accessRevoked = identityDeleted || banned;
  if (!accessRevoked) remainingCleanup.push("access_revocation");
  let uniqueRemaining = [...new Set(remainingCleanup)];
  await assertLeaseHeld();
  try {
    await input.repository.recordOutcome(input.userId, {
      accessRevoked,
      identityDeleted,
      completedSteps,
      remainingCleanup: uniqueRemaining,
      now: input.now,
    });
  } catch {
    // begin() already persisted the retry authority.
  }

  if (identityDeleted && uniqueRemaining.length === 0 && input.repository.terminalize) {
    await assertLeaseHeld();
    try {
      await input.repository.terminalize(
        input.userId,
        input.requestId,
        input.now,
        [...new Set(completedSteps)],
      );
    } catch {
      uniqueRemaining = ["terminal_anonymization_retry"];
      try {
        await input.repository.recordOutcome(input.userId, {
          accessRevoked,
          identityDeleted,
          completedSteps,
          remainingCleanup: uniqueRemaining,
          now: input.now,
        });
      } catch {
        // The non-terminal tombstone remains claimable.
      }
    }
  }

  return {
    contractVersion: "bourbon-signal/mobile-api@1" as const,
    status: uniqueRemaining.length === 0 ? "completed" as const : "cleanup_queued" as const,
    requestId: input.requestId,
    accessRevoked,
    identityDeleted,
    remainingCleanup: uniqueRemaining,
  };
}

export async function requestAccountDeletion(input: {
  userId: string;
  factorVerificationAge: [number, number] | null | undefined;
  repository: AccountDeletionRepository;
  identityProvider: AccountDeletionIdentityProvider;
  assertLeaseHeld?: () => Promise<void>;
  now?: string;
}) {
  if (!recentAuthenticationIsValid(input.factorVerificationAge)) {
    throw new AccountDeletionRecentAuthenticationError();
  }
  const assertLeaseHeld = input.assertLeaseHeld || (async () => {});
  await assertLeaseHeld();
  const now = input.now || new Date().toISOString();
  const queued = await input.repository.begin(input.userId, now);
  await assertLeaseHeld();
  return continueAccountDeletion({
    userId: input.userId,
    requestId: queued.requestId,
    repository: input.repository,
    identityProvider: input.identityProvider,
    assertLeaseHeld,
    now,
  });
}

export async function drainAccountDeletionCleanup(input: {
  repository: AccountDeletionRepository;
  identityProvider: AccountDeletionIdentityProvider;
  limit?: number;
  now?: string;
}) {
  if (!input.repository.claimCleanupBatch || !input.repository.terminalize) {
    throw new Error("Account deletion repository does not provide durable cleanup authority.");
  }
  const now = input.now || new Date().toISOString();
  const items = await input.repository.claimCleanupBatch(now, Math.max(1, Math.min(50, input.limit || 10)));
  let completed = 0;
  for (const item of items) {
    try {
      const result = await continueAccountDeletion({
        userId: item.userId,
        requestId: item.requestId,
        repository: input.repository,
        identityProvider: input.identityProvider,
        now,
      });
      if (result.status === "completed") completed += 1;
    } catch {
      // The lease expires and the durable request remains claimable.
    }
  }
  return { claimed: items.length, completed, pending: items.length - completed };
}
