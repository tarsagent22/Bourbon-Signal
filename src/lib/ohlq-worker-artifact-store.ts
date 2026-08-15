import { list, put } from "@vercel/blob";

import { ohlqWorkerArtifactDigest, sanitizeOhlqWorkerEnvelope } from "./ohlq-worker-artifact.ts";
import { decryptOhlqWorkerBlob, encryptOhlqWorkerBlob } from "./ohlq-worker-blob-crypto.ts";

const ARTIFACT_PREFIX = "source-artifacts/ohlq/artifacts/";
const POINTER_PREFIX = "source-artifacts/ohlq/latest/";
const UPLOAD_PREFIX = "source-artifacts/ohlq/uploads/";
const INVERSE_EPOCH = 9_999_999_999_999;

type BlobClient = {
  list: typeof list;
  put: typeof put;
  fetcher: typeof fetch;
};

function client(overrides: Partial<BlobClient> = {}): BlobClient {
  return { list, put, fetcher: fetch, ...overrides };
}

async function readExact(pathname: string, blob: BlobClient) {
  const result = await blob.list({ prefix: pathname, limit: 10, token: process.env.BLOB_READ_WRITE_TOKEN });
  const exact = result.blobs.find((entry) => entry.pathname === pathname);
  if (!exact) return null;
  const response = await blob.fetcher(exact.url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`OHLQ artifact blob read failed with HTTP ${response.status}.`);
  return decryptOhlqWorkerBlob(await response.text());
}

function alreadyExists(error: unknown) {
  return /already exists|conflict|overwrite/i.test(String(error));
}

function blobPutOptions() {
  return {
    access: "public" as const,
    addRandomSuffix: false,
    allowOverwrite: false,
    cacheControlMaxAge: 31_536_000,
    contentType: "application/octet-stream",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  };
}

async function putImmutable(pathname: string, value: Record<string, unknown>, blob: BlobClient) {
  try {
    await blob.put(pathname, encryptOhlqWorkerBlob(value), blobPutOptions());
    return value;
  } catch (error) {
    if (!alreadyExists(error)) throw error;
    const existing = await readExact(pathname, blob);
    if (!existing) throw error;
    return existing;
  }
}

function pointerPath(generatedAt: string, digest: string) {
  const inverse = String(INVERSE_EPOCH - Date.parse(generatedAt)).padStart(13, "0");
  return `${POINTER_PREFIX}${inverse}-${digest}.json`;
}

export async function storeOhlqWorkerEnvelope(value: unknown, overrides: Partial<BlobClient> = {}) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN is not configured.");
  const blob = client(overrides);
  const normalized = sanitizeOhlqWorkerEnvelope(value);
  const digest = ohlqWorkerArtifactDigest(normalized.artifact);
  const artifactPath = `${ARTIFACT_PREFIX}${normalized.generatedAt.replace(/[:.]/g, "-")}-${digest}.json`;
  const manifestPath = pointerPath(normalized.generatedAt, digest);
  const uploadPath = `${UPLOAD_PREFIX}${normalized.uploadId}.json`;
  const receivedAt = new Date().toISOString();

  const artifactRecord = {
    contractVersion: normalized.contractVersion,
    uploadId: normalized.uploadId,
    generatedAt: normalized.generatedAt,
    receivedAt,
    digest,
    artifact: normalized.artifact,
  };
  const storedArtifact = await putImmutable(artifactPath, artifactRecord, blob);
  if (storedArtifact.digest !== digest) throw new Error("An immutable OHLQ artifact path has conflicting content.");

  const uploadRecord = { uploadId: normalized.uploadId, generatedAt: normalized.generatedAt, digest, artifactPath, manifestPath };
  const storedUpload = await putImmutable(uploadPath, uploadRecord, blob);
  if (storedUpload.digest !== digest || storedUpload.artifactPath !== artifactPath) {
    throw new Error("The OHLQ upload ID is already bound to different content.");
  }

  const manifestRecord = {
    contractVersion: normalized.contractVersion,
    uploadId: normalized.uploadId,
    generatedAt: normalized.generatedAt,
    receivedAt: storedArtifact.receivedAt || receivedAt,
    digest,
    artifactPath,
  };
  const storedManifest = await putImmutable(manifestPath, manifestRecord, blob);
  if (storedManifest.digest !== digest || storedManifest.artifactPath !== artifactPath) {
    throw new Error("An immutable OHLQ manifest path has conflicting content.");
  }
  return { uploadId: normalized.uploadId, generatedAt: normalized.generatedAt, receivedAt: manifestRecord.receivedAt, digest, artifactPath };
}

export async function readLatestOhlqWorkerEnvelope(overrides: Partial<BlobClient> = {}) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN is not configured.");
  const blob = client(overrides);
  const pointers = await blob.list({ prefix: POINTER_PREFIX, limit: 10, token: process.env.BLOB_READ_WRITE_TOKEN });
  const latest = [...pointers.blobs].sort((left, right) => left.pathname.localeCompare(right.pathname))[0];
  if (!latest) return null;
  const manifest = await readExact(latest.pathname, blob);
  if (!manifest?.artifactPath) throw new Error("The latest OHLQ manifest is malformed.");
  const stored = await readExact(String(manifest.artifactPath), blob);
  if (!stored) throw new Error("The OHLQ worker manifest references a missing artifact.");
  const normalized = sanitizeOhlqWorkerEnvelope({
    contractVersion: stored.contractVersion,
    uploadId: stored.uploadId,
    generatedAt: stored.generatedAt,
    artifact: stored.artifact,
  }, { maximumAgeMs: 12 * 60 * 60_000 });
  const digest = ohlqWorkerArtifactDigest(normalized.artifact);
  if (digest !== manifest.digest || digest !== stored.digest) throw new Error("OHLQ worker artifact digest mismatch.");
  return {
    contractVersion: normalized.contractVersion,
    uploadId: normalized.uploadId,
    generatedAt: normalized.generatedAt,
    receivedAt: stored.receivedAt,
    digest,
    artifact: normalized.artifact,
  };
}
