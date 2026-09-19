import { NextRequest } from "next/server";
import { assertAlertDeliveryAuthorized } from "@/lib/alert-delivery";
import { runPushReceiptReconciliation } from "@/lib/push-receipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function reconcile(request: NextRequest) {
  try {
    assertAlertDeliveryAuthorized(request);
  } catch {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runPushReceiptReconciliation();
    return Response.json({ ok: true, ...summary }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ ok: false, error: "Push receipt reconciliation failed" }, { status: 503 });
  }
}

export const GET = reconcile;
export const POST = reconcile;
