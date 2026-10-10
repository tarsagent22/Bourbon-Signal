import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
const connection = process.env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED || process.env.BOURBON_QUEUE_DATABASE_URL || process.env.DATABASE_URL;
if (!connection) throw Error('Durable app database is not configured.');
const sql = neon(connection);
if (process.argv.includes('--apply')) await sql.query(await readFile(new URL('../src/lib/bottle-mutes-schema.sql', import.meta.url), 'utf8'));
const rows = await sql.query("SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='member_bottle_mutes'");
for (const [name, type] of [['user_id','text'],['bottles','jsonb'],['version','bigint'],['updated_at','timestamp with time zone']]) if (!rows.some(row => row.column_name === name && row.data_type === type && row.is_nullable === 'NO')) throw Error('Missing or invalid mute column: '+name);
console.log(JSON.stringify({ verified: true, mode: process.argv.includes('--apply') ? 'apply' : 'check', table: 'member_bottle_mutes' }));
