import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSignalPointsRepository } from "@/lib/signal-points-repository";
import { resolveServerEffectiveMembershipTier } from "@/lib/server-entitlements";
import { readFounderShippingForUser } from "@/lib/founder-shipping-repository";

export const dynamic = "force-dynamic";
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Account required" }, { status: 401, headers: PRIVATE_HEADERS });
  try {
    const user = await (await clerkClient()).users.getUser(userId);
    const repository = createSignalPointsRepository();
    await repository.assertCutoverVerified();
    const tier = await resolveServerEffectiveMembershipTier(user.publicMetadata);
    const [summary, shipping] = await Promise.all([repository.readMember(userId), readFounderShippingForUser(userId)]);
    return NextResponse.json({
      ...summary,
      tier,
      redemptionEligible: tier !== "free",
      shippingProfile: shipping ? { recipientName: shipping.recipientName, city: shipping.city, stateCode: shipping.stateCode, postalCode: shipping.postalCode } : null,
    }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    console.error("Signal Points summary failed", error);
    return NextResponse.json({ error: "Signal Points are temporarily unavailable" }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
