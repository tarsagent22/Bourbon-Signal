import { createHash } from 'node:crypto';

// Retention expiration is not loss of provenance when the original GitHub ZIP
// is retained byte-for-byte. The successful run identity is checked separately.
export function archivedPromotionArtifactMatches(bytes, digest) {
  return Buffer.isBuffer(bytes) && /^[a-f0-9]{64}$/.test(String(digest || ''))
    && createHash('sha256').update(bytes).digest('hex') === digest;
}
