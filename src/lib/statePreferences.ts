import { create } from "zustand";
import { persist } from "zustand/middleware";

interface StatePreferencesStore {
  selectedStates: string[]; // e.g. ['NC', 'VA']
  hasSelectedStates: boolean; // true once the user has made a selection (even if empty means "show all")
  setSelectedStates: (states: string[]) => void;
  toggleState: (state: string) => void;
  clearPreferences: () => void;
}

export interface AvailableState {
  code: string;
  name: string;
  active: boolean;
  comingSoon?: boolean;
}

export const AVAILABLE_STATES: readonly AvailableState[] = [
  { code: "AL", name: "Alabama", active: true },
  { code: "NC", name: "North Carolina", active: true },
  { code: "VA", name: "Virginia", active: true },
  { code: "PA", name: "Pennsylvania", active: true },
  { code: "IN", name: "Indiana", active: true },
  { code: "KY", name: "Kentucky", active: true },
  { code: "OH", name: "Ohio", active: true },
  { code: "IA", name: "Iowa", active: true },
  { code: "ME", name: "Maine", active: true },
  { code: "UT", name: "Utah", active: true },
  { code: "WV", name: "West Virginia", active: true },
  { code: "MD-MONTGOMERY", name: "Montgomery, MD", active: true },
  { code: "TN", name: "Tennessee", active: true },
  { code: "IL", name: "Illinois", active: true },
] as const;

export const useStatePreferences = create<StatePreferencesStore>()(
  persist(
    (set) => ({
      selectedStates: [],
      hasSelectedStates: false,
      setSelectedStates: (states) =>
        set({ selectedStates: states, hasSelectedStates: true }),
      toggleState: (state) =>
        set((prev) => {
          const next = prev.selectedStates.includes(state)
            ? prev.selectedStates.filter((s) => s !== state)
            : [...prev.selectedStates, state];
          return { selectedStates: next, hasSelectedStates: true };
        }),
      clearPreferences: () =>
        set({ selectedStates: [], hasSelectedStates: false }),
    }),
    { name: "proof-state-preferences" }
  )
);
