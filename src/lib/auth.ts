"use client";

import { useUser, useClerk } from "@clerk/nextjs";

export function useAuth() {
  const { isSignedIn, user } = useUser();
  const { signOut, openSignIn } = useClerk();

  // For now, all signed-in users are treated as "standard" tier
  // Tier info will come from Stripe metadata later
  const memberTier = isSignedIn ? "standard" : null;

  return {
    isSignedIn: !!isSignedIn,
    memberTier,
    memberNumber: 0, // will be assigned later
    user,
    signIn: () => openSignIn(),
    signOut: () => signOut(),
  };
}
