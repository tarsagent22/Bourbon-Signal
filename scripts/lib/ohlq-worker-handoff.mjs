import { createHash } from 'node:crypto';

export const OHLQ_WORKER_CONTRACT = 'bourbon-signal/ohlq-worker-artifact@1';

export function ohlqArtifactDigest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function validateOhlqArtifactDownload(envelope, options = {}) {
  const now = options.now ?? Date.now();
  const maximumAgeMs = options.maximumAgeMs ?? 6 * 60 * 60_000;
  if (!envelope || typeof envelope !== 'object' || envelope.contractVersion !== OHLQ_WORKER_CONTRACT) {
    throw new Error('OHLQ worker artifact response has an invalid contract.');
  }
  if (!envelope.artifact || envelope.artifact.generatedAt !== envelope.generatedAt) {
    throw new Error('OHLQ worker artifact response has mismatched timestamps.');
  }
  const generatedAtMs = Date.parse(envelope.generatedAt || '');
  if (!Number.isFinite(generatedAtMs) || generatedAtMs > now + 5 * 60_000 || now - generatedAtMs > maximumAgeMs) {
    throw new Error('OHLQ worker artifact response is stale or future-dated.');
  }
  if (ohlqArtifactDigest(envelope.artifact) !== envelope.digest) {
    throw new Error('OHLQ worker artifact response failed digest verification.');
  }
  return envelope.artifact;
}
