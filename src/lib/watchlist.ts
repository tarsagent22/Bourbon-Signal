import { create } from "zustand";
import { persist } from "zustand/middleware";

interface WatchlistState {
  watchedBottles: string[];
  addBottle: (id: string) => void;
  removeBottle: (id: string) => void;
  isWatching: (id: string) => boolean;
}

export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set, get) => ({
      watchedBottles: [],
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
    }),
    {
      name: "proof-watchlist",
    }
  )
);
