#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

const apply = process.argv.includes('--apply');
const check = process.argv.includes('--check') || !apply;
if (apply && process.argv.includes('--check')) throw new Error('Choose either --check or --apply.');
const connectionString = process.env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED
  || process.env.BOURBON_QUEUE_DATABASE_URL
  || process.env.DATABASE_URL;
if (!connectionString) throw new Error('Missing durable application database connection.');

function splitSql(source) {
  const statements = [];
  let current = '';
  let quote = null;
  let dollarTag = null;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (!quote && !dollarTag && (char === '$')) {
      const match = source.slice(index).match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        dollarTag = match[0];
        current += dollarTag;
        index += dollarTag.length - 1;
        continue;
      }
    } else if (dollarTag && source.startsWith(dollarTag, index)) {
      current += dollarTag;
      index += dollarTag.length - 1;
      dollarTag = null;
      continue;
    }
    if (!dollarTag && (char === "'" || char === '"')) {
      if (quote === char && next === char) {
        current += char + next;
        index += 1;
        continue;
      }
      if (!quote) quote = char;
      else if (quote === char) quote = null;
    }
    if (char === ';' && !quote && !dollarTag) {
      if (current.trim()) statements.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

const schemaFiles = [
  '../src/lib/member-collection-schema.sql',
  '../src/lib/bottle-contribution-schema.sql',
  '../src/lib/community-sightings-schema.sql',
  '../src/lib/retailer-schema.sql',
];
const sql = neon(connectionString);
if (apply) {
  const statements = [];
  for (const relative of schemaFiles) {
    const schema = await readFile(new URL(relative, import.meta.url), 'utf8');
    statements.push(...splitSql(schema));
  }
  await sql.transaction(
    (transaction) => statements.map((statement) => transaction.query(statement)),
    { isolationLevel: 'Serializable' },
  );
}
if (check) {
  // --check is intentionally read-only.
}

const expected = [
  'bottle_contributions',
  'community_sighting_votes',
  'community_sightings',
  'member_collection_bottles',
  'member_collection_legacy_backups',
  'member_collection_state',
  'retailer_applications',
  'retailer_stores',
  'retailer_submissions',
];
const rows = await sql.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = ANY($1::text[])
  ORDER BY table_name
`, [expected]);
const found = new Set(rows.map((row) => row.table_name));
const missing = expected.filter((table) => !found.has(table));
const requiredColumns = {
  bottle_contributions: ['id', 'status', 'payload'],
  community_sighting_votes: ['sighting_id', 'user_id', 'kind'],
  community_sightings: ['id', 'reporter_user_id', 'payload'],
  member_collection_bottles: ['user_id', 'canonical_key', 'rating', 'payload'],
  member_collection_legacy_backups: ['user_id', 'payload'],
  member_collection_state: ['user_id', 'version', 'legacy_migrated_at'],
  retailer_applications: ['user_id', 'terms_accepted_at', 'decision_notified_status'],
  retailer_stores: ['id', 'user_id', 'status'],
  retailer_submissions: ['id', 'user_id', 'store_id', 'status', 'payload'],
};
const columnRows = await sql.query(`
  SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = ANY($1::text[])
`, [expected]);
const availableColumns = new Set(columnRows.map((row) => `${row.table_name}.${row.column_name}`));
const missingColumns = Object.entries(requiredColumns).flatMap(([table, columns]) =>
  columns.filter((column) => !availableColumns.has(`${table}.${column}`)).map((column) => `${table}.${column}`));
const criticalColumnDefinitions = {
  'member_collection_state.user_id': ['text', 'NO'],
  'member_collection_state.version': ['bigint', 'NO'],
  'member_collection_state.updated_at': ['timestamp with time zone', 'NO'],
  'member_collection_bottles.user_id': ['text', 'NO'],
  'member_collection_bottles.canonical_key': ['text', 'NO'],
  'member_collection_bottles.rating': ['integer', 'NO'],
  'member_collection_bottles.payload': ['jsonb', 'NO'],
  'member_collection_bottles.updated_at': ['timestamp with time zone', 'NO'],
  'member_collection_legacy_backups.user_id': ['text', 'NO'],
  'member_collection_legacy_backups.payload': ['jsonb', 'NO'],
};
const availableDefinitions = new Map(columnRows.map((row) => [
  `${row.table_name}.${row.column_name}`,
  [row.data_type, row.is_nullable],
]));
const invalidDefinitions = Object.entries(criticalColumnDefinitions).flatMap(([column, expectedDefinition]) => {
  const actual = availableDefinitions.get(column);
  return actual && actual[0] === expectedDefinition[0] && actual[1] === expectedDefinition[1] ? [] : [column];
});
const expectedIndexes = [
  'bottle_contributions_updated_idx',
  'community_sightings_created_idx',
  'community_sighting_votes_sighting_idx',
  'member_collection_bottles_canonical_rating_idx',
  'member_collection_bottles_user_updated_idx',
  'retailer_applications_status_idx',
  'retailer_stores_user_status_idx',
  'retailer_submissions_status_created_idx',
  'retailer_submissions_store_created_idx',
];
const indexRows = await sql.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1::text[])`, [expectedIndexes]);
const availableIndexes = new Set(indexRows.map((row) => row.indexname));
const missingIndexes = expectedIndexes.filter((index) => !availableIndexes.has(index));
const expectedConstraints = [
  'community_sighting_votes_pkey',
  'community_sighting_votes_sighting_id_fkey',
  'member_collection_state_pkey',
  'member_collection_bottles_pkey',
  'member_collection_bottles_user_id_fkey',
  'member_collection_legacy_backups_pkey',
  'retailer_submissions_store_id_fkey',
];
const constraintRows = await sql.query(`
  SELECT conname FROM pg_constraint
  WHERE connamespace = 'public'::regnamespace AND conname = ANY($1::text[])
`, [expectedConstraints]);
const availableConstraints = new Set(constraintRows.map((row) => row.conname));
const missingConstraints = expectedConstraints.filter((constraint) => !availableConstraints.has(constraint));
const schemaProblems = [
  ...missing.map((table) => `table:${table}`),
  ...missingColumns.map((column) => `column:${column}`),
  ...invalidDefinitions.map((column) => `definition:${column}`),
  ...missingIndexes.map((index) => `index:${index}`),
  ...missingConstraints.map((constraint) => `constraint:${constraint}`),
];
if (schemaProblems.length) {
  throw new Error(`Application storage schema is incomplete: ${schemaProblems.join(', ')}. Run npm run migrate:app-storage:apply.`);
}
console.log(JSON.stringify({ ok: true, mode: apply ? 'apply' : 'check', tables: [...found], indexes: [...availableIndexes] }));

export { splitSql };
