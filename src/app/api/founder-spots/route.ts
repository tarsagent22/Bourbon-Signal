import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { FOUNDER_SPOT_LIMIT } from "@/lib/entitlements";
import { countFounderMemberships } from "@/lib/founder-allocation";
import { reconcileAllFounderReservationAuthority } from "@/lib/founder-reservations";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const client = await clerkClient();
    const { users, availability: durable } = await reconcileAllFounderReservationAuthority(client);
    const claimed = Math.max(countFounderMemberships(users), durable.claimed);
    const remaining = Math.max(0, Math.min(durable.remaining, FOUNDER_SPOT_LIMIT - claimed));
    return NextResponse.json({ limit: FOUNDER_SPOT_LIMIT, claimed, remaining });
  } catch {
    return NextResponse.json({ limit: FOUNDER_SPOT_LIMIT, claimed: null, remaining: null }, { status: 200 });
  }
}
