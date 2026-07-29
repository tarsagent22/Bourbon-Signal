import assert from 'node:assert/strict';
import type { CollectionBottlePreference } from '../src/lib/member-collection.ts';

const loadedRepository = await import('../src/lib/member-collection-repository.ts');
const repositoryModule = ((loadedRepository as { default?: unknown }).default || loadedRepository) as typeof import('../src/lib/member-collection-repository.ts');
const { MemberCollectionConflictError, MemberCollectionRepository } = repositoryModule;

interface Call { text: string; params: unknown[] }

class FakeDatabase {
  calls: Call[] = [];
  collections = new Map<string, { version: number; bottles: CollectionBottlePreference[]; migrated: boolean }>();

  async query(text: string, params: unknown[] = []) {
    this.calls.push({ text, params });
    if (text.includes('SELECT pg_advisory_xact_lock')) return [];
    if (text.includes('FROM member_collection_bottles') && text.includes('AVG(rating)')) {
      const keys = params[0] as string[];
      const ratings = [...this.collections.values()].flatMap((value) => {
        const matching = value.bottles
          .filter((bottle) => keys.includes(bottle.canonicalKey) && bottle.rating > 0)
          .map((bottle) => bottle.rating);
        return matching.length ? [Math.max(...matching)] : [];
      });
      return ratings.length ? [{ average: ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length, count: ratings.length }] : [];
    }
    if (text.includes('WITH current_state') && text.includes('should_migrate')) {
      const userId = String(params[0]);
      const bottles = JSON.parse(String(params[2])) as CollectionBottlePreference[];
      const current = this.collections.get(userId) || { version: 0, bottles: [], migrated: false };
      if (!current.migrated) this.collections.set(userId, { version: current.version + 1, bottles, migrated: true });
      return [{ should_migrate: !current.migrated, entry_count: !current.migrated ? bottles.length : 0 }];
    }
    if (text.includes('WITH current_state') && text.includes('next_version')) {
      const userId = String(params[0]);
      const expectedVersion = params[1] == null ? null : Number(params[1]);
      const bottles = JSON.parse(String(params[2])) as CollectionBottlePreference[];
      const current = this.collections.get(userId) || { version: 0, bottles: [], migrated: true };
      if (expectedVersion != null && expectedVersion !== current.version) return [{ outcome: 'conflict', version: current.version }];
      const next = { version: current.version + 1, bottles, migrated: true };
      this.collections.set(userId, next);
      return [{ outcome: 'saved', version: next.version }];
    }
    if (text.includes('FROM member_collection_state') && text.includes('member_collection_bottles')) {
      const userId = String(params[0]);
      const current = this.collections.get(userId) || { version: 0, bottles: [], migrated: false };
      return current.bottles.map((bottle) => ({ version: current.version, payload: bottle }));
    }
    return [];
  }

  async transaction(factory: (executor: { query(text: string, params?: unknown[]): Promise<unknown> }) => Promise<unknown>[]) {
    return Promise.all(factory(this));
  }
}

const bottle = (name: string, rating: number, updatedAt = '2026-07-29T04:00:00.000Z'): CollectionBottlePreference => ({
  bottleId: name.toLowerCase().replaceAll(' ', '-'),
  bottleName: name,
  canonicalKey: name.toLowerCase(),
  rating,
  tasteTags: ['caramel'],
  wouldBuyAgain: rating >= 80,
  notes: '',
  addedAt: '2026-07-29T03:00:00.000Z',
  updatedAt,
});

const database = new FakeDatabase();
const repository = new MemberCollectionRepository(database);

assert.equal(await repository.migrateLegacyForUser('user-a', [bottle('Bottle A', 88)]), true);
assert.equal(await repository.migrateLegacyForUser('user-a', [bottle('Older overwrite', 10)]), false, 'legacy collection migrates once');
assert.deepEqual(await repository.getForUser('user-a'), {
  version: 1,
  bottles: [{ ...bottle('Bottle A', 88), pendingCanonicalMatch: false, bottleContributionId: undefined }],
});

const saved = await repository.replaceForUser('user-a', [bottle('Bottle A', 91), bottle('Bottle B', 76)], 1);
assert.equal(saved.version, 2);
assert.equal(saved.bottles.length, 2);
await assert.rejects(
  repository.replaceForUser('user-a', [bottle('Stale device', 40)], 1),
  (error: unknown) => error instanceof MemberCollectionConflictError && error.currentVersion === 2,
  'stale full-collection writes are rejected instead of overwriting another device',
);

await repository.migrateLegacyForUser('user-b', [bottle('Bottle A', 81)]);
const aggregate = await repository.getTasteAggregate(['bottle a']);
assert.deepEqual(aggregate, { average: 86, count: 2 });
assert.equal(database.calls.some((call) => call.text.includes('GROUP BY user_id')), true, 'taste aggregation weights each member once');
assert.equal(database.calls.some((call) => /CREATE TABLE|ALTER TABLE|CREATE INDEX/i.test(call.text)), false, 'runtime collection requests never run schema DDL');
assert.equal(database.calls.some((call) => call.text.includes('pg_advisory_xact_lock')), true, 'collection replacements serialize per user');

console.log('member collection repository tests passed');
