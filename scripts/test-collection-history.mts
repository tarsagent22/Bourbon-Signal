import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { MemberCollectionDatabase } from '../src/lib/member-collection-repository.ts';
async function load<T>(path: string): Promise<T> { const module = await import(path); return (module.default || module) as T; }
const { MemberCollectionRepository, MemberCollectionConflictError, MemberCollectionLimitError } = await load<typeof import('../src/lib/member-collection-repository.ts')>('../src/lib/member-collection-repository.ts');
const { CollectionHistoryRepository } = await load<typeof import('../src/lib/collection-history-repository.ts')>('../src/lib/collection-history-repository.ts');
const { normalizeCollectionBottles } = await load<typeof import('../src/lib/member-collection.ts')>('../src/lib/member-collection.ts');
const { collectionValueForMember } = await load<typeof import('../src/lib/collection-value.ts')>('../src/lib/collection-value.ts');
const { summarizeCollectionValue } = await load<typeof import('../shared/collection-history.ts')>('../shared/collection-history.ts');


const pg = await PGlite.create();
try {
  await pg.exec(await readFile(new URL('../src/lib/member-collection-schema.sql', import.meta.url), 'utf8'));
  const database: MemberCollectionDatabase = {
    async query(text, params) { return (await pg.query(text, params)).rows; },
    async transaction(factory) {
      return pg.transaction(async tx => {
        const tasks: Array<{ text: string; params?: unknown[] }> = [];
        factory({ query(text, params) { tasks.push({ text, params }); return Promise.resolve([]); } });
        const results: unknown[] = [];
        for (const task of tasks) results.push((await tx.query(task.text, task.params)).rows);
        return results;
      });
    },
  };
  const collections = new MemberCollectionRepository(database), history = new CollectionHistoryRepository(database);
  const make = (sealed: number, open = 0) => normalizeCollectionBottles([{ bottleId: 'example', bottleName: 'Example', canonicalKey: 'example', sealedQuantity: sealed, openedQuantity: open, isRated: false, rating: 0, notes: 'private note that must not enter history', addedAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' }]);
  const prices = [{ bottleId: 'example', names: ['Example'], reviewedAt: '2026-10-16', msrp: { amount: 50, date: '2026-10-16', source: 'https://example.com/price', label: 'Fixture price' }, secondary: { low: 80, high: 100, date: '2026-10-16', source: 'https://example.com/market', label: 'Fixture market' } }];
  const price = (entries: ReturnType<typeof make>) => collectionValueForMember(true, entries, new Date('2026-10-16'), prices)!;
  const first = make(1);
  await collections.replaceForUser('owner-a', first, 0, { historyValue: summarizeCollectionValue(price(first)) });
  let records = await history.list('owner-a');
  assert.equal(records.points.length, 1); assert.equal(records.points[0].value.msrp.total, 50);
  assert.equal(records.points[0].value.secondary.low, 80);
  const stored = await pg.query<{ inventory: unknown }>('SELECT inventory FROM member_collection_history WHERE user_id=$1', ['owner-a']);
  assert.ok(!JSON.stringify(stored.rows).includes('private note'));
  assert.ok(Date.parse(records.points[0].observedAt) > Date.parse('2026-10-01T00:00:00Z'), 'observation time must not be backdated to acquisition');
  assert.equal(await history.observe('owner-a', 1, price(first)), true);
  assert.equal((await history.list('owner-a')).points.length, 1, 'repeat reads do not manufacture observations');
  const next = make(2);
  await collections.replaceForUser('owner-a', next, 1, { historyValue: summarizeCollectionValue(price(next)) });
  assert.equal((await history.list('owner-a')).points.at(-1)!.value.msrp.total, 100);
  assert.equal(await history.observe('owner-a', 1, price(first)), false, 'late pricing must not attach to newer holdings');
  await assert.rejects(collections.replaceForUser('owner-a', first, 1), MemberCollectionConflictError);
  await assert.rejects(collections.replaceForUser('owner-a', [...first, { ...first[0], bottleId: 'other', canonicalKey: 'other', bottleName: 'Other' }], 2, { bottleLimit: 1 }), MemberCollectionLimitError);
  assert.equal((await history.list('owner-a')).points.length, 2, 'rejected mutations leave no history');
  const opened = make(1, 1);
  await collections.replaceForUser('owner-a', opened, 2, { historyValue: summarizeCollectionValue(price(opened)) });
  records = await history.list('owner-a');
  assert.equal(records.points.at(-1)!.value.msrp.total, 100); assert.equal(records.points.at(-1)!.value.secondary.low, 80, 'open bottles leave sealed market estimates');
  await collections.replaceForUser('owner-b', make(1), 0);
  assert.equal((await history.list('owner-b')).points.length, 0, 'missing prices are not zero-valued observations');
  assert.equal((await history.list('owner-a')).points.length, 3, 'account histories remain isolated');
  const increased = { ...price(opened), msrp: { total: 120, pricedCount: 2 } };
  await history.observe('owner-a', 3, increased);
  assert.equal((await history.list('owner-a')).points.length, 4, 'price observations can change without inventory version changes');
  await pg.exec(`CREATE FUNCTION reject_history_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'history unavailable'; END; $$;
    CREATE TRIGGER reject_history_fixture BEFORE INSERT ON member_collection_history FOR EACH ROW EXECUTE FUNCTION reject_history_fixture();`);
  await assert.rejects(collections.replaceForUser('owner-a', make(4), 3, { historyValue: summarizeCollectionValue(price(make(4))) }));
  assert.equal((await collections.getForUser('owner-a')).version, 3, 'history failure rolls back the collection version and inventory');
  assert.equal((await history.list('owner-a')).points.length, 4);
  await pg.exec('DROP TRIGGER reject_history_fixture ON member_collection_history; DROP FUNCTION reject_history_fixture();');
  await pg.query('DELETE FROM member_collection_state WHERE user_id=$1', ['owner-a']);
  assert.equal((await history.list('owner-a')).points.length, 0, 'account deletion cascades to history');
  assert.equal((await collections.getForUser('owner-b')).bottles.length, 1);
  console.log('PostgreSQL collection-history integration passed: atomic writes, pricing observations, conflicts, limits, privacy, and account deletion.');
} finally { await pg.close(); }
