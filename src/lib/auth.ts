import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  isSignedIn: boolean;
  memberTier: "bottled-in-bond" | "standard" | null;
  memberNumber: number;
  signIn: () => void;
  signOut: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      isSignedIn: false,
      memberTier: null,
      memberNumber: 7,
      signIn: () =>
        set({ isSignedIn: true, memberTier: "bottled-in-bond", memberNumber: 7 }),
      signOut: () =>
        set({ isSignedIn: false, memberTier: null }),
    }),
    {
      name: "proof-auth",
    }
  )
);
