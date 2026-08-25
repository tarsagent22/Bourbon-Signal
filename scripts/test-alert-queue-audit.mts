import assert from "node:assert/strict";
const auditModule = await import("../src/lib/alert-queue/audit.ts");
const { readAlertQueueAuditHealth } = (auditModule.default || auditModule) as typeof auditModule;

const now = new Date("2026-07-10T14:30:00.000Z");
const calls: unknown[][] = [];
const query = { query: async (text: string, params: unknown[], options?: unknown) => {
  calls.push([text, params, options]);
  return [{ delivered_rows: "9", unique_recipients: "4", onsite_count: "2", email_count: "5", sms_count: "2", repeated_identity_groups: "0", repeated_payload_groups: "0", repeated_underlying_bottle_groups: "3" }];
} } as never;

const result = await readAlertQueueAuditHealth({
  now, query, env: { ALERT_QUEUE_MODE: "active", BOURBON_QUEUE_DATABASE_URL: "postgres://configured" },
});
assert.equal(result.status, "ok");
assert.equal(result.deliveredRows, 9);
assert.equal(result.uniqueRecipients, 4);
assert.deepEqual(result.channelCounts, { onSite: 2, email: 5, sms: 2 });
assert.equal(result.repeatedIdentityGroups, 0);
assert.equal(result.repeatedPayloadGroups, 0);
assert.equal(result.repeatedUnderlyingBottleGroups, 3);
assert.equal(calls.length, 2);
assert.match(String(calls[0]?.[0]), /create index concurrently if not exists alert_candidates_delivered_audit_idx/i);
const captured = calls.at(-1)!;
assert.deepEqual(captured[1], ["2026-07-10T00:00:00.000Z", "2026-07-11T00:00:00.000Z"]);
assert.match(String(captured[0]), /count\(distinct user_id\)/i);
assert.match(String(captured[0]), /regexp_split_to_table/i);
assert.ok((captured[2] as { fetchOptions?: { signal?: AbortSignal } })?.fetchOptions?.signal instanceof AbortSignal);
const inactive = await readAlertQueueAuditHealth({ now, env: {} });
assert.equal(inactive.status, "unavailable");
assert.equal(inactive.note, "queue_not_active");

const failed = await readAlertQueueAuditHealth({ now, query: { query: async () => { throw new Error("offline"); } } as never,
  env: { ALERT_QUEUE_MODE: "active", DATABASE_URL: "postgres://configured" } });
assert.equal(failed.status, "error");
assert.equal(failed.note, "aggregate_query_failed");

console.log("Alert queue audit health tests passed.");

