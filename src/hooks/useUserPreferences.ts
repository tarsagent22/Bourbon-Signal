import { useStatePreferences } from "@/lib/statePreferences";

export interface UserPreferences {
  states: string[]; // e.g. ['NC', 'VA'] — ISO state codes
  stores: string[]; // Store IDs (VA ABC store IDs, etc.)
  boards: string[]; // ABC board names (NC board names)
}

export function useUserPreferences(): UserPreferences {
  const { selectedStates } = useStatePreferences();
  return {
    states: selectedStates,
    stores: [], // TODO: wire when store-level preferences exist
    boards: [], // TODO: wire when board-level preferences exist
  };
}
