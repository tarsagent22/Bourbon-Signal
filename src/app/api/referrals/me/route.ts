import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { normalizeMembershipTier } from "@/lib/entitlements";
import { getReferralRepository } from "@/lib/referral-repository";
import { ensureMemberReferralCode } from "@/lib/referral-service";

export const dynamic = "force-dynamic";

function primaryEmail(user: Awaited<ReturnType<Awaited<ReturnType<typeof clerkClient>>["users"]["getUser"]>>) {
  return user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)?.emailAddress
    || user.emailAddresses[0]?.emailAddress
    || "";
}

function sightingPoints(privateMetadata: Record<string, unknown>) {
  const rewards = privateMetadata.memberRewards && typeof privateMetadata.memberRewards === "object"
    ? privateMetadata.memberRewards as Record<string, unknown>
    : {};
  const points = Number(rewards.points || 0);
  return Number.isFinite(points) && points > 0 ? Math.floor(points) : 0;
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Account required" }, { status: 401 });

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const email = primaryEmail(user);
    if (!email) return NextResponse.json({ error: "A verified email is required" }, { status: 422 });

    const code = await ensureMemberReferralCode({ userId, email });
    const summary = await getReferralRepository().readSummary(userId);
    if (!summary) throw new Error("Referral profile was not created");

    const tier = normalizeMembershipTier(user.publicMetadata?.tier || user.publicMetadata?.membershipTier);
    const communityPoints = sightingPoints(user.privateMetadata as Record<string, unknown>);
    const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

    return NextResponse.json({
      code,
      referralLink: `${origin.replace(/\/$/, "")}/r/${code}`,
      referralPoints: summary.referralPoints,
      communityPoints,
      totalPoints: summary.referralPoints + communityPoints,
      freePointsAwarded: summary.freePointsAwarded,
      referrals: {
        total: summary.totalReferrals,
        free: summary.freeReferrals,
        standard: summary.standardReferrals,
        barrel: summary.barrelReferrals,
        founder: summary.founderReferrals,
      },
      founderGlassesEarned: summary.founderGlassesEarned,
      founderGlassesAwaitingAddress: summary.founderGlassesAwaitingAddress,
      redemptionEligible: tier !== "free",
      tier,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Referral summary failed", error);
    return NextResponse.json({ error: "Referral details are temporarily unavailable" }, { status: 503 });
  }
}
