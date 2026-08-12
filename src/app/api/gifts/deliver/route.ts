import { NextRequest, NextResponse } from "next/server";
import { assertGiftDeliveryAuthorized, resolveGiftDeliveryMode, runGiftDelivery } from "@/lib/gift-delivery";
import { runGiftAdverseReconciliation, runGiftExpiryReconciliation } from "@/lib/gift-expiry";
import { runDirectFounderActivationReconciliation, runGiftActivationReconciliation } from "@/lib/gift-activation";
import { runLatePaymentRefundReconciliation } from "@/lib/gift-refunds";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

async function run(request: NextRequest) {
  try {
    assertGiftDeliveryAuthorized(request);
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
  }
  const requestLive = request.nextUrl.searchParams.get("live") === "1";
  try {
    const mode = resolveGiftDeliveryMode(requestLive);
    if (mode !== "live") {
      const gifts = await runGiftDelivery({ requestLive });
      return NextResponse.json({
        ok: gifts.ok,
        gifts,
        mutationReconcilers: { mode: "skipped", reason: mode === "dry_run" ? "live_mode_not_requested" : "live_mode_not_enabled" },
      }, { headers: PRIVATE_HEADERS });
    }
    const [gifts, giftExpiry, giftAdverse, giftActivation, directFounderActivation, latePaymentRefunds] = await Promise.all([
      runGiftDelivery({ requestLive }),
      runGiftExpiryReconciliation(),
      runGiftAdverseReconciliation(),
      runGiftActivationReconciliation(),
      runDirectFounderActivationReconciliation(),
      runLatePaymentRefundReconciliation(),
    ]);
    return NextResponse.json({
      ok: gifts.ok && giftExpiry.ok && giftAdverse.ok && giftActivation.ok
        && directFounderActivation.ok && latePaymentRefunds.ok,
      gifts, giftExpiry, giftAdverse, giftActivation, directFounderActivation, latePaymentRefunds,
    }, { headers: PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ ok: false, error: "Gift delivery run failed" }, { status: 500, headers: PRIVATE_HEADERS });
  }
}

export async function GET(request: NextRequest) { return run(request); }
export async function POST(request: NextRequest) { return run(request); }
