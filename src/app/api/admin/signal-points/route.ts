import { NextRequest, NextResponse } from "next/server";
import { requireOwnerApiAccess } from "@/lib/owner-auth";
import { SIGNAL_REDEMPTION_STATES, type SignalRedemptionState } from "@/lib/signal-points";
import { createSignalPointsRepository } from "@/lib/signal-points-repository";

export async function GET() {
  const owner = await requireOwnerApiAccess(); if (owner.error) return owner.error;
  try { return NextResponse.json({ queue: await createSignalPointsRepository().listOwnerQueue() }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { console.error("Signal reward queue failed", error); return NextResponse.json({ error: "Reward queue unavailable" }, { status: 503 }); }
}
export async function PATCH(request: NextRequest) {
  const owner = await requireOwnerApiAccess(); if (owner.error) return owner.error;
  try {
    const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (typeof payload.redemptionId !== "string" || !SIGNAL_REDEMPTION_STATES.includes(payload.status as SignalRedemptionState)) return NextResponse.json({ error: "Invalid transition" }, { status: 400 });
    const result = await createSignalPointsRepository().transition({
      redemptionId: payload.redemptionId, actorId: owner.userId, actorRole: "owner", nextStatus: payload.status as SignalRedemptionState,
      metadata: {
        note: typeof payload.note === "string" ? payload.note.slice(0, 500) : "",
        carrier: typeof payload.carrier === "string" ? payload.carrier.trim().slice(0, 80) : "",
        trackingNumber: typeof payload.trackingNumber === "string" ? payload.trackingNumber.trim().slice(0, 160) : "",
      },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) { console.error("Signal reward transition failed", error); return NextResponse.json({ error: "Transition unavailable" }, { status: 503 }); }
}
