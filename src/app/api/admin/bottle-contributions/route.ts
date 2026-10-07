import { randomUUID } from "node:crypto";
import { requireOwnerApiAccess } from "@/lib/owner-auth";
import { readBottleContributionQueue } from "@/lib/bottle-contributions";
import { isBottleContributionPending,bottleContributionStatusForAction } from "@/lib/admin-review";
import { getOwnerBourbonBible, clearBourbonBibleCache, getOwnerBottleById as getBottleById } from "@/lib/bourbonBible";
import { reviewOwnerBottleSubmission, resolveOwnerBottleSubmission } from "@/lib/owner-admin-repository";
import {
  adminRecord,
  adminReason,
  validateBottleDraft,
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
    !["approve_changes", "save_later", "use_match", "confirm_added", "dismiss", "reopen"].includes(
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
    if (["approve_changes","save_later"].includes(String(body.action))) {
      let draft: Record<string, unknown>;
      try {
        if (body.action==='save_later') {
          const input=adminRecord(body.bottle);
          draft=Object.fromEntries(['canonicalName','brand','producer','category','availability','proof','ageStatement','sizeMl','sourceUrl','photoEvidenceUrl','summary','guidance'].map(k=>[k,String(input[k] ?? '').slice(0,1000)]));
          draft.aliases=Array.isArray(input.aliases)?input.aliases.filter(v=>typeof v==='string').slice(0,40).map(v=>String(v).slice(0,160)):[];
        } else draft = validateBottleDraft(body.bottle);
      } catch(e) { return Response.json({error:(e as Error).message},{status:400,headers}); }
      const catalog = await getOwnerBourbonBible();
      const existing = typeof body.bottleId === 'string' ? catalog.find(b=>b.id===body.bottleId) : null;
      if (body.bottleId && !existing) return Response.json({error:'Bottle not found.'},{status:404,headers});
      if (!Number.isSafeInteger(body.version) || Number(body.version)<0) return Response.json({error:'Refresh the bottle before review.'},{status:400,headers});
      if (body.action==='approve_changes' && catalog.some(b=>b.id!==existing?.id && b.canonicalName.toLowerCase()===String(draft.canonicalName).toLowerCase())) return Response.json({error:'That exact name exists. Link to the existing bottle.'},{status:409,headers});
      const contribution = await reviewOwnerBottleSubmission({id:entry.id,expectedUpdatedAt:body.expectedUpdatedAt,bottleId:existing?.id || `owner-${randomUUID()}`,patch:body.action==='save_later'?{...draft,id:existing?.id,version:Number(body.version)}:{...draft,aliases:[...new Set([...(existing?.aliases || []),existing?.canonicalName || '',...((draft.aliases || []) as string[])])].filter(Boolean),_previous:existing || null},version:Number(body.version),actor:owner.userId,reason,action:String(body.action)});
      clearBourbonBibleCache();
      return Response.json({ok:true,pendingReview:body.action==='save_later',contribution},{headers});
    }
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
    const conflict = /admin_conflict|duplicate_bottle/.test(String(e));
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
