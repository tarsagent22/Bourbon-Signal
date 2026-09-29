import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { normalizeAlertDeliveryTimeZone } from "@/lib/alert-delivery-window";
import { withMemberAlertLease } from "@/lib/alert-queue/member-lease";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
  const body = await request.json().catch(() => null) as { timeZone?: unknown } | null;
  const timeZone = normalizeAlertDeliveryTimeZone(body?.timeZone);
  if (!timeZone) return NextResponse.json({ ok: false, error: "Invalid timezone" }, { status: 400, headers: PRIVATE_HEADERS });
  try {
    const leased = await withMemberAlertLease(userId, async (assertHeld) => {
      const client = await clerkClient();
      await assertHeld();
      await client.users.updateUserMetadata(userId, { privateMetadata: { lifecycleTimeZone: timeZone } });
      return true;
    }, { requireDurable: true });
    if (!leased.acquired) {
      return NextResponse.json({ ok: false, error: "Member state is busy. Retry shortly." }, { status: 409, headers: PRIVATE_HEADERS });
    }
    return NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ ok: false, error: "Member state is temporarily unavailable." }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
