#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

const connectionString = process.env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED
  || process.env.BOURBON_QUEUE_DATABASE_URL
  || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('Missing BOURBON_QUEUE_DATABASE_URL_UNPOOLED or BOURBON_QUEUE_DATABASE_URL.');
}

const schemaUrl = new URL('../src/lib/alert-queue/schema.sql', import.meta.url);
const schema = `${await readFile(schemaUrl, 'utf8')}\n${await readFile(new URL('../src/lib/alert-queue/push-outbox.sql', import.meta.url), 'utf8')}`;
const statements = schema
  .split(';')
  .map((statement) => statement.trim())
  .filter((statement) => statement && !/^begin$/i.test(statement) && !/^commit$/i.test(statement));

const sql = neon(connectionString);
await sql.transaction((txn) => [
  ...statements.map((statement) => txn.query(statement)),
  txn.query(`
    create table if not exists alert_queue_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `),
  txn.query(`
    insert into alert_queue_migrations (version)
    values ($1), ($2), ($3)
    on conflict (version) do nothing
  `, ['alert-queue-v3-member-leases', 'alert-queue-v4-recipient-cursor', 'alert-queue-v5-push-outbox']),
]);

const verification = await sql.query(`
  select table_name
  from information_schema.tables
  where table_schema = 'public'
    and table_name in (
      'engine_snapshots',
      'alert_candidates',
      'alert_deliveries',
      'alert_baselines',
      'clerk_alert_metadata_backups',
      'alert_delivery_leases',
      'alert_recipient_cursor',
      'alert_push_outbox',
      'alert_queue_migrations'
    )
  order by table_name
`);

const tables = verification.map((row) => row.table_name);
if (tables.length !== 9) {
  throw new Error(`Alert queue schema verification failed: found ${tables.length}/9 required base tables.`);
}

const cursorColumns = await sql.query(`
  select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'alert_recipient_cursor'
    and column_name in ('id', 'next_offset', 'updated_at')
`);
if (cursorColumns.length !== 3) throw new Error('Recipient cursor schema verification failed.');

console.log(JSON.stringify({
  ok: true,
  migration: 'alert-queue-v4-recipient-cursor',
  recipientCursorVerified: true,
  tables,
}, null, 2));
