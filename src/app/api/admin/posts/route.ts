import { requireOwnerApiAccess } from "@/lib/owner-auth";
import { coverageDatabase } from "@/lib/owner-workspace";
import { getBottleById, getBourbonBible } from "@/lib/bourbonBible";
import { createCommunitySightingsRepository } from "@/lib/community-sightings-repository";
import { normalizeSightingsForRewards } from "@/lib/sighting-reward-tiers";
import { reconcileMemberRewards } from "@/lib/sighting-rewards";
import { createSignalPointsRepository } from "@/lib/signal-points-repository";
import {
  buildApprovedLocation,
  approvedCatalogKey,
} from "@/lib/approved-catalog";
import { needsSightingReview, reviewReasonLabels } from "@/lib/sighting-review";
import {
  adminRecord,
  adminReason,
  adminSightingChanges,
} from "../../../../../shared/owner-admin";
import type { MemberSighting } from "@/lib/sightings";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const owner = await requireOwnerApiAccess();
  if (owner.error) return owner.error;
  try {
    const p = new URL(request.url).searchParams,
      q = (p.get("q") || "").trim().toLowerCase().slice(0, 100),
      view = p.get("view") || "review",
      offset = Math.max(0, Number(p.get("offset")) || 0),
      user = p.get("userId") || "";
    const rows = (await coverageDatabase().query(
      `SELECT payload,COUNT(*) OVER()::int AS total FROM community_sightings
   WHERE ($1='' OR strpos(lower(concat_ws(' ',payload->>'bottleName',payload->>'storeName',payload->>'storeCity',payload->>'reporterDisplayName',id)), $1)>0)
   AND ($2='' OR reporter_user_id=$2)
   AND ($3='all' OR ($3='hidden' AND (COALESCE(payload->'rewardState'->>'removedAt','')<>'' OR COALESCE(payload->'rewardState'->>'rejectedAt','')<>''))
    OR ($3='review' AND COALESCE(payload->'rewardState'->>'removedAt','')='' AND COALESCE(payload->'rewardState'->>'rejectedAt','')=''
     AND (payload->'reviewState'->>'needsBottleReview'='true' OR payload->'reviewState'->>'needsStoreReview'='true'
      OR (jsonb_typeof(payload->'rewardState'->'photoProof')='object' AND COALESCE(payload->'rewardState'->'photoProof'->>'status','pending')='pending'))))
   ORDER BY created_at DESC,id LIMIT 25 OFFSET $4`,
      [q, user, view, offset],
    )) as Array<{ payload: MemberSighting; total: number }>;
    const total = Number(rows[0]?.total || 0);
    return Response.json(
      {
        sightings: rows.map((r) => ({
          ...r.payload,
          reviewReasons: reviewReasonLabels(r.payload.reviewState),
          needsReview: needsSightingReview(r.payload),
          reporterName: r.payload.reporterDisplayName || "Member",
          expected: r.payload,
        })),
        total,
        nextOffset: offset + 25 < total ? offset + 25 : null,
      },
      { headers },
    );
  } catch {
    return Response.json(
      { error: "Community posts could not load." },
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
    !["correct", "remove", "restore"].includes(String(body.action)) ||
    !body.id ||
    !body.expected
  )
    return Response.json(
      { error: "Refresh and choose a valid post action." },
      { status: 400 },
    );
  try {
    const repository = createCommunitySightingsRepository(),
      current = await repository.getSighting(String(body.id));
    if (!current)
      return Response.json({ error: "Post not found." }, { status: 404 });
    let next: MemberSighting = { ...current };
    let location = null;
    if (body.action === "correct") {
      const changes = adminRecord(body.changes),
        bottle = await getBottleById(String(changes.bottleId || ""));
      if (!bottle)
        return Response.json(
          { error: "Select the exact library bottle first." },
          { status: 400 },
        );
      next = adminSightingChanges(
        current as unknown as Record<string, unknown>,
        changes,
        bottle,
        owner.userId,
        reason,
      ) as unknown as MemberSighting;
      if(next.sightingType !== 'online_social' && (current.reviewState?.needsStoreReview || /^(manual[:_-]|custom-store)/i.test(current.storeId) || current.storeName!==next.storeName || current.storeAddress!==next.storeAddress || current.storeCity!==next.storeCity || current.storeState!==next.storeState || current.storeZip!==next.storeZip)){
      location = buildApprovedLocation(
        {
          name: next.storeName,
          address: next.storeAddress,
          city: next.storeCity || "",
          state: next.storeState || "",
          zip: next.storeZip,
        },
        owner.userId,
        "owner_post_correction",
      );
      next.storeId = location.id;
      }
    } else
      next.rewardState = {
        ...current.rewardState,
        removedAt:
          body.action === "remove" ? new Date().toISOString() : undefined,
        rejectedAt:
          body.action === "restore"
            ? undefined
            : current.rewardState?.rejectedAt,
      };
    const rows = (await coverageDatabase().query(
      `WITH changed AS MATERIALIZED (
   UPDATE community_sightings SET payload=$3::jsonb,updated_at=now() WHERE id=$1 AND payload=$2::jsonb RETURNING reporter_user_id,payload
  ), audited AS (
   INSERT INTO owner_workspace_audit(actor_id,action,target_id,details) SELECT $4,$5,$1,jsonb_build_object('reason',$6::text,'before',$2::jsonb,'after',$3::jsonb) FROM changed RETURNING id
  ), location AS (
   INSERT INTO approved_catalog_locations(id,normalized_key,payload,approved_by,created_at,updated_at)
   SELECT $7,$9,$8::jsonb,$4,now(),now() FROM changed WHERE $7::text IS NOT NULL
   ON CONFLICT(normalized_key) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now() RETURNING id
  ) SELECT payload,next_community_sighting_reward_generation(reporter_user_id) AS generation FROM changed`,
      [
        current.id,
        JSON.stringify(body.expected),
        JSON.stringify(next),
        owner.userId,
        `post_${body.action}`,
        reason,
        location?.id || null,
        JSON.stringify(location),
        location
          ? approvedCatalogKey(
              [
                location.state,
                location.name,
                location.address || location.city,
                location.zip,
              ].join(" "),
            )
          : null,
      ],
    )) as Array<{ payload: MemberSighting; generation: number }>;
    if (!rows.length)
      return Response.json(
        { error: "This post changed. Refresh before saving again." },
        { status: 409 },
      );
    if (current.reporterUserId) {
      const points = createSignalPointsRepository();
      const profile = reconcileMemberRewards(
        normalizeSightingsForRewards(
          await repository.listSightingsForReporter(current.reporterUserId),
          await getBourbonBible(),
        ),
        await points.readRewardProfile(current.reporterUserId),
      );
      await points.reconcileClerkRewards(
        current.reporterUserId,
        profile,
        Number(rows[0].generation),
      );
    }
    return Response.json({ ok: true, sighting: rows[0].payload }, { headers });
  } catch (e) {
    const invalid = /Enter|Choose|Store|Two-letter|Select/.test(String(e));
    return Response.json(
      {
        error: invalid
          ? (e as Error).message
          : "Post action could not complete. Refresh to check its current state.",
      },
      { status: invalid ? 400 : 503 },
    );
  }
}
