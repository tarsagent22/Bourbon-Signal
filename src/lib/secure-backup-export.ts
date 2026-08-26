import {
  constants,
  createCipheriv,
  createHash,
  publicEncrypt,
  randomBytes,
  verify,
} from "node:crypto";
import { gzipSync } from "node:zlib";
import type { NeonQueryFunction } from "@neondatabase/serverless";

export const SECURE_BACKUP_CONTRACT = "bourbon-signal/encrypted-database-backup@2";
export const BACKUP_KEY_ID = "chandler-windows-2026-08";
export const BACKUP_AUTH_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAqKW0jMSYKXfB11hxe8EQ
lQ1FJ7rN4MW7E/qAdidugVUUuYfJjLjjIYfNWyRHbDzukNjmnmOCsfbab4QGeN2c
djpMRyUsx13A3EzIiFmjYsRYJEBx2h7PU1Pv7+J/Hnp0NdV9rrR58GafphNkbR/I
Jykl267+xFKQXGpqQXcdrh9lqZZLWnhmJsbuAs6WaoDlz4BETI9wbyre8rmtkc+h
evoG7gYaowT6qf7qUZvH/B+lZgPKRM+NO42yqdDym+S+VKURtV2YISjaE9k/grRi
p8q6ZqjbWlOC4rhnXPLiAshVJ8JDgmjclVa5I982W4VKAJGtq1EGIwG4Qj9GCeGR
Jb1wFddKoEhrZAjqrThnYWYeovbA++DulRrRkuUd38NrnneAp+xgTumGZV+rK8jj
wksWeU1u90YecFdRHL3XmQ9cHcrJARLn3MV9bNr7/i0suBIQ62RP8r4GFKI8FD/l
3In8ygSIql/ZRxJhYnA2vx+nahmPlLyhO/R5riono6Q7AgMBAAE=
-----END PUBLIC KEY-----`;
export const BACKUP_ENCRYPTION_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAy0s8ZCENM4fDEFUJTWH9
twxiyopb/KilxdvtFpaLuHvB4IEG+IxPjEQn6p7r7SRJd/t3nRxpc/kR3NikuMiM
6PfVVTcMic8C1IaF4+YQPaMhLwgr/Tr/VETlWflgGB5eFjEu6wYKo+BLhAOPCvZ3
dybDhme+7nK6KYNCS50c19Qpd1kdGTES+LoMDx3S1cEGJL9IhD/GpDQfOI4LvAvg
UnW5eQuaSE9jDR1DSQl9CDOMjYWoYByG+b777SIOnppuL4FMqsluVoiSsaJGXduC
DXjtiRT6NyAzqZSYFgprU+3KPmfFKfsbgcRUnR+SzzJadU11q+kVvsxXJ6IjzFTd
fxGYKzajMMuAYnmnZG3tZvtR1CIKhagSfqudipM4MuZ8gyV/+VMnAWUdUymRBryp
WTlx7v0tH1M33PxeSwMiG5DinWEqRvOVSGL3dKYueoy2Oo+eppaZyM3jd4CRGNL7
1qg8BBBCpwVytl6cLQnEZqe6P8yxtJhakp4VYa6cx6iLAgMBAAE=
-----END PUBLIC KEY-----`;

