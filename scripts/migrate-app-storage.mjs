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
  '../src/lib/approved-catalog-schema.sql',
  '../src/lib/welcome-local-preview-schema.sql',
  '../src/lib/founder-shipping-schema.sql',
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
  'approved_catalog_bottles',
  'approved_catalog_locations',
  'welcome_signal_previews',
  'founder_glass_shipping',
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
  approved_catalog_bottles: ['id', 'normalized_name', 'payload', 'approved_by'],
  approved_catalog_locations: ['id', 'normalized_key', 'payload', 'approved_by'],
  welcome_signal_previews: ['user_id', 'payload', 'redeemed_at', 'expires_at'],
  founder_glass_shipping: ['user_id', 'founder_number', 'account_email', 'recipient_name', 'address_line1', 'address_line2', 'city', 'state_code', 'postal_code', 'phone', 'country_code', 'status', 'carrier', 'tracking_number', 'submitted_at', 'updated_at', 'shipped_at', 'updated_by', 'shipment_notification_sent_at', 'shipment_notification_message_id', 'shipment_notification_claimed_at', 'shipment_notification_claim_token', 'shipment_notification_idempotency_key'],
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
  SELECT table_name, column_name, data_type, is_nullable, character_maximum_length, column_default FROM information_schema.columns
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
  'founder_glass_shipping.user_id': ['text', 'NO'],
  'founder_glass_shipping.founder_number': ['integer', 'YES'],
  'founder_glass_shipping.phone': ['text', 'NO'],
  'founder_glass_shipping.country_code': ['character', 'NO'],
  'founder_glass_shipping.status': ['text', 'NO'],
};
const availableDefinitions = new Map(columnRows.map((row) => [
  `${row.table_name}.${row.column_name}`,
  [row.data_type, row.is_nullable],
]));
const invalidDefinitions = Object.entries(criticalColumnDefinitions).flatMap(([column, expectedDefinition]) => {
  const actual = availableDefinitions.get(column);
  return actual && actual[0] === expectedDefinition[0] && actual[1] === expectedDefinition[1] ? [] : [column];
});
const founderColumnDefinitions = {
  user_id: ['text', 'NO', null, null],
  founder_number: ['integer', 'YES', null, null],
  account_email: ['text', 'NO', null, null],
  recipient_name: ['text', 'NO', null, null],
  address_line1: ['text', 'NO', null, null],
  address_line2: ['text', 'YES', null, null],
  city: ['text', 'NO', null, null],
  state_code: ['character', 'NO', 2, null],
  postal_code: ['text', 'NO', null, null],
  country_code: ['character', 'NO', 2, "'US'::bpchar"],
  phone: ['text', 'NO', null, null],
  status: ['text', 'NO', null, "'submitted'::text"],
  carrier: ['text', 'YES', null, null],
  tracking_number: ['text', 'YES', null, null],
  submitted_at: ['timestamp with time zone', 'NO', null, 'now()'],
  updated_at: ['timestamp with time zone', 'NO', null, 'now()'],
  shipped_at: ['timestamp with time zone', 'YES', null, null],
  updated_by: ['text', 'YES', null, null],
  shipment_notification_sent_at: ['timestamp with time zone', 'YES', null, null],
  shipment_notification_message_id: ['text', 'YES', null, null],
  shipment_notification_claimed_at: ['timestamp with time zone', 'YES', null, null],
  shipment_notification_claim_token: ['text', 'YES', null, null],
  shipment_notification_idempotency_key: ['text', 'YES', null, null],
};
const normalizeDefault = (value) => value === null || value === undefined ? null : String(value).replace(/\s+/g, '');
const invalidFounderColumns = Object.entries(founderColumnDefinitions).flatMap(([column, definition]) => {
  const actual = columnRows.find((row) => row.table_name === 'founder_glass_shipping' && row.column_name === column);
  const [dataType, nullable, maximumLength, defaultValue] = definition;
  return actual
    && actual.data_type === dataType
    && actual.is_nullable === nullable
    && (actual.character_maximum_length === null ? null : Number(actual.character_maximum_length)) === maximumLength
    && normalizeDefault(actual.column_default) === defaultValue
    ? []
    : [column];
});
const expectedIndexes = [
  'approved_catalog_bottles_updated_idx',
  'approved_catalog_locations_updated_idx',
  'welcome_signal_previews_expires_idx',
  'founder_glass_shipping_founder_number_idx',
  'founder_glass_shipping_status_idx',
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
const normalizeCatalogColumns = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !/^\{.*\}$/.test(value)) return [];
  const body = value.slice(1, -1);
  return body ? body.split(',') : [];
};
const expectedFounderIndexes = {
  founder_glass_shipping_founder_number_idx: { unique: true, columns: ['founder_number'] },
  founder_glass_shipping_status_idx: { unique: false, columns: ['status', 'founder_number'] },
};
const founderIndexRows = await sql.query(`
  SELECT i.relname AS indexname, t.relname AS table_name, x.indisunique, x.indisvalid,
    (x.indpred IS NOT NULL) AS has_predicate,
    (x.indexprs IS NOT NULL) AS has_expressions,
    x.indnatts, x.indnkeyatts,
    ARRAY(
      SELECT a.attname
      FROM unnest(x.indkey) WITH ORDINALITY AS key(attnum, position)
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = key.attnum
      ORDER BY key.position
    ) AS columns
  FROM pg_index x
  JOIN pg_class i ON i.oid = x.indexrelid
  JOIN pg_class t ON t.oid = x.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public' AND i.relname = ANY($1::text[])
`, [Object.keys(expectedFounderIndexes)]);
const invalidFounderIndexes = Object.entries(expectedFounderIndexes).flatMap(([index, expectedDefinition]) => {
  const actual = founderIndexRows.find((row) => row.indexname === index);
  const columns = normalizeCatalogColumns(actual?.columns);
  return actual
    && actual.table_name === 'founder_glass_shipping'
    && actual.indisunique === expectedDefinition.unique
    && actual.indisvalid === true
    && actual.has_predicate === false
    && actual.has_expressions === false
    && Number(actual.indnatts) === expectedDefinition.columns.length
    && Number(actual.indnkeyatts) === expectedDefinition.columns.length
    && columns.length === expectedDefinition.columns.length
    && columns.every((column, position) => column === expectedDefinition.columns[position])
    ? []
    : [index];
});
const expectedConstraints = [
  'community_sighting_votes_pkey',
  'community_sighting_votes_sighting_id_fkey',
  'member_collection_state_pkey',
  'member_collection_bottles_pkey',
  'member_collection_bottles_user_id_fkey',
  'member_collection_legacy_backups_pkey',
  'founder_glass_shipping_pkey',
  'founder_glass_shipping_founder_number_positive',
  'founder_glass_shipping_country_us',
  'founder_glass_shipping_status_valid',
  'retailer_submissions_store_id_fkey',
];
const constraintRows = await sql.query(`
  SELECT c.conname, t.relname AS table_name, c.contype, pg_get_constraintdef(c.oid) AS definition,
    ARRAY(
      SELECT a.attname
      FROM unnest(c.conkey) WITH ORDINALITY AS key(attnum, position)
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = key.attnum
      ORDER BY key.position
    ) AS columns
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public' AND c.conname = ANY($1::text[])
`, [expectedConstraints]);
const availableConstraints = new Set(constraintRows.map((row) => row.conname));
const missingConstraints = expectedConstraints.filter((constraint) => !availableConstraints.has(constraint));
const expectedFounderConstraintDefinitions = {
  founder_glass_shipping_founder_number_positive: 'CHECK(((founder_numberISNULL)OR(founder_number>0)))',
  founder_glass_shipping_country_us: "CHECK((country_code='US'::bpchar))",
  founder_glass_shipping_status_valid: "CHECK((status=ANY(ARRAY['submitted'::text,'confirmed'::text,'packed'::text,'shipped'::text])))",
};
const normalizeConstraintDefinition = (value) => String(value || '').replace(/\s+/g, '');
const founderPrimaryKey = constraintRows.find((row) => row.conname === 'founder_glass_shipping_pkey' && row.table_name === 'founder_glass_shipping');
const founderPrimaryKeyColumns = normalizeCatalogColumns(founderPrimaryKey?.columns);
const invalidFounderPrimaryKey = founderPrimaryKey
  && founderPrimaryKey.contype === 'p'
  && founderPrimaryKeyColumns.length === 1
  && founderPrimaryKeyColumns[0] === 'user_id'
  ? []
  : ['founder_glass_shipping_pkey'];
