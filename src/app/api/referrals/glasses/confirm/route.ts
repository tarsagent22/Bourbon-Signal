import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { readFounderShippingForUser } from "@/lib/founder-shipping-repository";
import { getReferralRepository } from "@/lib/referral-repository";

export const dynamic = "force-dynamic";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Account required" }, { status: 401 });

  const shipping = await readFounderShippingForUser(userId);
  if (!shipping || shipping.status === "packed" || shipping.status === "shipped") {
    return NextResponse.json({ error: "Review and save your shipping address before confirming this glass." }, { status: 409 });
  }

  const confirmed = await getReferralRepository().confirmGlassAddress(userId);
  return NextResponse.json({ ok: true, confirmed });
}
