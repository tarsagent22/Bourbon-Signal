import { clerkClient } from "@clerk/nextjs/server";
import type { AccountDeletionIdentityProvider } from "./account-deletion.ts";
import { normalizeNotificationPreferences } from "./notification-preferences";

function identityIsMissing(error: unknown) {
  const candidate = error as { status?: unknown; statusCode?: unknown; errors?: Array<{ code?: unknown }> };
  return candidate?.status === 404
    || candidate?.statusCode === 404
    || candidate?.errors?.some((entry) => entry.code === "resource_not_found") === true;
}

async function ignoreMissing(operation: () => Promise<void>) {
  try {
    await operation();
  } catch (error) {
    if (!identityIsMissing(error)) throw error;
  }
}

export async function createAccountDeletionIdentityProvider(): Promise<AccountDeletionIdentityProvider> {
  const client = await clerkClient();
  return {
    disableDeliveryMetadata: async (targetUserId, requestId, now) => {
      await ignoreMissing(async () => {
        const user = await client.users.getUser(targetUserId);
        const current = normalizeNotificationPreferences(user.publicMetadata?.notificationPreferences);
        await client.users.updateUserMetadata(targetUserId, {
          publicMetadata: {
            notificationPreferences: {
              ...current,
              onSite: { enabled: false },
              push: { enabled: false },
              email: { ...current.email, enabled: false },
              sms: { available: current.sms.available, enabled: false, mode: current.sms.mode, verified: false },
              sightings: { enabled: false },
              weeklyIntelligence: {
                ...current.weeklyIntelligence,
                emailEnabled: false,
                unsubscribedAt: now,
                version: current.weeklyIntelligence.version + 1,
              },
            },
          },
          privateMetadata: {
            pushDevices: [],
            pushDeliveryReceipts: { pending: [] },
            pushPreferenceProjection: { status: "saved", enabled: false, updatedAt: now },
            accountDeletion: { requestId, requestedAt: now },
          },
        });
      });
    },
    listSessionIds: async (targetUserId) => {
      const ids: string[] = [];
      try {
        for (let offset = 0; ; offset += 100) {
          const page = await client.sessions.getSessionList({ userId: targetUserId, limit: 100, offset });
          ids.push(...page.data.map((session) => session.id));
          if (ids.length >= page.totalCount || page.data.length < 100) break;
        }
      } catch (error) {
        if (!identityIsMissing(error)) throw error;
      }
      return ids;
    },
    revokeSession: async (sessionId) => {
      await ignoreMissing(async () => { await client.sessions.revokeSession(sessionId); });
    },
    banUser: async (targetUserId) => {
      await ignoreMissing(async () => { await client.users.banUser(targetUserId); });
    },
    deleteUser: async (targetUserId) => {
      await ignoreMissing(async () => { await client.users.deleteUser(targetUserId); });
    },
  };
}
