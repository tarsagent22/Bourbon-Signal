import type { MembershipTier } from "@/lib/entitlements";
import {
  getReferralRepository,
  hashReferralEmail,
  referralHashSecret,
  type ReferralRepository,
} from "./referral-repository";
import { normalizeReferralCode } from "./referrals";

export async function claimReferralAtSignup(input: {
  userId: string;
  email: string;
  referralCode: unknown;
  hashSecret?: string;
  repository?: Pick<ReferralRepository, "claimReferral">;
}) {
  const code = normalizeReferralCode(input.referralCode);
  if (!code) return { status: "no_referral", pointsAwarded: 0 };
  const repository = input.repository || getReferralRepository();
  const secret = input.hashSecret || referralHashSecret();
  return repository.claimReferral({
    referredUserId: input.userId,
    code,
    referredEmailHash: hashReferralEmail(input.email, secret),
  });
}

export async function ensureMemberReferralCode(input: {
  userId: string;
  email: string;
  hashSecret?: string;
  repository?: Pick<ReferralRepository, "ensureCode">;
}) {
  const repository = input.repository || getReferralRepository();
  const secret = input.hashSecret || referralHashSecret();
  return repository.ensureCode({
    referrerUserId: input.userId,
    emailHash: hashReferralEmail(input.email, secret),
  });
}

export async function reconcileReferredMembership(input: {
  userId: string;
  tier: MembershipTier;
  sourceEventId?: string | null;
  repository?: Pick<ReferralRepository, "reconcileTier">;
}) {
  const repository = input.repository || getReferralRepository();
  return repository.reconcileTier({
    referredUserId: input.userId,
    tier: input.tier,
    sourceEventId: input.sourceEventId || null,
  });
}
