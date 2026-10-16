import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { archivedPromotionArtifactMatches, renewedPromotionProvenance } from './lib/promotion-artifact-archive.mjs';

test('expired promotion artifacts require the original digest-pinned bytes', () => {
  const bytes = Buffer.from('original-github-archive');
  const digest = createHash('sha256').update(bytes).digest('hex');
  assert.equal(archivedPromotionArtifactMatches(bytes, digest), true);
  assert.equal(archivedPromotionArtifactMatches(Buffer.from('changed-archive'), digest), false);
  assert.equal(archivedPromotionArtifactMatches(null, digest), false);
  assert.equal(archivedPromotionArtifactMatches(bytes, ''), false);
});

test('renewal is state-bound and preserves the frozen original promotion record', () => {
  const original = { repository: 'owner/repo', artifactDigest: 'a'.repeat(64) };
  const next = { repository: 'owner/repo', workflowRunId: '123', workflowRunUrl: 'https://github.com/owner/repo/actions/runs/123', artifactName: 'state-promotion-provenance-UT-123', status: 'success' };
  const renewal = { schemaVersion: 1, state: 'UT', supersedesArtifactDigest: original.artifactDigest, provenance: next };
  assert.equal(renewedPromotionProvenance(original, null, 'UT'), original);
  assert.equal(renewedPromotionProvenance(original, renewal, 'UT'), next);
  assert.throws(() => renewedPromotionProvenance(original, renewal, 'MS'));
  assert.throws(() => renewedPromotionProvenance(original, { ...renewal, supersedesArtifactDigest: 'wrong' }, 'UT'));
  assert.throws(() => renewedPromotionProvenance(original, { ...renewal, provenance: { ...next, repository: 'other/repo' } }, 'UT'));
  assert.equal(original.artifactDigest, 'a'.repeat(64));
});
