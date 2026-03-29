"use client";

import { useUser, useClerk } from "@clerk/nextjs";

export function useAuth() {
  const { isSignedIn, user } = useUser();
  const { signOut, openSignIn } = useClerk();

  // Tier is null until Stripe confirms payment via webhook + user metadata
  // TODO: Read from Clerk user.publicMetadata.tier once webhook writes it
  const memberTier = (isSignedIn && user?.publicMetadata?.tier as string) || null;

  return {
    isSignedIn: !!isSignedIn,
    memberTier,
    memberNumber: 0, // will be assigned later
    user,
    signIn: () => openSignIn(),
    signOut: () => signOut(),
  };
}
