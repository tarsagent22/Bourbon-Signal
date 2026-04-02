import { create } from "zustand";
import { persist } from "zustand/middleware";

interface StatePreferencesStore {
  selectedStates: string[]; // e.g. ['NC', 'VA']
  hasSelectedStates: boolean; // true once the user has made a selection (even if empty means "show all")
  setSelectedStates: (states: string[]) => void;
  toggleState: (state: string) => void;
  clearPreferences: () => void;
}

export const AVAILABLE_STATES = [
  { code: "NC", name: "North Carolina", active: true },
  { code: "VA", name: "Virginia", active: true },
  { code: "PA", name: "Pennsylvania", active: true },
  { code: "UT", name: "Utah", active: false, comingSoon: true },
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
