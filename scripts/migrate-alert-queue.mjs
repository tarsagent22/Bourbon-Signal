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
const schema = await readFile(schemaUrl, 'utf8');
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
    values ($1)
    on conflict (version) do nothing
  `, ['alert-queue-v3']),
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
      'alert_lifecycle_states',
      'clerk_alert_metadata_backups',
      'alert_queue_migrations'
    )
  order by table_name
`);

const tables = verification.map((row) => row.table_name);
if (tables.length !== 7) {
  throw new Error(`Alert queue schema verification failed: found ${tables.length}/7 required tables.`);
}

console.log(JSON.stringify({
  ok: true,
  migration: 'alert-queue-v3',
  tables,
}, null, 2));
