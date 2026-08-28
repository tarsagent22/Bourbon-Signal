import { neon } from "@neondatabase/serverless";

import { ohlqWorkerArtifactDigest, sanitizeOhlqWorkerEnvelope } from "./ohlq-worker-artifact.ts";
import { decryptOhlqWorkerBlob, encryptOhlqWorkerBlob } from "./ohlq-worker-blob-crypto.ts";

const RETENTION_DAYS = 7;

type QueryRows = Array<Record<string, unknown>>;
type DatabaseQuery = {
  query(text: string, params?: unknown[]): Promise<QueryRows>;
};

type StoreOptions = {
  database?: DatabaseQuery;
  connectionString?: string;
};

function connectionString(env: NodeJS.ProcessEnv = process.env) {
  return env.BOURBON_QUEUE_DATABASE_URL
    || env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED
    || env.DATABASE_URL
    || null;
}

export function ohlqWorkerArtifactBackend(env: NodeJS.ProcessEnv = process.env) {
  if (connectionString(env)) return "database" as const;
  if (env.BLOB_READ_WRITE_TOKEN) return "blob" as const;
  throw new Error("No OHLQ worker artifact store is configured.");
}

function database(options: StoreOptions = {}): DatabaseQuery {
  if (options.database) return options.database;
  const configured = options.connectionString || connectionString();
  if (!configured) throw new Error("OHLQ worker durable database is not configured.");
  return neon(configured) as unknown as DatabaseQuery;
}

async function ensureSchema(sql: DatabaseQuery) {
  await sql.query(`CREATE TABLE IF NOT EXISTS ohlq_worker_artifacts (
    digest CHAR(64) PRIMARY KEY,
    upload_id UUID NOT NULL UNIQUE,
    generated_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    encrypted_payload TEXT NOT NULL,
    CONSTRAINT ohlq_worker_artifacts_digest_format CHECK (digest ~ '^[0-9a-f]{64}$')
  )`);
  await sql.query(`CREATE INDEX IF NOT EXISTS ohlq_worker_artifacts_generated_idx
    ON ohlq_worker_artifacts (generated_at DESC, received_at DESC)`);
}

function normalizedStoredEnvelope(row: Record<string, unknown>) {
  const stored = decryptOhlqWorkerBlob(String(row.encrypted_payload || ""));
  const normalized = sanitizeOhlqWorkerEnvelope({
    contractVersion: stored.contractVersion,
    uploadId: stored.uploadId,
    generatedAt: stored.generatedAt,
    artifact: stored.artifact,
  }, { maximumAgeMs: 12 * 60 * 60_000 });
  const digest = ohlqWorkerArtifactDigest(normalized.artifact);
  if (digest !== String(row.digest || "")) throw new Error("OHLQ worker database artifact digest mismatch.");
  return {
    contractVersion: normalized.contractVersion,
    uploadId: normalized.uploadId,
    generatedAt: normalized.generatedAt,
    receivedAt: String(row.received_at || stored.receivedAt || ""),
    digest,
    artifact: normalized.artifact,
  };
}

export async function storeOhlqWorkerEnvelopeInDatabase(value: unknown, options: StoreOptions = {}) {
  const sql = database(options);
  await ensureSchema(sql);
  const normalized = sanitizeOhlqWorkerEnvelope(value);
  const digest = ohlqWorkerArtifactDigest(normalized.artifact);
  const receivedAt = new Date().toISOString();
  const encryptedPayload = encryptOhlqWorkerBlob({
    contractVersion: normalized.contractVersion,
    uploadId: normalized.uploadId,
    generatedAt: normalized.generatedAt,
    receivedAt,
    artifact: normalized.artifact,
  });
  const inserted = await sql.query(`INSERT INTO ohlq_worker_artifacts
      (digest, upload_id, generated_at, received_at, encrypted_payload)
    VALUES ($1, $2::uuid, $3::timestamptz, $4::timestamptz, $5)
    ON CONFLICT DO NOTHING
    RETURNING digest, upload_id::text, generated_at, received_at, encrypted_payload`,
  [digest, normalized.uploadId, normalized.generatedAt, receivedAt, encryptedPayload]);
  const rows = inserted.length ? inserted : await sql.query(`SELECT digest, upload_id::text, generated_at, received_at, encrypted_payload
    FROM ohlq_worker_artifacts
    WHERE digest = $1 OR upload_id = $2::uuid
    ORDER BY generated_at DESC, received_at DESC
    LIMIT 1`, [digest, normalized.uploadId]);
  if (!rows.length) throw new Error("OHLQ worker database artifact could not be persisted.");
  const stored = normalizedStoredEnvelope(rows[0]);
  if (stored.digest !== digest || stored.uploadId !== normalized.uploadId) {
    throw new Error("The OHLQ upload ID or digest is already bound to different content.");
  }
  await sql.query(`DELETE FROM ohlq_worker_artifacts
    WHERE generated_at < NOW() - ($1::text || ' days')::interval`, [String(RETENTION_DAYS)]);
  return {
    uploadId: stored.uploadId,
    generatedAt: stored.generatedAt,
    receivedAt: stored.receivedAt,
    digest: stored.digest,
    artifactPath: `postgres://ohlq_worker_artifacts/${stored.digest}`,
  };
}

export async function readLatestOhlqWorkerEnvelopeFromDatabase(options: StoreOptions = {}) {
  const sql = database(options);
  await ensureSchema(sql);
  const rows = await sql.query(`SELECT digest, upload_id::text, generated_at, received_at, encrypted_payload
    FROM ohlq_worker_artifacts
    ORDER BY generated_at DESC, received_at DESC
    LIMIT 1`);
  if (!rows.length) return null;
  return normalizedStoredEnvelope(rows[0]);
}
