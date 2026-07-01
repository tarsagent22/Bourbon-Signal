import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { FOUNDER_SPOT_LIMIT } from "@/lib/entitlements";
import { countFounderMemberships, type FounderAllocationUser } from "@/lib/founder-allocation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const client = await clerkClient();
    const result = await client.users.getUserList({ limit: 500 });
    const users = (Array.isArray(result) ? result : result.data) as FounderAllocationUser[];
    const claimed = countFounderMemberships(users);
    const remaining = Math.max(0, FOUNDER_SPOT_LIMIT - claimed);
    return NextResponse.json({ limit: FOUNDER_SPOT_LIMIT, claimed, remaining });
  } catch {
    return NextResponse.json({ limit: FOUNDER_SPOT_LIMIT, claimed: null, remaining: null }, { status: 200 });
  }
}
