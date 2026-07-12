import test from 'node:test';
import assert from 'node:assert/strict';

import { attachRunIdentity, verifyRunCoherence } from '../src/site-run-coherence.mjs';

test('attachRunIdentity stamps every generated payload with one run identity', () => {
  const identity = { runId: 'run-2026-07-12-abc', generatedAt: '2026-07-12T12:00:00.000Z', engineGeneratedAt: '2026-07-12T11:59:00.000Z' };
  const payloads = {
    stats: attachRunIdentity({ count: 1 }, identity),
    manifest: attachRunIdentity({ files: {} }, identity),
    drops: attachRunIdentity({ drops: [] }, identity),
  };
  assert.deepEqual(verifyRunCoherence(payloads, identity), { ok: true, errors: [] });
  assert.equal(payloads.drops.runId, identity.runId);
  assert.equal(payloads.drops.engineGeneratedAt, identity.engineGeneratedAt);
});

test('verifyRunCoherence rejects mixed-run and mixed-engine artifacts', () => {
  const identity = { runId: 'run-a', generatedAt: '2026-07-12T12:00:00.000Z', engineGeneratedAt: 'engine-a' };
  const payloads = {
    stats: attachRunIdentity({}, identity),
    drops: { ...attachRunIdentity({}, identity), runId: 'run-b' },
    alerts: { ...attachRunIdentity({}, identity), engineGeneratedAt: 'engine-b' },
  };
  const result = verifyRunCoherence(payloads, identity);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /drops.*runId/i);
  assert.match(result.errors.join(' '), /alerts.*engineGeneratedAt/i);
});
