import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
const sql=neon(process.env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED || process.env.BOURBON_QUEUE_DATABASE_URL || process.env.DATABASE_URL);
const source='test:'+randomUUID(),owner=randomUUID();
try {
  const first=await sql.query('SELECT * FROM source_poll_acquire($1,$2,300)',[source,owner]);
  const generation=first[0].generation;
  const overlap=await sql.query('SELECT * FROM source_poll_acquire($1,$2,300)',[source,randomUUID()]);
  assert.equal(overlap.length,0,'overlap fenced');
  const fence=await sql.query("SELECT source_poll_finish($1,$2,$3,'{}'::jsonb,'accepted',0,0,'{}'::jsonb) AS ok",[source,'wrong',generation]);
  assert.equal(fence[0].ok,false);
  await sql.query("SELECT source_poll_finish($1,$2,$3,NULL,'timeout',300,0,'{}'::jsonb)",[source,owner,generation]);
  assert.equal((await sql.query('SELECT * FROM source_poll_acquire($1,$2,300)',[source,randomUUID()])).length,0,'backoff survives restart');
  await sql.query("UPDATE source_poll_jobs SET next_due_at=now()-interval '1 hour',lease_until=now()-interval '1 hour',lease_owner='abandoned' WHERE source_id=$1",[source]);
  const recoveredOwner=randomUUID();
  const recovered=await sql.query('SELECT * FROM source_poll_acquire($1,$2,300)',[source,recoveredOwner]);
  assert.ok(Number(recovered[0].generation)>Number(generation),'missed job recovered with newer generation');
  const stale=await sql.query("SELECT source_poll_finish($1,$2,$3,'{}'::jsonb,'accepted',0,0,'{}'::jsonb) AS ok",[source,owner,generation]);
  assert.equal(stale[0].ok,false,'abandoned worker cannot replace newer evidence');
  await sql.query("SELECT source_poll_finish($1,$2,$3,$4::jsonb,'accepted',0,0,'{}'::jsonb)",[source,recoveredOwner,recovered[0].generation,JSON.stringify({drops:[],candidates:[]})]);
  assert.ok((await sql.query('SELECT resolved_at FROM source_poll_incidents WHERE source_id=$1',[source]))[0].resolved_at,'recovery resolves incident');
  console.log('PASS: database overlap, crash recovery, generation fencing, due/backoff persistence and incident resolution');
}finally {
  await sql.transaction([sql.query('DELETE FROM source_poll_incidents WHERE source_id=$1',[source]),sql.query('DELETE FROM source_poll_runs WHERE source_id=$1',[source]),sql.query('DELETE FROM source_poll_jobs WHERE source_id=$1',[source])]);
}
