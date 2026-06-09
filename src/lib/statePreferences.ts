import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ACTIVE_ENGINE_STATE_CODES, ACTIVE_ENGINE_STATE_NAMES } from "@/lib/activeStates";

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

export const ENGINE_COVERED_STATE_CODES = ACTIVE_ENGINE_STATE_CODES;

export const AVAILABLE_STATES: readonly AvailableState[] = ACTIVE_ENGINE_STATE_CODES.map((code) => ({
  code,
  name: ACTIVE_ENGINE_STATE_NAMES[code],
  active: true,
}));

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
