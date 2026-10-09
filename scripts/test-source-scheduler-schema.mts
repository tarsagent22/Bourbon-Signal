import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('durable source jobs isolate siblings, recover abandoned work and fence stale publication',async()=>{
 const db=new PGlite();
 try {
  await db.exec(await readFile('src/lib/source-scheduler-schema.sql','utf8'));
  const acquire=async(id:string,owner:string)=>(await db.query<any>('SELECT * FROM source_poll_acquire($1,$2,300)',[id,owner])).rows[0];
  const a=await acquire('failed','a');const b=await acquire('healthy','b');
  assert.equal(await acquire('healthy','overlap'),undefined);
  await db.query("SELECT source_poll_finish($1,$2,$3,NULL,'source_identity_or_schema_failure',300,21600,'{}'::jsonb)",['failed','a',a.generation]);
  await db.query("SELECT source_poll_finish($1,$2,$3,$4::jsonb,'accepted',0,0,'{}'::jsonb)",['healthy','b',b.generation,JSON.stringify({drops:[{id:'safe'}],candidates:[{id:'alert'}]})]);
  const jobs=(await db.query<any>('SELECT * FROM source_poll_jobs ORDER BY source_id')).rows;
  assert.ok(jobs[0].paused_until);assert.equal(jobs[1].projection.candidates[0].id,'alert');
  assert.equal(await acquire('failed','probe-too-soon'),undefined);
  await db.query("UPDATE source_poll_jobs SET next_due_at=now()-interval '1 hour',lease_owner='abandoned',lease_until=now()-interval '1 hour' WHERE source_id='healthy'");
  const recovery=await acquire('healthy','recovery');assert.ok(Number(recovery.generation)>Number(b.generation));
  const stale=(await db.query<any>("SELECT source_poll_finish($1,$2,$3,'{}'::jsonb,'accepted',0,0,'{}'::jsonb) AS ok",['healthy','b',b.generation])).rows[0];
  assert.equal(stale.ok,false);
  assert.equal((await db.query<any>("SELECT projection FROM source_poll_jobs WHERE source_id='healthy'")).rows[0].projection.drops[0].id,'safe');
  assert.equal((await db.query<any>('SELECT reason FROM source_poll_incidents')).rows[0].reason,'source_identity_or_schema_failure');
 } finally {await db.close();}
});
