import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
import { migrationNeonConnectionString } from '../src/lib/neon-runtime.ts';
const connection = migrationNeonConnectionString(process.env);
if (!connection) throw new Error('Collection database is not configured.');
const sql = neon(connection);
if (process.argv.includes('--apply')) {
  const schema = await readFile(new URL('../src/lib/member-collection-schema.sql', import.meta.url), 'utf8');
  const start = schema.indexOf('-- Observation timestamps');
  if (start < 0) throw new Error('Collection history schema marker not found.');
  const statements = schema.slice(start).split(';').map(statement => statement.trim()).filter(Boolean);
  await sql.transaction(tx => statements.map(statement => tx.query(statement)));
}
const [row] = await sql.query(`SELECT to_regclass('public.member_collection_history') IS NOT NULL AS table_exists,
  to_regclass('public.member_collection_history_user_time_idx') IS NOT NULL AS index_exists`);
console.log(JSON.stringify({ applied: process.argv.includes('--apply'), ...row }));
if (!row.table_exists || !row.index_exists) process.exitCode = 1;
