import { NextRequest, NextResponse } from "next/server";
import { assertGiftDeliveryAuthorized } from "@/lib/gift-delivery";
import { runGiftExpiryReconciliation } from "@/lib/gift-expiry";

export const dynamic = "force-dynamic";
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

export async function POST(request: NextRequest) {
  try { assertGiftDeliveryAuthorized(request); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE_HEADERS }); }
  // The Clerk giftOrderId and membershipUpdatedAt ownership check prevents an expired gift from replacing newer paid access.
  return NextResponse.json(await runGiftExpiryReconciliation(100), { headers: PRIVATE_HEADERS });
}
