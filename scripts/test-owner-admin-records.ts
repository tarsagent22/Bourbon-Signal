import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  adminSightingChanges,
  validateBottleDraft,
} from "../shared/owner-admin";
import { CommunitySightingsRepository } from "../src/lib/community-sightings-repository";
async function main() {
  const db = new PGlite();
  await db.exec(`CREATE TABLE coverage_requests(id TEXT PRIMARY KEY);
 CREATE TABLE signal_point_accounts(user_id TEXT PRIMARY KEY,balance INTEGER NOT NULL DEFAULT 0 CHECK(balance>=0),debt INTEGER NOT NULL DEFAULT 0 CHECK(debt>=0),updated_at TIMESTAMPTZ DEFAULT now());
 CREATE TABLE signal_point_ledger(id BIGSERIAL PRIMARY KEY,user_id TEXT NOT NULL REFERENCES signal_point_accounts(user_id),idempotency_key TEXT NOT NULL,entry_kind TEXT NOT NULL CHECK(entry_kind IN ('credit','debit')),points INT NOT NULL CHECK(points<>0),balance_delta INT NOT NULL,debt_delta INT NOT NULL,source_type TEXT NOT NULL,metadata JSONB NOT NULL,created_at TIMESTAMPTZ DEFAULT now(),UNIQUE(user_id,idempotency_key),CHECK(points=balance_delta-debt_delta));
 CREATE FUNCTION pg_advisory_xact_lock(bigint) RETURNS VOID LANGUAGE SQL AS 'SELECT';
 `);
  for (const file of [
    "owner-workspace",
    "member-collection",
    "bottle-contribution",
    "community-sightings",
    "approved-catalog",
    "owner-admin",
  ])
    await db.exec(readFileSync(`src/lib/${file}-schema.sql`, "utf8"));
  const bottle = {
    canonicalName: "Exact Bourbon Batch A 750 ml",
    brand: "Exact",
    producer: "Exact Distillery",
    category: "bourbon",
    availability: "limited",
    proof: 110,
    ageStatement: "10 years",
    aliases: ["Exact A"],
    summary: "Reviewed exact release",
    guidance: "",
  };
  assert.equal(validateBottleDraft(bottle).proof, 110);
  for (const input of [
    { ...bottle, proof: 201 },
    { ...bottle, category: "vodka" },
    { ...bottle, brand: "" },
  ])
    assert.throws(() => validateBottleDraft(input));
  const old = {
    id: "post_a",
    reporterUserId: "member_a",
    bottleId: "wrong",
    bottleName: "Misspelled",
    storeId: "manual-store",
    storeName: "Test Store",
    storeCity: "Louisville",
    storeState: "KY",
    storeAddress: "123 Street",
    source: "custom",
    createdAt: "2026-10-01T12:00:00Z",
    notes: "Member note",
    reviewState: { needsBottleReview: true, needsStoreReview: true },
    rewardState: {
      photoProof: { url: "https://example.test/photo.jpg", status: "pending" },
    },
  };
  const corrected = adminSightingChanges(
    old,
    { storeCity: "Louisville", price: "55" },
    {
      id: "exact",
      canonicalName: bottle.canonicalName,
      availability: "limited",
    },
    "owner",
    "Verified exact release",
  );
  assert.equal(corrected.createdAt, old.createdAt);
  assert.equal(corrected.notes, old.notes);
  assert.equal((corrected.rewardState as any).photoProof.status, "pending");
  assert.equal(corrected.reviewState.needsBottleReview, false);
  assert.equal(corrected.bottleId, "exact");
  const online=adminSightingChanges({...old,sightingType:'online_social',storeCity:'',storeState:'',storeAddress:''},{},{id:'exact',canonicalName:bottle.canonicalName,availability:'limited'},'owner','Correct online bottle');
  assert.equal(online.bottleId,'exact','online posts can be corrected without inventing a physical store');
  assert.notEqual(corrected.reviewState.reviewNote,'Verified exact release','private reasons remain in the owner audit');
  await db.query(
    "INSERT INTO member_collection_state(user_id,version) VALUES ('member_a',3),('member_b',8)",
  );
  const payload = {
    canonicalKey: "personal old key",
    bottleId: "wrong",
    bottleName: "Misspelled",
    rating: 92,
    isRated: true,
    notes: "Keep this note",
    sealedQuantity: 2,
    openedQuantity: 1,
    finishedCount: 4,
    pricePaid: 55,
    store: "Original Store",
    bottleContributionId: "submission_a",
    pendingCanonicalMatch: true,
    addedAt: "2026-10-01T12:00:00Z",
    updatedAt: "2026-10-01T12:00:00Z",
  };
  for (const user of ["member_a", "member_b"])
    await db.query(
      `INSERT INTO member_collection_bottles(user_id,canonical_key,bottle_id,bottle_name,rating,payload,added_at,updated_at,bottle_contribution_id) VALUES($1,'personal old key','wrong','Misspelled',92,$2::jsonb,now(),now(),$3)`,
      [
        user,
        JSON.stringify(payload),
        user === "member_a" ? "submission_a" : "submission_b",
      ],
    );
  const stamp = "2026-10-01T12:00:00Z";
  await db.query(
    "INSERT INTO bottle_contributions(id,normalized_name,status,payload,created_at,updated_at) VALUES('submission_a','misspelled','new',$1::jsonb,$2,$2)",
    [
      JSON.stringify({
        id: "submission_a",
        rawName: "Misspelled",
        status: "new",
      }),
      stamp,
    ],
  );
  await db.query(
    "SELECT owner_resolve_bottle_submission('submission_a',$1,'exact',$2,'owner','Verified exact release','matched_existing')",
    [stamp, bottle.canonicalName],
  );
  const shelf = (
    await db.query<any>(
      "SELECT * FROM member_collection_bottles WHERE user_id='member_a'",
    )
  ).rows[0];
  assert.equal(shelf.bottle_id, "exact");
  for (const key of [
    "canonicalKey",
    "rating",
    "notes",
    "sealedQuantity",
    "openedQuantity",
    "finishedCount",
    "pricePaid",
    "store",
    "addedAt",
  ])
    assert.deepEqual(
      shelf.payload[key],
      (payload as any)[key],
      key + " preserved",
    );
  assert.equal(shelf.payload.pendingCanonicalMatch, false);
  assert.equal(
    (
      await db.query<any>(
        "SELECT version FROM member_collection_state WHERE user_id='member_a'",
      )
    ).rows[0].version,
    4,
  );
  assert.equal(
    (
      await db.query<any>(
        "SELECT bottle_id FROM member_collection_bottles WHERE user_id='member_b'",
      )
    ).rows[0].bottle_id,
    "wrong",
    "unrelated member not matched",
  );
  await assert.rejects(
    () =>
      db.query(
        "SELECT owner_resolve_bottle_submission('submission_a',$1,'other','Other','owner','stale review','matched_existing')",
        [stamp],
      ),
    /admin_conflict/,
  );
  await db.query(
    "SELECT owner_save_bottle_record('exact',$1::jsonb,NULL,0,'owner','Correct name')",
    [JSON.stringify(bottle)],
  );
  await assert.rejects(
    () =>
      db.query(
        "SELECT owner_save_bottle_record('exact',$1::jsonb,NULL,0,'owner','Stale correction')",
        [JSON.stringify({ ...bottle, canonicalName: "Wrong" })],
      ),
    /admin_conflict/,
  );
  await db.query(
    "SELECT owner_save_bottle_record('wrong',$1::jsonb,'exact',0,'owner','Merge true duplicate',1)",
    [JSON.stringify(bottle)],
  );
  assert.equal(
    (
      await db.query<any>(
        "SELECT redirect_id FROM owner_bottle_records WHERE bottle_id='wrong'",
      )
    ).rows[0].redirect_id,
    "exact",
  );
  assert.equal(
    (
      await db.query<any>(
        "SELECT bottle_id FROM member_collection_bottles WHERE user_id='member_b'",
      )
    ).rows[0].bottle_id,
    "exact",
  );
  assert.equal(
    (
      await db.query<any>(
        "SELECT count(*)::int AS count FROM member_collection_bottles",
      )
    ).rows[0].count,
    2,
    "merge retains every personal shelf record",
  );
  await db.query(
    "SELECT owner_adjust_signal_points('member_a',100,'point-change-0001','owner','Support correction')",
  );
  await db.query(
    "SELECT owner_adjust_signal_points('member_a',100,'point-change-0001','owner','Support correction')",
  );
  assert.equal(
    (
      await db.query<any>(
        "SELECT balance FROM signal_point_accounts WHERE user_id='member_a'",
      )
    ).rows[0].balance,
    100,
    "retry credits once",
  );
  await assert.rejects(
    () =>
      db.query(
        "SELECT owner_adjust_signal_points('member_a',101,'point-change-0001','owner','Support correction')",
      ),
    /idempotency_conflict/,
  );
  await db.query(
    "SELECT owner_adjust_signal_points('member_a',-150,'point-change-0002','owner','Reverse erroneous credit')",
  );
  assert.deepEqual(
    (
      await db.query<any>(
        "SELECT balance,debt FROM signal_point_accounts WHERE user_id='member_a'",
      )
    ).rows[0],
    { balance: 0, debt: 50 },
  );
  await db.query(
    "SELECT owner_adjust_signal_points('member_a',80,'point-change-0003','owner','Resolve support case')",
  );
  assert.deepEqual(
    (
      await db.query<any>(
        "SELECT balance,debt FROM signal_point_accounts WHERE user_id='member_a'",
      )
    ).rows[0],
    { balance: 30, debt: 0 },
  );
  const audits = (
    await db.query<any>(
      "SELECT count(*)::int AS count FROM owner_workspace_audit WHERE action='member_points_adjustment'",
    )
  ).rows[0].count;
  assert.equal(audits, 3);
  await db.query(
    "INSERT INTO community_sightings(id,reporter_user_id,payload,created_at) VALUES($1,$2,$3::jsonb,$4)",
    [old.id, old.reporterUserId, JSON.stringify(old), old.createdAt],
  );
  const repository = new CommunitySightingsRepository({
    query: async (sql: string, params?: unknown[]) =>
      (await db.query(sql, params)).rows,
  } as any);
  const result = await repository.updateSighting(corrected as any, {
    expected: old as any,
    actor: "owner",
    action: "post_correct",
    reason: "Verified release",
  });
  assert.equal(result.sighting.bottleName, bottle.canonicalName);
  await assert.rejects(
    () =>
      repository.updateSighting(old as any, {
        expected: old as any,
        actor: "owner",
        action: "post_correct",
        reason: "Stale",
      }),
    /changed/,
  );
  assert.equal(
    (
      await db.query<any>(
        "SELECT count(*)::int AS count FROM owner_workspace_audit WHERE action='post_correct'",
      )
    ).rows[0].count,
    1,
  );
  // Draft save never creates a catalog entry. Approval is atomic with receipt resolution.
  const submit = {id:'atomic',rawName:'Original member spelling',userId:'member_a',status:'new',context:{privatePhoto:'preserved'}};
  await db.query("INSERT INTO bottle_contributions VALUES('atomic','atomic','new',$1::jsonb,$2,$2)",[JSON.stringify(submit),stamp]);
  const beforeLedger = (await db.query<any>("SELECT count(*)::int AS n FROM signal_point_ledger")).rows[0].n;
  const review = async (expected:string,action:string,patch:any,id='atomic-bottle',version=0) => (await db.query<any>("SELECT owner_review_bottle_submission('atomic',$1,$2,$3::jsonb,$4,'owner','Verified identity',$5) AS result",[expected,id,JSON.stringify(patch),version,action])).rows[0].result;
  const saved = await review(stamp,'save_later',{canonicalName:'Work in progress',brand:''});
  assert.equal(saved.rawName,submit.rawName);assert.equal(saved.userId,'member_a');assert.equal(saved.status,'new');
  assert.equal((await db.query<any>("SELECT count(*)::int AS n FROM owner_bottle_records WHERE bottle_id='atomic-bottle'")).rows[0].n,0);
  const current = (await db.query<any>("SELECT updated_at::text AS t FROM bottle_contributions WHERE id='atomic'")).rows[0].t;
  await assert.rejects(()=>review(stamp,'approve_changes',bottle),/admin_conflict/);
  assert.equal((await db.query<any>("SELECT count(*)::int AS n FROM owner_bottle_records WHERE bottle_id='atomic-bottle'")).rows[0].n,0,'stale approval leaves no orphan catalog record');
  const approved = await review(current,'approve_changes',{...bottle,canonicalName:'Atomic exact bourbon 750 ml'});
  assert.equal(approved.status,'added');assert.deepEqual(approved.context,submit.context);assert.equal(approved.rawName,submit.rawName);
  await assert.rejects(()=>review(current,'approve_changes',bottle),/admin_conflict/);
  assert.equal((await db.query<any>("SELECT count(*)::int AS n FROM signal_point_ledger")).rows[0].n,beforeLedger,'administrative approvals issue no duplicate rewards');
  assert.equal((await db.query<any>("SELECT count(*)::int AS n FROM owner_bottle_records WHERE bottle_id='atomic-bottle'")).rows[0].n,1);
  await db.close();

  console.log(
    "Owner admin SQL: record preservation, isolated matching, stale-write rollback, merges, immutable point accounting, idempotency, and post audit passed.",
  );
}
void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
