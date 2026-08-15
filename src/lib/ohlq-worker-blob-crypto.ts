import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

export const OHLQ_WORKER_BLOB_CONTRACT = "bourbon-signal/ohlq-worker-blob@1";

function encryptionKey(secret = process.env.OHLQ_WORKER_ARTIFACT_SECRET) {
  const resolved = secret && secret.length >= 32
    ? secret
    : process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 32
      ? createHmac("sha256", process.env.CRON_SECRET).update("bourbon-signal/ohlq-worker-capability@1").digest("base64url")
      : undefined;
  if (!resolved) throw new Error("OHLQ worker artifact encryption credential is not configured.");
  return createHash("sha256").update(`${OHLQ_WORKER_BLOB_CONTRACT}\0${resolved}`).digest();
}

export function encryptOhlqWorkerBlob(value: unknown, secret?: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return JSON.stringify({
    contractVersion: OHLQ_WORKER_BLOB_CONTRACT,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  });
}

export function decryptOhlqWorkerBlob(raw: string, secret?: string) {
  const envelope = JSON.parse(raw) as Record<string, unknown>;
  if (envelope.contractVersion !== OHLQ_WORKER_BLOB_CONTRACT) throw new Error("Unsupported encrypted OHLQ blob contract.");
  const iv = Buffer.from(String(envelope.iv || ""), "base64url");
  const tag = Buffer.from(String(envelope.tag || ""), "base64url");
  const ciphertext = Buffer.from(String(envelope.ciphertext || ""), "base64url");
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) throw new Error("Encrypted OHLQ blob is malformed.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")) as Record<string, unknown>;
}
