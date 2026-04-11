import { create } from "zustand";
import { persist } from "zustand/middleware";

interface HuntTarget {
  bottleId: string;
  storeIds: string[];
  createdAt: number;
}

interface WatchlistState {
  watchedBottles: string[];
  huntTargets: HuntTarget[];
  addBottle: (id: string) => void;
  removeBottle: (id: string) => void;
  isWatching: (id: string) => boolean;
  saveHuntTarget: (target: HuntTarget) => void;
  removeHuntTarget: (bottleId: string) => void;
}

export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set, get) => ({
      watchedBottles: [],
      huntTargets: [],
      addBottle: (id: string) =>
        set((state) => ({
          watchedBottles: state.watchedBottles.includes(id)
            ? state.watchedBottles
            : [...state.watchedBottles, id],
        })),
      removeBottle: (id: string) =>
        set((state) => ({
          watchedBottles: state.watchedBottles.filter((b) => b !== id),
        })),
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
