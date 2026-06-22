"use client";

import { useUser, useClerk } from "@clerk/nextjs";
import { getEntitlements, isPaidTier, normalizeMembershipTier } from "@/lib/entitlements";

export function useAuth() {
  const { isSignedIn, user } = useUser();
  const { signOut, openSignIn } = useClerk();

  const rawTier = typeof user?.publicMetadata?.tier === "string" ? user.publicMetadata.tier : null;
  const memberTier = isSignedIn ? normalizeMembershipTier(rawTier) : "free";
  const entitlements = getEntitlements(memberTier);
  const isPaidUser = isPaidTier(memberTier);

  return {
    isSignedIn: !!isSignedIn,
    memberTier,
    entitlements,
    isPaidUser,
    memberNumber: 0,
    user,
    signIn: () => openSignIn(),
    signUp: () => {
      if (typeof window !== "undefined") {
        window.location.href = "/sign-up";
      }
    },
    signOut: () => signOut(),
  };
}
