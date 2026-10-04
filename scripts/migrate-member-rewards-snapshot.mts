import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
const apply = process.argv.includes('--apply');
const connection = process.env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED || process.env.BOURBON_QUEUE_DATABASE_URL || process.env.DATABASE_URL;
if (!connection) throw new Error('Missing durable application database connection.');
const sql = neon(connection);
if (apply) {
  const source = await readFile(new URL('../src/lib/member-rewards-snapshot-migration.sql', import.meta.url), 'utf8');
  const functions = source.match(/CREATE OR REPLACE FUNCTION[\s\S]*?END \$\$;/g) || [];
  if (functions.length !== 2) throw new Error('Unexpected reward migration structure.');
  await sql.transaction(transaction => [transaction.query(source.slice(0, source.indexOf(';') + 1)), ...functions.map(statement => transaction.query(statement))], { isolationLevel: 'Serializable' });
}
const rows = await sql.query(`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signal_point_reward_generations' AND column_name='member_rewards_snapshot')
  AND POSITION('member_rewards_snapshot' IN pg_get_functiondef(to_regprocedure('reconcile_signal_point_source_set(text,text,bigint,jsonb,text,jsonb)')))>0
  AND POSITION('member_rewards_snapshot=NULL' IN pg_get_functiondef(to_regprocedure('anonymize_signal_points_member(text,text,text,text)')))>0 AS ready`);
if (rows[0]?.ready !== true) throw new Error('Durable reward snapshot migration is not ready.');
console.log('Durable reward snapshot migration ready.');