const invalidFounderConstraints = Object.entries(expectedFounderConstraintDefinitions).flatMap(([constraint, expectedDefinition]) => {
  const actual = constraintRows.find((row) => row.conname === constraint && row.table_name === 'founder_glass_shipping');
  return actual
    && actual.table_name === 'founder_glass_shipping'
    && actual.contype === 'c'
    && normalizeConstraintDefinition(actual.definition) === expectedDefinition
    ? []
    : [constraint];
});
const schemaProblems = [
  ...missing.map((table) => `table:${table}`),
  ...missingColumns.map((column) => `column:${column}`),
  ...invalidDefinitions.map((column) => `definition:${column}`),
  ...invalidFounderColumns.map((column) => `founder-column-definition:${column}`),
  ...missingIndexes.map((index) => `index:${index}`),
  ...invalidFounderIndexes.map((index) => `index-definition:${index}`),
  ...missingConstraints.map((constraint) => `constraint:${constraint}`),
  ...invalidFounderPrimaryKey.map((constraint) => `primary-key-definition:${constraint}`),
  ...invalidFounderConstraints.map((constraint) => `constraint-definition:${constraint}`),
];
if (schemaProblems.length) {
  throw new Error(`Application storage schema is incomplete: ${schemaProblems.join(', ')}. Run npm run migrate:app-storage:apply.`);
}
console.log(JSON.stringify({ ok: true, mode: apply ? 'apply' : 'check', tables: [...found], indexes: [...availableIndexes] }));

export { splitSql };
