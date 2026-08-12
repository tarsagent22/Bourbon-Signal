import { NextRequest, NextResponse } from "next/server";
import { requireOwnerApiAccess } from "@/lib/owner-auth";
import { readBottleContributionQueue, updateBottleContribution } from "@/lib/bottle-contributions";
import { bottleContributionStatusForAction, isBottleContributionPending } from "@/lib/admin-review";
import { upsertApprovedBottle } from "@/lib/approved-catalog-service";
import type { ApprovedBottleAvailability, ApprovedBottleCategory } from "@/lib/approved-catalog";

export async function GET() {
  const owner = await requireOwnerApiAccess({ forbidden: "Admin only" });
  if (owner.error) return owner.error;
  const queue = await readBottleContributionQueue();
  return NextResponse.json({ ok: true, queue, contributions: queue.contributions });
}

export async function PATCH(req: NextRequest) {
  const owner = await requireOwnerApiAccess({ forbidden: "Admin only" });
  if (owner.error) return owner.error;
  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof payload.id === "string" ? payload.id : "";
  const action = typeof payload.action === "string" ? payload.action : "";
  if (!id) return NextResponse.json({ error: "Missing contribution" }, { status: 400 });
  const status = bottleContributionStatusForAction(action);
  if (!status) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  let catalogResult = null;
  if (action === "confirm_added") {
    const catalogBottle = payload.catalogBottle && typeof payload.catalogBottle === "object"
      ? payload.catalogBottle as Record<string, unknown>
      : null;
    if (!catalogBottle) return NextResponse.json({ error: "Bottle catalog details are required" }, { status: 400 });
    catalogResult = await upsertApprovedBottle({
      canonicalName: String(catalogBottle.canonicalName || ""),
      brand: String(catalogBottle.brand || ""),
      category: String(catalogBottle.category || "") as ApprovedBottleCategory,
      availability: String(catalogBottle.availability || "") as ApprovedBottleAvailability,
    }, owner.userId, "bottle_queue");
    const { clearBourbonBibleCache } = await import("@/lib/bourbonBible");
    clearBourbonBibleCache();
  }
  const updated = await updateBottleContribution(id, {
    status,
    candidateBottleId: typeof payload.candidateBottleId === "string" ? payload.candidateBottleId : undefined,
    candidateBottleName: typeof payload.candidateBottleName === "string" ? payload.candidateBottleName : undefined,
    notes: typeof payload.notes === "string" ? payload.notes.slice(0, 1000) : `Marked ${status} by admin.`,
  });
  return NextResponse.json({
    ok: true,
    pendingReview: isBottleContributionPending(updated.status),
    contribution: updated,
    catalogResult,
  });
}
