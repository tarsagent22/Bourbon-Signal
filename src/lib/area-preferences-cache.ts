import type { UserAlertPreferences } from "@/app/api/user/preferences/route";

interface AreaPreferencesCacheEntry {
  userId: string;
  preferences: UserAlertPreferences;
}

let cacheEntry: AreaPreferencesCacheEntry | null = null;

export function getCachedAreaPreferences(userId: string | null) {
  return userId && cacheEntry?.userId === userId ? cacheEntry.preferences : null;
}

export function setCachedAreaPreferences(userId: string, preferences: UserAlertPreferences) {
  cacheEntry = { userId, preferences };
}

export function invalidateAreaPreferencesCacheForUser(userId: string | null) {
  if (!userId || cacheEntry?.userId !== userId) cacheEntry = null;
}

export function clearCachedAreaPreferences(userId?: string) {
  if (!userId || cacheEntry?.userId === userId) cacheEntry = null;
}
