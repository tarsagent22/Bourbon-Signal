import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PostgresAlertQueueRepository } from "../src/lib/alert-queue/postgres-repository";
import { readRequestedMemberAlert } from "../src/lib/alert-queue/member-alert-lookup";

test("real PostgreSQL alert snapshots survive inbox compaction and stay member scoped", async () => {
  const database = new PGlite();
  try {
    await database.exec(readFileSync("src/lib/alert-queue/schema.sql", "utf8"));
    await database.exec(readFileSync("src/lib/alert-queue/push-outbox.sql", "utf8"));
    const sql = { query: async (text: string, params: unknown[] = []) => {
      const result = await database.query<Record<string, unknown>>(text, params);
      return { rows: result.rows };
    } };
    await sql.query(`insert into engine_snapshots (snapshot_id,app_commit,engine_commit,collection_run_id,generated_at,manifest)
      values ('snapshot-1','app-1','engine-1','run-1',now(),'{}')`);
    const repository = new PostgresAlertQueueRepository(sql);
    const candidate = await repository.enqueue({ snapshotId: "snapshot-1", userId: "member-1", channel: "onSite",
      stableMatchKey: "availability-episode:1", alertWindow: "stable-v2", createdAt: new Date().toISOString(),
      payload: { bottle: "Bottle 1", location: "Store 1", state: "NC", eventType: "inventory" } });
    await repository.claim(candidate.id, "worker-1", new Date().toISOString());
    const alert = { id: "alert-1", userId: "member-1", dedupeKey: "episode-1", bottleName: "Bottle 1",
      storeLabel: "Store 1", state: "NC", signalId: "trusted_source:original-1", createdAt: new Date().toISOString() };
    await repository.markBatchDelivered([candidate.id], "clerk:member-1:alert-1", alert.createdAt, alert);
    await sql.query(`insert into alert_push_outbox (id,user_id,alert_id,stable_keys,expires_at,status)
      values ('push-1','member-1','alert-1',array['availability-episode:1'],now()+interval '1 hour','delivered')`);
    const recovered = await readRequestedMemberAlert("member-1", "alert-1", { sql });
    assert.equal(recovered?.signalId, alert.signalId);
    assert.equal(await readRequestedMemberAlert("member-2", "alert-1", { sql }), null);
    await sql.query(`update alert_candidates set payload=payload-'memberAlert' where id=$1`, [candidate.id]);
    const legacy = await readRequestedMemberAlert("member-1", "alert-1", { sql });
    assert.equal(legacy?.storeLabel, "Store 1");
    assert.equal(legacy?.bottleName, "Bottle 1");
    assert.equal(legacy?.signalId, undefined);
  } finally { await database.close(); }
});
