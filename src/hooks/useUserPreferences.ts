/**
 * useUserPreferences — User area preference hook
 *
 * Currently returns empty preferences (all filters disabled).
 *
 * TODO: Wire to Clerk profile metadata or a Zustand auth store once
 * preference saving is implemented. Example integration points:
 *   - Clerk: `user.unsafeMetadata.preferences` via `useUser()` from @clerk/nextjs
 *   - Zustand: `usePreferencesStore()` once a preferences store is created
 *   - API: fetch from `/api/preferences` on mount if server-stored
 *
 * When wired, states/stores/boards should be populated from the user's saved
 * preferences so that DropHistoryModal (and other consumers) can filter results
 * to their preferred area automatically.
 */

export interface UserPreferences {
  states: string[]; // e.g. ['NC', 'VA'] — ISO state codes
  stores: string[]; // Store IDs (VA ABC store IDs, etc.)
  boards: string[]; // ABC board names (NC board names)
}

export function useUserPreferences(): UserPreferences {
  // TODO: Wire to Clerk profile or auth store once preferences are saved
  // For now, always return empty — all filters disabled
  return {
    states: [],
    stores: [],
    boards: [],
  };
}