const BASE_REQUIRED_TABLES = [
  "bottle_contributions", "bourbon_recommendation_feedback", "community_sighting_votes", "community_sightings",
  "coverage_request_automation_jobs", "coverage_requests", "founder_glass_shipping", "member_collection_bottles",
  "member_collection_legacy_backups", "member_collection_state", "member_referral_codes",
  "member_referral_eligibility_events", "member_referral_glass_rewards", "member_referral_point_ledger",
  "member_referrals", "retailer_applications", "retailer_stores", "retailer_submissions",
] as const;
const GIFT_TABLES = [
  "gift_orders", "gift_order_events", "founder_spot_reservations", "founder_reconciliation_state",
  "gift_redemption_recipients", "gift_recipient_locks", "gift_payment_attempts",
  "direct_founder_checkout_reservations", "direct_founder_checkout_events",
] as const;
const SIGNAL_POINT_TABLES = [
  "member_referral_scale_migrations", "signal_point_accounts", "signal_point_reward_generations",
  "signal_point_source_balances", "signal_point_ledger", "signal_point_migrations", "signal_reward_catalog",
  "signal_reward_redemptions", "signal_reward_redemption_events", "signal_reward_fulfillments",
] as const;
export const BACKUP_TABLES = Array.from(new Set([
  "approved_catalog_bottles", "approved_catalog_locations",
  "alert_baselines", "alert_candidates", "alert_deliveries", "alert_lifecycle_migrations", "alert_lifecycle_states",
  "alert_queue_migrations", "bourbon_recommendation_feedback_state", "clerk_alert_metadata_backups",
  "community_sighting_idempotency", "engine_snapshots", "membership_trial_claims",
  "retailer_acquisition_migrations", "retailer_prospect_approval_packets", "retailer_prospect_contact_evidence",
  "retailer_prospect_message_versions", "retailer_prospect_outreach", "retailer_prospects",
  "retailer_regulator_authorities", "welcome_signal_previews", ...BASE_REQUIRED_TABLES, ...GIFT_TABLES, ...SIGNAL_POINT_TABLES,
]));
const MAX_COMPRESSED_BACKUP_BYTES = 3_200_000;
const MAX_SERIALIZED_ENVELOPE_BYTES = 4_400_000;
const MAX_DATABASE_RELATION_BYTES = 32_000_000;

export type BackupPayload = {
  schemaVersion: 2;
  generatedAt: string;
  snapshotId: string;
  applicationSchemaCommit: string;
  recoveryContract: "restore-application-schema-at-commit-then-import-rows";
  tables: Record<string, { columns: Array<Record<string, unknown>>; rows: string[] }>;
};

export type EncryptedBackupEnvelope = {
  contractVersion: typeof SECURE_BACKUP_CONTRACT;
  schemaVersion: 2;
  keyId: typeof BACKUP_KEY_ID;
  algorithm: "rsa-oaep-sha256+aes-256-gcm";
  compression: "gzip";
  generatedAt: string;
  wrappedKey: string;
  iv: string;
  authTag: string;
  ciphertext: string;
};

export function backupRequestMessage(timestamp: string, nonce: string) {
  return Buffer.from(`${SECURE_BACKUP_CONTRACT}\nPOST\nhttps://www.bourbonsignal.com/api/ops/encrypted-backup\n${timestamp}\n${nonce}`, "utf8");
}

export function verifyBackupRequest(input: { timestamp: string; nonce: string; signature: string; publicKey?: string; now?: number }) {
  const now = input.now ?? Date.now();
  const timestampMs = Number(input.timestamp);
  if (!/^\d{13}$/.test(input.timestamp) || !Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > 300_000) return false;
  if (!/^[a-f0-9]{32}$/.test(input.nonce) || !/^[A-Za-z0-9_-]{64,1024}$/.test(input.signature)) return false;
  const publicKey = input.publicKey || BACKUP_AUTH_PUBLIC_KEY_PEM;
  try {
    return verify("sha256", backupRequestMessage(input.timestamp, input.nonce), {
      key: publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32,
    }, Buffer.from(input.signature, "base64url"));
  } catch {
    return false;
  }
}

export function requiredBackupTablesForExisting(existing: ReadonlySet<string>) {
  const missing = BACKUP_TABLES.filter((table) => !existing.has(table));
  if (missing.length) throw new Error(`Refusing incomplete production backup; required tables are missing: ${missing.join(", ")}`);
  return [...BACKUP_TABLES].sort();
}

