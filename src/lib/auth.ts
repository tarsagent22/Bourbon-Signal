"use client";

import { useEffect } from "react";
import { useUser, useClerk } from "@clerk/nextjs";
import { getEntitlements, isPaidTier, resolveEffectiveMembershipTier } from "@/lib/entitlements";

export function useAuth() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut, openSignIn } = useClerk();

  const memberTier = isSignedIn ? resolveEffectiveMembershipTier(user?.publicMetadata || null) : "free";
  const entitlements = getEntitlements(user?.publicMetadata || memberTier);
  const isPaidUser = isPaidTier(user?.publicMetadata || memberTier);
  const rawMemberNumber = Number(user?.publicMetadata?.memberNumber || user?.publicMetadata?.founderNumber || 0);
  const memberNumber = Number.isFinite(rawMemberNumber) && rawMemberNumber > 0 ? rawMemberNumber : 0;

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) return;
    const needsCheckoutRecovery = memberTier === "free";
    const needsFounderNumber = memberTier === "bottled-in-bond" && memberNumber === 0;
    if (!needsCheckoutRecovery && !needsFounderNumber) return;

    const recoverMode = needsFounderNumber ? "founder_number" : "checkout";
    const key = `bourbon_signal_${recoverMode}_recover_${user.id}`;
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
  }, [isLoaded, isSignedIn, memberNumber, memberTier, user]);

  return {
    isLoaded,
    isSignedIn: !!isSignedIn,
    memberTier,
    entitlements,
    isPaidUser,
    memberNumber,
    user,
    signIn: () => openSignIn(),
    signUp: () => {
      if (typeof window !== "undefined") {
        window.location.href = "/sign-up?redirect_url=/pricing";
      }
    },
    signOut: () => signOut(),
  };
}
