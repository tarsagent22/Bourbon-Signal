import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { archivedPromotionArtifactMatches } from './lib/promotion-artifact-archive.mjs';

test('expired promotion artifacts require the original digest-pinned bytes', () => {
  const bytes = Buffer.from('original-github-archive');
  const digest = createHash('sha256').update(bytes).digest('hex');
  assert.equal(archivedPromotionArtifactMatches(bytes, digest), true);
  assert.equal(archivedPromotionArtifactMatches(Buffer.from('changed-archive'), digest), false);
  assert.equal(archivedPromotionArtifactMatches(null, digest), false);
  assert.equal(archivedPromotionArtifactMatches(bytes, ''), false);
});
