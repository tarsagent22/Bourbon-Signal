import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import * as reader from '../src/lib/source-projection-reader.ts';
const { createSourceProjectionReader } = ('default' in reader ? reader.default : reader) as typeof import('../src/lib/source-projection-reader.ts');

test('live source heads skip repeated payloads but preserve failures, empty results and new revisions', async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile('src/lib/source-scheduler-schema.sql', 'utf8'));
    await db.query(`INSERT INTO source_poll_jobs (source_id,cadence_seconds,generation,accepted_at,last_reason,projection)
      VALUES ('active',300,1,now(),'accepted',$1), ('missing',300,1,NULL,'failed',NULL), ('other',300,1,now(),'accepted','{}')`,
      [JSON.stringify({ drops: [{ id: 'drop', evidence: 'x'.repeat(100_000) }], candidates: [{ id: 'alert' }] })]);
    let wire: Record<string, unknown>[] = [];
    let queries = 0;
    const sql = { async query(text: string, args: unknown[] = []) { queries++; return { rows: wire = (await db.query(text, args)).rows as typeof wire }; } };
    const read = createSourceProjectionReader();
    const ids = ['active', 'missing'];
    const first = await read(sql, 'drops', ids);
    assert.deepEqual(Object.keys(first[0].projection!), ['drops']);
    assert.equal(first[1].projection, null);
    assert.ok(JSON.stringify(wire).length > 100_000);
    assert.deepEqual(await read(sql, 'drops', ids), first);
    assert.ok(JSON.stringify(wire).length < 1_000, 'warm reads transfer only current heads');
    await db.query("UPDATE source_poll_jobs SET last_reason='failed' WHERE source_id='active'");
    const failed = (await read(sql, 'drops', ids))[0];
    assert.equal(failed.last_reason, 'failed');
    assert.deepEqual(failed.projection, first[0].projection, 'failure retains the payload for policy to veto');
    assert.ok(JSON.stringify(wire).length < 1_000);
    assert.deepEqual((await read(sql, 'candidates', ids))[0].projection, { candidates: [{ id: 'alert' }] });
    await db.query(`UPDATE source_poll_jobs SET generation=2, accepted_at=clock_timestamp(), last_reason='accepted',
      projection='{"drops":[],"candidates":[]}' WHERE source_id='active'`);
    const empty = (await read(sql, 'drops', ids))[0];
    assert.equal(empty.last_reason, 'accepted');
    assert.deepEqual(empty.projection, { drops: [] }, 'an accepted empty result owns the partition');
    assert.deepEqual((await read(sql, 'drops', ids))[0], empty);
    assert.equal(wire[0].projection, null);
    await db.query("UPDATE source_poll_jobs SET projection=NULL WHERE source_id='active'");
    assert.equal((await read(sql, 'drops', ids))[0].projection, null, 'a removed projection cannot be revived');
    assert.equal(queries, 7, 'heads and any replacement payload arrive in one statement per read');
  } finally { await db.close(); }
});
