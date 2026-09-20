import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PostgresAccountDeletionRepository } from "../src/lib/account-deletion-repository.ts";

test("account cleanup uses Neon's non-interactive transaction array and deletes undelivered alert candidates", async () => {
  const sql: string[] = [];
  let transactionArgument: unknown;
  const database = {
    query: async (text: string) => {
      sql.push(text);
      if (text.includes("SELECT subject_token")) return [{ subject_token: "deleted:subject" }];
      return [];
    },
    transaction: async (queries: unknown) => {
      transactionArgument = queries;
      assert.ok(Array.isArray(queries));
      await Promise.all(queries as Promise<unknown>[]);
      return [];
    },
  };
  const repository = new PostgresAccountDeletionRepository(database as never);
  await repository.eraseOwnedProductDataAndDisableDelivery("user_test", "delete_test", "2026-09-13T20:30:00.000Z");
  assert.ok(Array.isArray(transactionArgument));
  const allSql = sql.join("\n");
  assert.match(allSql, /DELETE FROM alert_candidates/);
  assert.match(allSql, /status IN \('pending','claimed','failed'\)/);
  assert.doesNotMatch(allSql, /alert_candidates[\s\S]*status='suppressed'/);
  assert.match(allSql, /DELETE FROM founder_glass_shipping/);
  assert.match(allSql, /UPDATE apple_memberships SET clerk_user_id=\$2/);
  assert.match(allSql, /UPDATE coverage_requests SET user_id=\$2/);
  assert.match(allSql, /DELETE FROM retailer_applications/);
  assert.match(allSql, /SELECT anonymize_referral_member/);
  assert.match(allSql, /SELECT anonymize_gift_member/);
  assert.match(allSql, /SELECT anonymize_signal_points_member/);
  assert.doesNotMatch(allSql, /UPDATE signal_point_ledger/);
  assert.doesNotMatch(allSql, /DELETE FROM signal_point_accounts/);
});

test("cleanup requests are lease-claimed and terminalized without retaining the raw Clerk user id", async () => {
  const sql: string[] = [];
  const database = {
    query: async (text: string) => {
      sql.push(text);
      if (text.includes("RETURNING user_id,request_id")) {
        return [{ user_id: "user_pending", request_id: "delete_pending" }];
      }
      if (text.includes("SET user_id=subject_token")) return [{ request_id: "delete_pending" }];
      return [];
    },
    transaction: async () => [],
  };
  const repository = new PostgresAccountDeletionRepository(database as never);
  const claimed = await repository.claimCleanupBatch("2026-09-13T21:00:00.000Z", 10);
  assert.deepEqual(claimed, [{ userId: "user_pending", requestId: "delete_pending" }]);
  await repository.terminalize("user_pending", "delete_pending", "2026-09-13T21:01:00.000Z", ["identity_deleted"]);
  const allSql = sql.join("\n");
  assert.match(allSql, /FOR UPDATE SKIP LOCKED/);
  assert.match(allSql, /cleanup_lease_expires_at/);
  assert.match(allSql, /SET user_id=subject_token,status='completed'/);
  assert.match(allSql, /WHERE user_id=\$1 AND request_id=\$2/);
});

test("account deletion schema persists cleanup leases for authenticated-independent retries", () => {
  const schema = readFileSync(new URL("../src/lib/account-deletion-schema.sql", import.meta.url), "utf8");
  assert.match(schema, /cleanup_lease_expires_at TIMESTAMPTZ/);
  assert.match(schema, /ADD COLUMN IF NOT EXISTS cleanup_lease_expires_at/);
});
