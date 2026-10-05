import { requireOwnerApiAccess } from "@/lib/owner-auth";
import { readBottleContributionQueue } from "@/lib/bottle-contributions";
import { isBottleContributionPending,bottleContributionStatusForAction } from "@/lib/admin-review";
import { getBottleById } from "@/lib/bourbonBible";
import { resolveOwnerBottleSubmission } from "@/lib/owner-admin-repository";
import {
  adminRecord,
  adminReason,
} from "../../../../../shared/owner-admin";
const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  const owner = await requireOwnerApiAccess({ forbidden: "Admin only" });
  if (owner.error) return owner.error;
  try {
    const queue = await readBottleContributionQueue();
    return Response.json(
      { ok: true, queue, contributions: queue.contributions },
      { headers },
    );
  } catch {
    return Response.json(
      { error: "Bottle submissions could not load." },
      { status: 503, headers },
    );
  }
}
export async function PATCH(request: Request) {
  const owner = await requireOwnerApiAccess({ forbidden: "Admin only" });
  if (owner.error) return owner.error;
  const body = adminRecord(await request.json().catch(() => null));
  if (
    !["use_match", "confirm_added", "dismiss", "reopen"].includes(
      String(body.action),
    )
  )
    return Response.json(
      { error: "Choose a valid submission action." },
      { status: 400 },
    );
  let reason;
  try {
    reason = adminReason(body.reason || body.notes);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  if (typeof body.expectedUpdatedAt !== "string")
    return Response.json(
      { error: "Refresh the submission first." },
      { status: 400 },
    );
  try {
    const entry = (await readBottleContributionQueue()).contributions.find(
      (r) => r.id === body.id,
    );
    if (!entry)
      return Response.json({ error: "Submission not found." }, { status: 404 });
    const bottle = body.candidateBottleId
      ? await getBottleById(String(body.candidateBottleId))
      : null;
    if (["use_match", "confirm_added"].includes(String(body.action)) && !bottle)
      return Response.json(
        {
          error: "Select an existing library bottle or create an entry first.",
        },
        { status: 400 },
      );
    const status = bottleContributionStatusForAction(body.action)!;
    const contribution = await resolveOwnerBottleSubmission({
      id: entry.id,
      expectedUpdatedAt: body.expectedUpdatedAt,
      bottleId: bottle?.id || null,
      bottleName: bottle?.canonicalName || null,
      actor: owner.userId,
      reason,
      status,
    });
    return Response.json(
      {
        ok: true,
        pendingReview: isBottleContributionPending(status),
        contribution,
      },
      { headers },
    );
  } catch (e) {
    const conflict = String(e).includes("admin_conflict");
    return Response.json(
      {
        error: conflict
          ? "This submission changed. Refresh before saving again."
          : "Submission could not be saved. Refresh to check its current state.",
      },
      { status: conflict ? 409 : 503 },
    );
  }
}
