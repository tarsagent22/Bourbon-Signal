import { createHmac, timingSafeEqual } from "node:crypto";

export interface ClerkWebhookSignatureInput {
  payload: string;
  secret: string;
  id: string;
  timestamp: string;
  signature: string;
  nowMs?: number;
}

function decodeWebhookSecret(secret: string) {
  const trimmed = secret.trim();
  const withoutPrefix = trimmed.startsWith("whsec_") ? trimmed.slice(6) : trimmed;
  return Buffer.from(withoutPrefix, "base64");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyClerkWebhookSignature(input: ClerkWebhookSignatureInput) {
  if (!input.payload || !input.secret || !input.id || !input.timestamp || !input.signature) return false;
  const timestampSeconds = Number(input.timestamp);
  const ageSeconds = Math.abs((input.nowMs ?? Date.now()) / 1000 - timestampSeconds);
  if (!Number.isFinite(timestampSeconds) || ageSeconds > 300) return false;

  const expected = createHmac("sha256", decodeWebhookSecret(input.secret))
    .update(`${input.id}.${input.timestamp}.${input.payload}`)
    .digest("base64");
  return input.signature
    .split(/\s+/u)
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.startsWith("v1,"))
    .map((candidate) => candidate.slice(3))
    .some((candidate) => safeEqual(candidate, expected));
}
