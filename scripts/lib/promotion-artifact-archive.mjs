import { createHash } from 'node:crypto';

// Retention expiration is not loss of provenance when the original GitHub ZIP
// is retained byte-for-byte. The successful run identity is checked separately.
export function archivedPromotionArtifactMatches(bytes, digest) {
  return Buffer.isBuffer(bytes) && /^[a-f0-9]{64}$/.test(String(digest || ''))
    && createHash('sha256').update(bytes).digest('hex') === digest;
}

export function renewedPromotionProvenance(original, renewal, state) {
  if (!renewal) return original;
  const next = renewal.provenance;
  if (renewal.schemaVersion !== 1 || renewal.state !== state
    || renewal.supersedesArtifactDigest !== original.artifactDigest
    || !next || next.repository !== original.repository || next.status !== 'success'
    || !/^\d+$/.test(String(next.workflowRunId))
    || next.artifactName !== `state-promotion-provenance-${state}-${next.workflowRunId}`
    || next.workflowRunUrl !== `https://github.com/${next.repository}/actions/runs/${next.workflowRunId}`) {
    throw new Error(`${state}: invalid promotion provenance renewal.`);
  }
  return next;
}
