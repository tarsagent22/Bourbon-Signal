#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

const connectionString = process.env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED
  || process.env.BOURBON_QUEUE_DATABASE_URL
  || process.env.DATABASE_URL;
if (!connectionString) throw new Error('Missing Bourbon queue database connection.');

const schema = await readFile(new URL('../src/lib/recommendation-feedback-schema.sql', import.meta.url), 'utf8');
const statements = schema.split(';').map((statement) => statement.trim()).filter(Boolean);
const sql = neon(connectionString);
await sql.transaction((txn) => statements.map((statement) => txn.query(statement)));
const rows = await sql.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('bourbon_recommendation_feedback', 'bourbon_recommendation_feedback_state')
  ORDER BY table_name
`);
if (rows.length !== 2) throw new Error(`Recommendation feedback schema verification failed: ${rows.length}/2 tables.`);
console.log(JSON.stringify({ ok: true, tables: rows.map((row) => row.table_name) }));
