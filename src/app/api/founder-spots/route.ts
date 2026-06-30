import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { FOUNDER_SPOT_LIMIT } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const client = await clerkClient();
    const result = await client.users.getUserList({ limit: 500 });
    const users = Array.isArray(result) ? result : result.data;
    const claimed = users.filter((user) => {
      const tier = user.publicMetadata?.tier || user.publicMetadata?.membershipTier;
      const plan = user.publicMetadata?.plan || user.publicMetadata?.billingPlan;
      return tier === "bottled-in-bond" || plan === "bib_lifetime";
    }).length;
    const remaining = Math.max(0, FOUNDER_SPOT_LIMIT - claimed);
    return NextResponse.json({ limit: FOUNDER_SPOT_LIMIT, claimed, remaining });
  } catch {
    return NextResponse.json({ limit: FOUNDER_SPOT_LIMIT, claimed: null, remaining: null }, { status: 200 });
  }
}