export async function claimBackupRequest(sql: NeonQueryFunction<false, false>, timestamp: string, nonce: string) {
  await sql.query(`CREATE TABLE IF NOT EXISTS ops_backup_export_requests (
    nonce_hash TEXT PRIMARY KEY,
    request_bucket BIGINT NOT NULL UNIQUE,
    requested_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const nonceHash = createHash("sha256").update(nonce).digest("hex");
  const bucket = Math.floor(Number(timestamp) / 300_000);
  const claimed = await sql.query(
    `INSERT INTO ops_backup_export_requests (nonce_hash, request_bucket, requested_at)
     VALUES ($1, $2, to_timestamp($3::double precision / 1000.0))
     ON CONFLICT DO NOTHING RETURNING nonce_hash`,
    [nonceHash, bucket, timestamp],
  );
  return claimed.length === 1;
}

export async function cleanupBackupRequestClaims(sql: NeonQueryFunction<false, false>) {
  await sql.query("DELETE FROM ops_backup_export_requests WHERE created_at < NOW() - INTERVAL '7 days'");
}

export function assertBackupResponseBudget(envelope: unknown) {
  if (Buffer.byteLength(JSON.stringify(envelope), "utf8") > MAX_SERIALIZED_ENVELOPE_BYTES) {
    throw new Error("Encrypted backup exceeds the safe Vercel response budget.");
  }
}

export function encryptBackupPayload(payload: BackupPayload, publicKey = BACKUP_ENCRYPTION_PUBLIC_KEY_PEM): EncryptedBackupEnvelope {
  const compressed = gzipSync(Buffer.from(JSON.stringify(payload), "utf8"));
  if (compressed.length > MAX_COMPRESSED_BACKUP_BYTES) throw new Error("Encrypted backup exceeds the safe serverless response budget.");
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const wrappedKey = publicEncrypt({ key: publicKey, oaepHash: "sha256", padding: constants.RSA_PKCS1_OAEP_PADDING }, key);
  const envelope: EncryptedBackupEnvelope = {
    contractVersion: SECURE_BACKUP_CONTRACT, schemaVersion: 2, keyId: BACKUP_KEY_ID,
    algorithm: "rsa-oaep-sha256+aes-256-gcm", compression: "gzip", generatedAt: payload.generatedAt,
    wrappedKey: wrappedKey.toString("base64url"), iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"), ciphertext: ciphertext.toString("base64url"),
  };
  assertBackupResponseBudget(envelope);
  return envelope;
}

export async function collectProductionBackup(sql: NeonQueryFunction<false, false>): Promise<BackupPayload> {
  const applicationSchemaCommit = process.env.VERCEL_GIT_COMMIT_SHA || "";
  if (!/^[a-f0-9]{40}$/.test(applicationSchemaCommit)) throw new Error("Immutable application schema commit is unavailable.");
  const tableRows = await sql.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name = ANY($1::text[])",
    [BACKUP_TABLES],
  );
  const selectedTables = requiredBackupTablesForExisting(new Set(tableRows.map((row) => String(row.table_name))));
  const sizeRows = await sql.query(
    `SELECT COALESCE(SUM(pg_total_relation_size((quote_ident(table_schema) || '.' || quote_ident(table_name))::regclass)), 0)::bigint AS total_bytes
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name = ANY($1::text[])`,
    [selectedTables],
  );
  if (Number(sizeRows[0]?.total_bytes || 0) > MAX_DATABASE_RELATION_BYTES) {
    throw new Error("Production data exceeds the safe serverless backup budget.");
  }
  const results = await sql.transaction((transaction) => [
    transaction.query("SELECT txid_current_snapshot()::text AS snapshot_id"),
    ...selectedTables.flatMap((table) => [
      transaction.query(`SELECT column_name, data_type, udt_name, is_nullable, column_default
        FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, [table]),
      transaction.query(`SELECT to_jsonb(source_row)::text AS row_json FROM "${table.replace(/"/g, '""')}" AS source_row`),
    ]),
  ], { isolationLevel: "RepeatableRead", readOnly: true });
  const tables: BackupPayload["tables"] = {};
  selectedTables.forEach((table, index) => {
    tables[table] = { columns: results[(index * 2) + 1] as Array<Record<string, unknown>>, rows: results[(index * 2) + 2].map((row) => String(row.row_json)) };
  });
  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    snapshotId: String(results[0][0]?.snapshot_id || "unknown"),
    applicationSchemaCommit,
    recoveryContract: "restore-application-schema-at-commit-then-import-rows",
    tables,
  };
}
