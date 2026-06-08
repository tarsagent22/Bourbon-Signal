"use client";

import { useUser, useClerk } from "@clerk/nextjs";

const PAID_TIERS = new Set([
  "standard",
  "bottled-in-bond",
  "monthly",
  "annual",
  "founder",
  "lifetime",
]);

export function useAuth() {
  const { isSignedIn, user } = useUser();
  const { signOut, openSignIn, openSignUp } = useClerk();

  const rawTier = typeof user?.publicMetadata?.tier === "string" ? user.publicMetadata.tier : null;
  const memberTier = isSignedIn ? rawTier : null;
  const isPaidUser = !!memberTier && PAID_TIERS.has(memberTier);

  return {
    isSignedIn: !!isSignedIn,
    memberTier,
    isPaidUser,
    memberNumber: 0,
    user,
    signIn: () => openSignIn(),
    signUp: () => openSignUp(),
    signOut: () => signOut(),
  };
}
