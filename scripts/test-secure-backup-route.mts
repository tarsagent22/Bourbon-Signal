import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { POST } = require("../src/app/api/ops/encrypted-backup/route.ts") as typeof import("../src/app/api/ops/encrypted-backup/route.ts");
const { claimBackupRequest } = require("../src/lib/secure-backup-export.ts") as typeof import("../src/lib/secure-backup-export.ts");

test("encrypted backup route rejects unsigned requests before database access", async () => {
  const previous = process.env.BOURBON_QUEUE_DATABASE_URL;
  delete process.env.BOURBON_QUEUE_DATABASE_URL;
  try {
    const response = await POST(new Request("https://www.bourbonsignal.com/api/ops/encrypted-backup", { method: "POST" }));
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    if (previous) process.env.BOURBON_QUEUE_DATABASE_URL = previous;
  }
});

test("backup request claim rejects replay and concurrent requests in one five-minute bucket", async () => {
  const buckets = new Set<number>();
  const sql = {
    async query(text: string, params: unknown[] = []) {
      if (!text.includes("INSERT INTO ops_backup_export_requests")) return [];
      const bucket = Number(params[1]);
      if (buckets.has(bucket)) return [];
      buckets.add(bucket);
      return [{ nonce_hash: params[0] }];
    },
  };
  const timestamp = "1787702400000";
  const concurrent = await Promise.all([
    claimBackupRequest(sql as never, timestamp, "a".repeat(32)),
    claimBackupRequest(sql as never, timestamp, "b".repeat(32)),
  ]);
  assert.deepEqual(concurrent.sort(), [false, true]);
  assert.equal(await claimBackupRequest(sql as never, String(Number(timestamp) + 300_000), "c".repeat(32)), true);
});
