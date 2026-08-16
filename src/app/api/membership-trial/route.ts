import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { hasActiveGiftMembership, membershipTrialEligibility } from "@/lib/membership-trial";
import { getMembershipTrialRepository } from "@/lib/membership-trial-repository";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Account required" }, { status: 401 });
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const publicMetadata = user.publicMetadata as Record<string, unknown>;
  const privateMetadata = user.privateMetadata as Record<string, unknown>;
  if (hasActiveGiftMembership(publicMetadata)) {
    return NextResponse.json({
      standardMonthly: { eligible: false, reason: "active_gift" },
      barrelMonthly: { eligible: false, reason: "active_gift" },
    });
  }

  try {
    if (await getMembershipTrialRepository().findByUserId(userId)) {
      return NextResponse.json({
        standardMonthly: { eligible: false, reason: "already_used" },
        barrelMonthly: { eligible: false, reason: "already_used" },
      });
    }
  } catch (error) {
    console.error("membership trial eligibility storage failed", { userId, error });
    return NextResponse.json({ error: "Trial eligibility is temporarily unavailable." }, { status: 503 });
  }

  return NextResponse.json({
    standardMonthly: membershipTrialEligibility("standard_monthly", publicMetadata, privateMetadata),
    barrelMonthly: membershipTrialEligibility("barrel_monthly", publicMetadata, privateMetadata),
  });
}
