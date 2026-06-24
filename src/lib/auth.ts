"use client";

import { useUser, useClerk } from "@clerk/nextjs";
import { getEntitlements, isPaidTier, normalizeMembershipTier } from "@/lib/entitlements";
import { isQaPreviewMode, QA_PREVIEW_TIER } from "@/lib/preview-qa";

export function useAuth() {
  const { isSignedIn, user } = useUser();
  const { signOut, openSignIn } = useClerk();
  const qaPreview = isQaPreviewMode();

  const rawTier = qaPreview ? QA_PREVIEW_TIER : typeof user?.publicMetadata?.tier === "string" ? user.publicMetadata.tier : null;
  const memberTier = qaPreview || isSignedIn ? normalizeMembershipTier(rawTier) : "free";
  const entitlements = getEntitlements(memberTier);
  const isPaidUser = isPaidTier(memberTier);
  const qaUser = qaPreview
    ? ({
        firstName: "QA Preview",
        publicMetadata: { tier: QA_PREVIEW_TIER },
        emailAddresses: [{ emailAddress: "qa-preview@bourbonsignal.local" }],
      } as unknown as typeof user)
    : user;

  return {
    isSignedIn: qaPreview || !!isSignedIn,
    memberTier,
    entitlements,
    isPaidUser,
    memberNumber: qaPreview ? 1 : 0,
    user: qaUser,
    signIn: () => {
      if (!qaPreview) openSignIn();
    },
    signUp: () => {
      if (qaPreview) return;
      if (typeof window !== "undefined") {
        window.location.href = "/sign-up";
      }
    },
    signOut: () => {
      if (!qaPreview) signOut();
    },
  };
}
