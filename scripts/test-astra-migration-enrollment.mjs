import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
test('canonical queue migration splitter produces executable PostgreSQL',async()=>{
 const source=await readFile(new URL('./migrate-alert-queue.mjs',import.meta.url),'utf8');
 const expression=source.slice(source.indexOf('const statements = schema'),source.indexOf('const sql = neon'));
 assert.ok(expression.startsWith('const statements = schema'));
 const schema=(await readFile(new URL('../src/lib/alert-queue/schema.sql',import.meta.url),'utf8'))+'\n'+(await readFile(new URL('../src/lib/alert-queue/push-outbox.sql',import.meta.url),'utf8'));
 // Execute the checked-in operator's exact parser, not a friendlier duplicate.
 const statements=new Function('schema',expression+';return statements;')(schema);
 const db=new PGlite();
 try {
  await db.exec('begin');
  for(const statement of statements)await db.query(statement);
  const result=await db.query("select to_regclass('alert_push_outbox') is not null as ready");
  assert.equal(result.rows[0].ready,true);
  await db.exec('rollback');
 } finally {await db.close();}
});
test('application migration enrolls both push ownership and retailer verification',async()=>{
 const source=await readFile(new URL('./migrate-app-storage.mjs',import.meta.url),'utf8');
 for(const name of ['push-ownership-schema.sql','retailer-store-verification.sql'])assert.ok(source.includes(name),`${name} absent from canonical migration`);
});
test('queue migration applies and verifies cursor and push outbox',async()=>{
 const source=await readFile(new URL('./migrate-alert-queue.mjs',import.meta.url),'utf8');
 for(const name of ['push-outbox.sql','alert_recipient_cursor','alert_push_outbox','alert_push_tickets','alert-queue-v6-push-receipts'])assert.ok(source.includes(name),`${name} missing`);
});
test('required CI push command includes durable outbox and receipt reconciliation contracts',async()=>{
 const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
 const command=String(pkg.scripts?.['test:push-devices']||'');
 for(const name of ['test-push-devices.mts','test-m12-push-outbox.mjs','test-push-receipts.mts'])assert.ok(command.includes(name),`${name} missing from test:push-devices`);
 assert.match(String(pkg.scripts?.['verify:ci']||''),/test:push-devices/);
});
