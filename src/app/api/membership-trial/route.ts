import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { membershipTrialEligibility } from "@/lib/membership-trial";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Account required" }, { status: 401 });
  return NextResponse.json({
    standardMonthly: membershipTrialEligibility("standard_monthly", {}, {}),
    barrelMonthly: membershipTrialEligibility("barrel_monthly", {}, {}),
  });
}
