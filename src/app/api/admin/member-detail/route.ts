import { adminMember } from "@/lib/admin-member-directory";
import { requireOwnerApiAccess } from "@/lib/owner-auth";
import { createSignalPointsRepository } from "@/lib/signal-points-repository";
import { createCommunitySightingsRepository } from "@/lib/community-sightings-repository";
import { readFounderShippingForUser } from "@/lib/founder-shipping-repository";
import { coverageDatabase } from "@/lib/owner-workspace";
import { MobileActivityRepository } from "@/lib/mobile-activity-repository";
import { adminRecord, adminReason } from "../../../../../shared/owner-admin";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const owner = await requireOwnerApiAccess();
  if (owner.error) return owner.error;
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id) return Response.json({ error: "Choose a member." }, { status: 400 });
  try {
    const user = await owner.client.users.getUser(id);
    const mobileActivity = await new MobileActivityRepository().readMany([id]);
    const tasks = {
      points: () => createSignalPointsRepository().readMember(id),
      shipping: () => readFounderShippingForUser(id),
      moderation: () =>
        createCommunitySightingsRepository().getContributorModeration(id),
      history: () =>
        coverageDatabase().query(
          "SELECT id,action,details,created_at FROM owner_workspace_audit WHERE target_id=$1 ORDER BY id DESC LIMIT 50",
          [id],
        ),
      posts: () => coverageDatabase().query("SELECT count(*)::int AS count FROM community_sightings WHERE reporter_user_id=$1",[id]),
      activity: () => coverageDatabase().query(`WITH activity AS (
        SELECT id,'posts' AS kind, payload->>'bottleName' AS title,CASE WHEN COALESCE(payload->'rewardState'->>'rejectedAt','')<>'' THEN 'rejected' WHEN COALESCE(payload->'rewardState'->>'removedAt','')<>'' THEN 'removed' WHEN payload->'reviewState'->>'needsBottleReview'='true' OR payload->'reviewState'->>'needsStoreReview'='true' THEN 'pending' ELSE 'published' END AS status,created_at AS occurred_at FROM community_sightings WHERE reporter_user_id=$1
        UNION ALL SELECT id,'bottles',payload->>'rawName',status,created_at FROM bottle_contributions WHERE payload->>'userId'=$1
        UNION ALL SELECT id,'stores',payload->>'storeName',CASE WHEN payload->'reviewState'->>'needsStoreReview'='true' THEN 'pending' ELSE 'submitted' END,created_at FROM community_sightings WHERE reporter_user_id=$1 AND (payload->>'storeId' LIKE 'manual-%' OR payload->'reviewState'->>'needsStoreReview'='true')
        UNION ALL SELECT id,'coverage',area_label,status,requested_at FROM coverage_requests WHERE user_id=$1
        UNION ALL SELECT id,'feedback',request->>'kind',status,created_at FROM member_feedback WHERE user_id=$1
        UNION ALL SELECT id,'retailer submissions',store_name,status,created_at FROM retailer_submissions WHERE user_id=$1
      ) SELECT jsonb_build_object('items',(SELECT COALESCE(jsonb_agg(r),'[]'::jsonb) FROM (SELECT * FROM activity ORDER BY occurred_at DESC,id LIMIT 100) r),'counts',(SELECT COALESCE(jsonb_agg(r),'[]'::jsonb) FROM (SELECT kind,status,count(*)::int AS count FROM activity GROUP BY kind,status ORDER BY kind,status) r)) AS activity`,[id]),
    };
    const values = await Promise.allSettled(
        Object.values(tasks).map((fn) => fn()),
      ),
      data = Object.fromEntries(
        Object.keys(tasks).map((key, i) => [
          key,
          values[i].status === "fulfilled"
            ? (values[i] as PromiseFulfilledResult<unknown>).value
            : null,
        ]),
      );
    return Response.json(
      {
        member: adminMember(user,new Date(),mobileActivity[id]),
        ...data,
        unavailable: Object.keys(tasks).filter(
          (_, i) => values[i].status === "rejected",
        ),
      },
      { headers },
    );
  } catch {
    return Response.json(
      { error: "Member details could not load." },
      { status: 503, headers },
    );
  }
}
export async function PATCH(request: Request) {
  const owner = await requireOwnerApiAccess();
  if (owner.error) return owner.error;
  const body = adminRecord(await request.json().catch(() => null));
  let reason;
  try {
    reason = adminReason(body.reason);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  if (
    typeof body.userId !== "string" ||
    !["note", "points", "restrict", "restore"].includes(String(body.action))
  )
    return Response.json(
      { error: "Choose a valid member action." },
      { status: 400 },
    );
  if (
    body.action === "points" &&
    (!Number.isSafeInteger(body.points) ||
      Number(body.points) === 0 ||
      Math.abs(Number(body.points)) > 10000 ||
      typeof body.requestId !== "string" ||
      !/^[a-zA-Z0-9-]{16,100}$/.test(body.requestId))
  )
    return Response.json(
      {
        error:
          "Enter a nonzero whole point adjustment between -10000 and 10000.",
      },
      { status: 400 },
    );
  try {
    await owner.client.users.getUser(body.userId);
    if (body.action === "points")
      await coverageDatabase().query(
        "SELECT owner_adjust_signal_points($1,$2::int,$3,$4,$5)",
        [body.userId, body.points, body.requestId, owner.userId, reason],
      );
    else if (body.action === "note")
      await coverageDatabase().query(
        "INSERT INTO owner_workspace_audit(actor_id,action,target_id,details) VALUES($1,$2,$3,$4::jsonb)",
        [owner.userId, "member_note", body.userId, JSON.stringify({ reason })],
      );
    else {
      const change =
        body.action === "restrict"
          ? `INSERT INTO community_contributor_moderation(reporter_user_id,restriction_kind,restriction_reason,restricted_at,restricted_by,updated_at) VALUES($1,'spam',$2,now(),$3,now()) ON CONFLICT(reporter_user_id) DO UPDATE SET restriction_kind='spam',restriction_reason=$2,restricted_at=now(),restricted_by=$3,restored_at=NULL,restored_by=NULL,restoration_reason=NULL,updated_at=now() RETURNING reporter_user_id`
          : `UPDATE community_contributor_moderation SET restored_at=now(),restored_by=$3,restoration_reason=$2,updated_at=now() WHERE reporter_user_id=$1 RETURNING reporter_user_id`;
      await coverageDatabase().query(
        `WITH changed AS (${change}) INSERT INTO owner_workspace_audit(actor_id,action,target_id,details) SELECT $3,$4,$1,jsonb_build_object('reason',$2::text) FROM changed`,
        [body.userId, reason, owner.userId, `contributor_${body.action}`],
      );
    }
    return Response.json({ ok: true }, { headers });
  } catch {
    return Response.json(
      {
        error:
          "Member action could not complete. Refresh to check its current state.",
      },
      { status: 503 },
    );
  }
}
