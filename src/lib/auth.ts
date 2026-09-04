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
    try { if (typeof window !== "undefined" && window.sessionStorage.getItem(key) === "1") return; } catch { /* Storage can be disabled. */ }
    if (typeof window === "undefined") return;
    type RecoveryJob = { running: boolean; cooldownUntil: number; consumers: Set<symbol>; timer?: ReturnType<typeof setTimeout> };
    // Window-scoped, not server-global: all mounted useAuth callers share one
    // bounded job per member/mode, even when browser storage is disabled.
    const browser = window as typeof window & { bourbonSignalRecoveryJobs?: Map<string, RecoveryJob> };
    const jobs = browser.bourbonSignalRecoveryJobs ??= new Map<string, RecoveryJob>();
    for (const [jobKey, job] of jobs) {
      if (!job.running && job.cooldownUntil <= Date.now()) jobs.delete(jobKey);
    }
    let job = jobs.get(key);
    if (!job) {
      if (jobs.size >= 64) return;
      job = { running: false, cooldownUntil: 0, consumers: new Set() };
      jobs.set(key, job);
    }
    const current = job;
    const consumer = Symbol();
    current.consumers.add(consumer);
    const finish = () => {
      current.running = false;
      current.timer = undefined;
      // Negative results and exhausted transient failures are temporary. A
      // later checkout can be recovered after this short cooldown.
      current.cooldownUntil = Date.now() + 30_000;
    };
    const recover = async (attempt: number) => {
      current.timer = undefined;
      if (!current.consumers.size) { finish(); jobs.delete(key); return; }
      try {
        const res = await fetch("/api/checkout/recover", { method: "POST" });
        if (!current.consumers.size) { finish(); jobs.delete(key); return; }
        if (res.ok) {
          const data = await res.json() as { ok?: boolean; activated?: boolean };
          if (data.ok === true && data.activated === true) {
            await user.reload();
            try { window.sessionStorage.setItem(key, "1"); } catch { /* Storage may be disabled. */ }
            finish();
            return;
          }
          if (data.ok === true && data.activated === false) { finish(); return; }
        } else if (res.status < 500 && res.status !== 429) { finish(); return; }
      } catch { /* Preserve bounded retries for transient failures. */ }
      if (current.consumers.size && attempt < 2) {
        current.timer = setTimeout(() => { void recover(attempt + 1); }, 1_000 * 4 ** attempt);
      } else finish();
    };
    if (!current.running && current.cooldownUntil <= Date.now()) {
      current.running = true;
      void recover(0);
    }
    return () => {
      current.consumers.delete(consumer);
      if (!current.consumers.size && current.timer !== undefined) {
        clearTimeout(current.timer);
        finish();
        jobs.delete(key);
      }
    };
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
        window.location.href = "/sign-up";
      }
    },
    signOut: () => signOut(),
  };
}
