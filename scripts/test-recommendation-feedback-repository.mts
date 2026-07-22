import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RecommendationFeedbackRepository } from '../src/lib/recommendation-feedback-repository.ts';

type StoredRow = { userId: string; canonicalKey: string; payload: Record<string, unknown>; updatedAt: string };

class RecordingExecutor {
  calls: Array<{ text: string; params: unknown[] }> = [];
  rows: StoredRow[] = [];
  legacyMigrated = new Set<string>();
  resetAt = new Map<string, string>();
  transactionCount = 0;

  async transaction(queries: (transaction: { query(text: string, params?: unknown[]): Promise<unknown> }) => Array<Promise<unknown>>) {
    this.transactionCount += 1;
    return Promise.all(queries({ query: (text, params = []) => this.query(text, params) }));
  }

  async query(text: string, params: unknown[] = []) {
    this.calls.push({ text, params });
    if (text.includes('SELECT pg_advisory_xact_lock')) return [];
    if (text.includes('legacy_migrated_at') && !text.includes('DELETE FROM bourbon_recommendation_feedback')) {
      const userId = String(params[0]);
      const shouldMigrate = !this.legacyMigrated.has(userId);
      const entries = params[2] ? JSON.parse(String(params[2])) as Array<Record<string, unknown>> : [];
      if (shouldMigrate) {
        for (const payload of entries) {
          const canonicalKey = String(payload.canonicalKey || '');
          const updatedAt = String(payload.createdAt || '');
          const current = this.rows.find((row) => row.userId === userId && row.canonicalKey === canonicalKey);
          if (!current) this.rows.push({ userId, canonicalKey, payload, updatedAt });
          else if (Date.parse(updatedAt) > Date.parse(current.updatedAt)) Object.assign(current, { payload, updatedAt });
        }
      }
      this.legacyMigrated.add(userId);
      return [{ should_migrate: shouldMigrate, entry_count: shouldMigrate ? entries.length : 0 }];
    }
    if (text.includes('INSERT INTO bourbon_recommendation_feedback (')) {
      const [userId, canonicalKey, rawPayload, updatedAt] = params as [string, string, string, string];
      if (this.resetAt.has(userId) && Date.parse(updatedAt) <= Date.parse(this.resetAt.get(userId)!)) return [];
      const payload = JSON.parse(rawPayload) as Record<string, unknown>;
      const current = this.rows.find((row) => row.userId === userId && row.canonicalKey === canonicalKey);
      if (!current) this.rows.push({ userId, canonicalKey, payload, updatedAt });
      else if (Date.parse(updatedAt) > Date.parse(current.updatedAt)) Object.assign(current, { payload, updatedAt });
      return [{ payload: (current && Date.parse(updatedAt) <= Date.parse(current.updatedAt) ? current : { payload }).payload }];
    }
    if (text.includes('SELECT payload FROM bourbon_recommendation_feedback')) {
      return this.rows
        .filter((row) => row.userId === params[0])
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((row) => ({ payload: row.payload }));
    }
    if (text.includes('DELETE FROM bourbon_recommendation_feedback')) {
      const [userId, resetAt] = params as [string, string];
      this.resetAt.set(userId, resetAt);
      this.legacyMigrated.add(userId);
      const before = this.rows.length;
      this.rows = this.rows.filter((row) => row.userId !== userId || Date.parse(row.updatedAt) > Date.parse(resetAt));
      return [{ deleted_count: before - this.rows.length }];
    }
    throw new Error(`Unexpected query: ${text}`);
  }
}

const executor = new RecordingExecutor();
const repository = new RecommendationFeedbackRepository(executor);
const newer = {
  bottleId: 'bottle-a',
  bottleName: 'Weller Special Reserve',
  canonicalKey: 'reserve special weller',
  signal: 'not_for_me' as const,
  matchedTags: ['Caramel'],
  createdAt: '2026-07-21T12:00:00.000Z',
};

await repository.upsertForUser('user-a', newer);
await repository.upsertForUser('user-b', { ...newer, signal: 'useful', createdAt: '2026-07-21T13:00:00.000Z' });
await repository.migrateLegacyForUser('user-a', [{ ...newer, signal: 'saved', createdAt: '2026-07-20T12:00:00.000Z' }]);

const userA = await repository.listForUser('user-a');
const userB = await repository.listForUser('user-b');
assert.equal(userA.length, 1, 'one canonical row is retained per user');
assert.equal(userA[0].signal, 'not_for_me', 'older legacy feedback cannot overwrite newer durable feedback');
assert.equal(userB.length, 1, 'another user can store the same canonical key independently');
assert.equal(userB[0].signal, 'useful');
assert.equal(executor.calls.some((call) => call.text.includes('CREATE TABLE IF NOT EXISTS')), false, 'runtime requests do not race on schema DDL');

const upsertSql = executor.calls.find((call) => call.text.includes('INSERT INTO bourbon_recommendation_feedback'))?.text || '';
assert.match(upsertSql, /ON CONFLICT\s*\(user_id, canonical_key\)/i, 'upsert is atomic on user and canonical key');
assert.match(upsertSql, /updated_at/i, 'upsert protects newer rows during legacy migration');
assert.match(upsertSql, /reset_at/i, 'feedback that started before a reset cannot be written after that reset');
const migrationSql = executor.calls.find((call) => call.text.includes('legacy_migrated_at'))?.text || '';
assert.match(migrationSql, /legacy_migrated_at\s+IS\s+NULL/i, 'legacy metadata can only migrate once even when reset races a GET');
assert.match(migrationSql, /jsonb_array_elements/i, 'legacy claim and all entry writes happen in one atomic statement');
for (const call of executor.calls.filter((entry) => /SELECT payload|DELETE FROM/.test(entry.text))) {
  assert.match(call.text, /user_id\s*=\s*\$1/i, 'reads and resets are always scoped by authenticated user id');
}

await repository.resetForUser('user-a');
const resetSql = executor.calls.find((call) => call.text.includes('DELETE FROM bourbon_recommendation_feedback'))?.text || '';
assert.match(resetSql, /updated_at\s*<=\s*reset_state\.reset_at/i, 'reset preserves feedback actions that started after the reset request');
assert.ok(executor.calls.filter((call) => /SELECT pg_advisory_xact_lock/i.test(call.text)).length >= 4, 'each write acquires its per-user lock in a separate transaction statement');
assert.ok(executor.transactionCount >= 4, 'write locks and fresh-snapshot mutations share database transactions');
assert.deepEqual(await repository.listForUser('user-a'), [], 'reset removes only the current user feedback');
assert.equal((await repository.listForUser('user-b')).length, 1, 'reset never exposes or removes another user feedback');

const routeSource = readFileSync(new URL('../src/app/api/bourbon-dna/feedback/route.ts', import.meta.url), 'utf8');
const routePostSource = routeSource.slice(routeSource.indexOf('export async function POST'), routeSource.indexOf('export async function DELETE'));
assert.doesNotMatch(routePostSource, /updateUserMetadata/, 'Clerk metadata is not the active feedback write store');
assert.match(routeSource, /bourbonDnaFeedback:\s*null/, 'legacy Clerk feedback is cleared after migration and reset');
assert.match(routeSource, /export async function DELETE/, 'an authenticated reset path is available');
assert.match(routeSource, /canUseRecommendations/, 'feedback routes enforce recommendation entitlement');
assert.match(routeSource, /migrateLegacyForUser/, 'legacy Clerk feedback migrates through the durable repository');

console.log('recommendation feedback repository tests passed');
