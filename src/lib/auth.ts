"use client";

import { useEffect } from "react";
import { useUser, useClerk } from "@clerk/nextjs";
import { getEntitlements, isPaidTier, normalizeMembershipTier } from "@/lib/entitlements";
import { getQaPreviewTierFromBrowser, isQaPreviewMode } from "@/lib/preview-qa";

export function useAuth() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut, openSignIn } = useClerk();
  const qaPreview = isQaPreviewMode();

  const previewTier = qaPreview ? getQaPreviewTierFromBrowser() : null;
  const rawTier = qaPreview
    ? previewTier
    : typeof user?.publicMetadata?.tier === "string"
      ? user.publicMetadata.tier
      : typeof user?.publicMetadata?.membershipTier === "string"
        ? user.publicMetadata.membershipTier
        : null;
  const memberTier = qaPreview || isSignedIn ? normalizeMembershipTier(rawTier) : "free";
  const entitlements = getEntitlements(memberTier);
  const isPaidUser = isPaidTier(memberTier);
  const rawMemberNumber = qaPreview ? 1 : Number(user?.publicMetadata?.memberNumber || user?.publicMetadata?.founderNumber || 0);
  const memberNumber = Number.isFinite(rawMemberNumber) && rawMemberNumber > 0 ? rawMemberNumber : 0;
  const qaUser = qaPreview
    ? ({
        firstName: "QA Preview",
        publicMetadata: { tier: memberTier },
        emailAddresses: [{ emailAddress: `${memberTier}@bourbonsignal.local` }],
      } as unknown as typeof user)
    : user;

  useEffect(() => {
    if (qaPreview || !isLoaded || !isSignedIn || !user || memberTier !== "free") return;
    const key = `bourbon_signal_checkout_recover_${user.id}`;
    if (typeof window !== "undefined" && window.sessionStorage.getItem(key) === "1") return;
    if (typeof window !== "undefined") window.sessionStorage.setItem(key, "1");

    fetch("/api/checkout/recover", { method: "POST" })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { activated?: boolean };
      })
      .then(async (data) => {
        if (data?.activated) await user.reload();
      })
      .catch(() => {});
  }, [isLoaded, isSignedIn, memberTier, qaPreview, user]);

  return {
    isLoaded: qaPreview || isLoaded,
    isSignedIn: qaPreview || !!isSignedIn,
    memberTier,
    entitlements,
    isPaidUser,
    memberNumber,
    user: qaUser,
    signIn: () => {
      if (!qaPreview) openSignIn();
    },
    signUp: () => {
      if (qaPreview) return;
      if (typeof window !== "undefined") {
        window.location.href = "/sign-up?redirect_url=/pricing";
      }
    },
    signOut: () => {
      if (!qaPreview) signOut();
    },
  };
}
