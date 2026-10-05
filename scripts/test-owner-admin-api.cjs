const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
const { moduleFrom, root } = require("./astra-security-test-helpers.cjs");
test("actual post route corrects mappings atomically, preserves photo review, rejects stale edits and supports removal/history/restore", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      fs.readFileSync(root + "/src/lib/community-sightings-schema.sql", "utf8"),
    );
    await db.exec(
      fs.readFileSync(root + "/src/lib/approved-catalog-schema.sql", "utf8"),
    );
    await db.exec(
      `CREATE TABLE owner_workspace_audit(id BIGSERIAL PRIMARY KEY,actor_id TEXT,action TEXT,target_id TEXT,details JSONB,created_at TIMESTAMPTZ DEFAULT now());`,
    );
    const query = async (text, params) => (await db.query(text, params)).rows;
    const original = {
      id: "post",
      reporterUserId: "member",
      bottleId: "wrong",
      bottleName: "Wrong Bourbon",
      storeId: "manual-store",
      storeName: "Test Store",
      storeAddress: "123 Main",
      storeCity: "Louisville",
      storeState: "KY",
      createdAt: "2026-10-01T12:00:00Z",
      source: "custom",
      notes: "Member notes",
      rewardState: {
        photoProof: { url: "https://example.test/proof", status: "pending" },
      },
      reviewState: { needsBottleReview: true, needsStoreReview: true },
    };
    await query(
      "INSERT INTO community_sightings(id,reporter_user_id,payload,created_at) VALUES('post','member',$1::jsonb,$2)",
      [JSON.stringify(original), original.createdAt],
    );
    let reconciled = 0;
    const route = moduleFrom("src/app/api/admin/posts/route.ts", {
      "@/lib/owner-auth": {
        requireOwnerApiAccess: async () => ({ userId: "owner" }),
      },
      "@/lib/owner-workspace": { coverageDatabase: () => ({ query }) },
      "@/lib/bourbonBible": {
        getBottleById: async (id) =>
          id === "exact"
            ? {
                id: "exact",
                canonicalName: "Exact Bourbon Batch A",
                availability: "allocated",
              }
            : null,
        getBourbonBible: async () => [],
      },
      "@/lib/community-sightings-repository": {
        createCommunitySightingsRepository: () => ({
          getSighting: async (id) =>
            (
              await query(
                "SELECT payload FROM community_sightings WHERE id=$1",
                [id],
              )
            )[0]?.payload,
          listSightingsForReporter: async (id) =>
            (
              await query(
                "SELECT payload FROM community_sightings WHERE reporter_user_id=$1",
                [id],
              )
            ).map((r) => r.payload),
        }),
      },
      "@/lib/sighting-reward-tiers": {
        normalizeSightingsForRewards: (rows) => rows,
      },
      "@/lib/sighting-rewards": { reconcileMemberRewards: (rows) => rows },
      "@/lib/signal-points-repository": {
        createSignalPointsRepository: () => ({
          readRewardProfile: async () => ({}),
          reconcileClerkRewards: async () => {
            reconciled++;
          },
        }),
      },
      "@/lib/approved-catalog": moduleFrom("src/lib/approved-catalog.ts"),
      "@/lib/sighting-review": {
        needsSightingReview: (r) =>
          !!r.reviewState?.needsBottleReview ||
          r.rewardState?.photoProof?.status === "pending",
        reviewReasonLabels: () => [],
      },
    });
    const send = (body) =>
      route.PATCH(
        new Request("https://example.test/api/admin/posts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    const edit = {
      id: "post",
      action: "correct",
      expected: original,
      changes: { bottleId: "exact" },
      reason: "Verified exact release and store",
    };
    assert.equal((await send(edit)).status, 200);
    const corrected = (
      await query("SELECT payload FROM community_sightings WHERE id='post'")
    )[0].payload;
    assert.equal(corrected.bottleId, "exact");
    assert.equal(corrected.notes, original.notes);
    assert.equal(corrected.rewardState.photoProof.status, "pending");
    assert.equal(corrected.reviewState.needsBottleReview, false);
    assert.equal(reconciled, 1);
    assert.equal((await send(edit)).status, 409);
    assert.equal(
      (await query("SELECT count(*)::int AS n FROM owner_workspace_audit"))[0]
        .n,
      1,
    );
    assert.equal(
      (await send({ ...edit, expected: corrected })).status,
      200,
      "same location correction can be saved twice without duplicate-key failures",
    );
    const latest = (
      await query("SELECT payload FROM community_sightings WHERE id='post'")
    )[0].payload;
    assert.equal(
      (
        await send({
          id: "post",
          action: "remove",
          expected: latest,
          reason: "Misleading post removed",
        })
      ).status,
      200,
    );
    const hidden = (
      await query("SELECT payload FROM community_sightings WHERE id='post'")
    )[0].payload;
    assert.ok(hidden.rewardState.removedAt);
    assert.equal(
      (
        await route.GET(
          new Request("https://example.test/api/admin/posts?view=hidden"),
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await (
          await route.GET(
            new Request("https://example.test/api/admin/posts?view=review"),
          )
        ).json()
      ).sightings.length,
      0,
    );
    assert.equal(
      (
        await (
          await route.GET(
            new Request(
              "https://example.test/api/admin/posts?view=all&userId=other",
            ),
          )
        ).json()
      ).sightings.length,
      0,
      "member filter is enforced in database",
    );
    assert.equal(
      (
        await send({
          id: "post",
          action: "restore",
          expected: hidden,
          reason: "Reviewed and restored",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await (
          await route.GET(
            new Request("https://example.test/api/admin/posts?view=review"),
          )
        ).json()
      ).sightings.length,
      1,
      "pending photo still needs review after restoration",
    );
  } finally {
    await db.close();
  }
});
