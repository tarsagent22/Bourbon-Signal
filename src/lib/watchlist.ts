import { create } from "zustand";
import { persist } from "zustand/middleware";

interface HuntTarget {
  bottleId: string;
  storeIds: string[];
  createdAt: number;
}

interface WatchlistState {
  watchedBottles: string[];
  watchedBottleNames: Record<string, string>;
  huntTargets: HuntTarget[];
  addBottle: (id: string, name?: string) => void;
  removeBottle: (id: string) => void;
  isWatching: (id: string) => boolean;
  saveHuntTarget: (target: HuntTarget) => void;
  removeHuntTarget: (bottleId: string) => void;
}

export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set, get) => ({
      watchedBottles: [],
      watchedBottleNames: {},
      huntTargets: [],
      addBottle: (id: string, name?: string) =>
        set((state) => ({
          watchedBottles: state.watchedBottles.includes(id)
            ? state.watchedBottles
            : [...state.watchedBottles, id],
          watchedBottleNames: name ? { ...state.watchedBottleNames, [id]: name } : state.watchedBottleNames,
        })),
      removeBottle: (id: string) =>
        set((state) => {
          const watchedBottleNames = { ...state.watchedBottleNames };
          delete watchedBottleNames[id];
          return {
            watchedBottles: state.watchedBottles.filter((b) => b !== id),
            watchedBottleNames,
          };
        }),
      isWatching: (id: string) => get().watchedBottles.includes(id),
      saveHuntTarget: (target: HuntTarget) =>
        set((state) => ({
          huntTargets: [
            target,
            ...state.huntTargets.filter((existing) => existing.bottleId !== target.bottleId),
          ],
        })),
      removeHuntTarget: (bottleId: string) =>
        set((state) => ({
          huntTargets: state.huntTargets.filter((target) => target.bottleId !== bottleId),
        })),
    }),
    {
      name: "proof-watchlist",
    }
  )
);
