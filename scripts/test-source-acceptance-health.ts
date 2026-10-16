import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceAcceptanceHealth } from '../src/lib/source-acceptance-health.ts';

test('a punctual scheduler does not make failed, expired, or absent source acceptance healthy', () => {
  const now = Date.parse('2026-10-16T03:00:00Z');
  const sources = ['fresh', 'failed', 'stale', 'missing'].map(id => ({ id, kind: 'fl-abc', expiryHours: 1 }));
  const rows = sourceAcceptanceHealth([
    { source_id: 'fresh', accepted_at: '2026-10-16T02:30:00Z', last_reason: 'accepted' },
    { source_id: 'failed', accepted_at: '2026-10-16T02:30:00Z', last_reason: 'source_identity_or_schema_failure', failures: 1 },
    { source_id: 'stale', accepted_at: '2026-10-15T02:30:00Z', last_reason: 'accepted' },
  ], sources, now);
  assert.deepEqual(rows.map(row => row.status), ['healthy', 'degraded', 'stale', 'never_accepted']);
});
