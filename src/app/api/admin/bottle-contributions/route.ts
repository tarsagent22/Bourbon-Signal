import { randomUUID } from "node:crypto";
import { coverageDatabase } from "@/lib/owner-workspace";
import { validateReviewedBottleArtwork } from "../../../../../shared/bottle-artwork";
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
    // Only the audited local research workflow may supply trusted recommendations/art.
    const reviews = await coverageDatabase().query("SELECT target_id,details->'research' AS research FROM owner_workspace_audit WHERE actor_id='codex-bottle-research' AND action='bottle_research' AND target_id=ANY($1::text[]) ORDER BY id",[queue.contributions.map(r=>r.id)]) as Array<{target_id:string;research:unknown}>;
    const trusted = new Map(reviews.map(r=>[r.target_id,r.research]));
    queue.contributions = queue.contributions.map(row => ({...row,context:{...row.context,research:trusted.get(row.id)}}));
    const ids = queue.contributions.map(r => r.context?.sightingId).filter((id): id is string => typeof id === "string");
    const posts = ids.length ? await coverageDatabase().query("SELECT id,payload FROM community_sightings WHERE id=ANY($1::text[])", [ids]) as Array<{id:string;payload:Record<string,any>}> : [];
    const byId = new Map(posts.map(r => [r.id,r.payload]));
    const contributions = queue.contributions.map(row => {
      const post = byId.get(String(row.context?.sightingId || ""));
      return {...row, ...(post ? {sighting:{notes:post.notes,photoUrl:post.rewardState?.photoProof?.publicUrl || post.rewardState?.photoProof?.url}} : {})};
    });
    return Response.json(
      { ok: true, queue, contributions },
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
          draft.rarityPending = input.rarityPending === true;
        } else {
          draft = validateBottleDraft(body.bottle);
          const audits = await coverageDatabase().query("SELECT details->'research' AS research FROM owner_workspace_audit WHERE target_id=$1 AND actor_id='codex-bottle-research' AND action='bottle_research' ORDER BY id DESC LIMIT 1",[entry.id]) as Array<{research:Record<string,unknown>}>;
          const research = audits[0]?.research;
          const artwork = validateReviewedBottleArtwork(research?.artwork);
          if (artwork && String(research?.canonicalName).toLowerCase() === String(draft.canonicalName).toLowerCase()) draft.artwork = artwork;
        }
      } catch(e) { return Response.json({error:(e as Error).message},{status:400,headers}); }
      const catalog = await getOwnerBourbonBible();
      const existing = typeof body.bottleId === 'string' ? catalog.find(b=>b.id===body.bottleId) : null;
      if (body.bottleId && !existing) return Response.json({error:'Bottle not found.'},{status:404,headers});
      if (!Number.isSafeInteger(body.version) || Number(body.version)<0) return Response.json({error:'Refresh the bottle before review.'},{status:400,headers});
      if (body.action==='approve_changes' && catalog.some(b=>b.id!==existing?.id && b.canonicalName.toLowerCase()===String(draft.canonicalName).toLowerCase())) return Response.json({error:'That exact name exists. Link to the existing bottle.'},{status:409,headers});
      const contribution = await reviewOwnerBottleSubmission({id:entry.id,expectedUpdatedAt:body.expectedUpdatedAt,bottleId:existing?.id || `owner-${randomUUID()}`,patch:body.action==='save_later'?{...draft,id:existing?.id,version:Number(body.version)}:{...draft,artwork:draft.artwork || existing?.artwork,aliases:[...new Set([...(existing?.aliases || []),existing?.canonicalName || '',...((draft.aliases || []) as string[])])].filter(Boolean),_previous:existing || null},version:Number(body.version),actor:owner.userId,reason,action:String(body.action)});
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
