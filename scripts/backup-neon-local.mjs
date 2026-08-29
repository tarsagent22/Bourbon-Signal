#!/usr/bin/env node
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { neon } from '@neondatabase/serverless';

const SIGNAL_POINT_TABLES = [
  'member_referral_scale_migrations',
  'signal_point_accounts',
  'signal_point_reward_generations',
  'signal_point_source_balances',
  'signal_point_ledger',
  'signal_point_migrations',
  'signal_reward_catalog',
  'signal_reward_redemptions',
  'signal_reward_redemption_events',
  'signal_reward_fulfillments',
];
const SIGNAL_POINT_REQUIRED_COLUMNS = {
  member_referral_scale_migrations: ['migration_key', 'completed_at'],
  signal_point_accounts: ['user_id', 'balance', 'debt', 'created_at', 'updated_at'],
  signal_point_reward_generations: ['user_id', 'generation', 'reconciled_generation', 'updated_at'],
  signal_point_source_balances: ['user_id', 'source_key', 'points', 'revision', 'updated_at'],
  signal_point_ledger: ['id', 'user_id', 'idempotency_key', 'entry_kind', 'points', 'balance_delta', 'debt_delta', 'source_type', 'source_key', 'redemption_id', 'metadata', 'created_at'],
  signal_point_migrations: ['migration_key', 'completed_at', 'details'],
  signal_reward_catalog: ['item_key', 'catalog_version', 'name', 'points_cost', 'fulfillment_type', 'inventory_remaining', 'option_snapshot', 'active', 'created_at', 'updated_at'],
  signal_reward_redemptions: ['id', 'user_id', 'idempotency_key', 'item_key', 'catalog_version', 'item_snapshot', 'details', 'points_spent', 'status', 'account_email', 'created_at', 'updated_at', 'canceled_at'],
  signal_reward_redemption_events: ['id', 'redemption_id', 'from_status', 'to_status', 'actor_id', 'actor_role', 'metadata', 'created_at'],
  signal_reward_fulfillments: ['redemption_id', 'fulfillment_type', 'shipping_profile_user_id', 'shipping_address', 'owner_notes', 'carrier', 'tracking_number', 'created_at', 'updated_at'],
};
const SIGNAL_POINT_REQUIRED_CONSTRAINTS = [
  'member_referral_scale_migrations_pkey',
  'signal_point_accounts_pkey',
  'signal_point_accounts_balance_nonnegative',
  'signal_point_accounts_debt_nonnegative',
  'signal_point_reward_generations_pkey',
  'signal_point_reward_generation_nonnegative',
  'signal_point_reward_reconciled_generation_valid',
  'signal_point_source_balances_pkey',
  'signal_point_source_balances_user_id_fkey',
  'signal_point_source_balance_nonnegative',
  'signal_point_source_balance_revision_nonnegative',
  'signal_point_ledger_pkey',
  'signal_point_ledger_user_id_fkey',
  'signal_point_ledger_redemption_id_fkey',
  'signal_point_ledger_user_id_idempotency_key_key',
  'signal_point_ledger_kind_valid',
  'signal_point_ledger_points_nonzero',
  'signal_point_ledger_sign_matches_kind',
  'signal_point_ledger_economic_balance',
  'signal_point_migrations_pkey',
  'signal_reward_catalog_pkey',
  'signal_reward_catalog_version_positive',
  'signal_reward_catalog_cost_positive',
  'signal_reward_catalog_fulfillment_valid',
  'signal_reward_catalog_inventory_nonnegative',
  'signal_reward_redemptions_pkey',
  'signal_reward_redemptions_user_id_fkey',
  'signal_reward_redemptions_item_key_fkey',
  'signal_reward_redemptions_user_id_idempotency_key_key',
  'signal_reward_redemption_points_positive',
  'signal_reward_redemption_status_valid',
  'signal_reward_redemption_events_pkey',
  'signal_reward_redemption_events_redemption_id_fkey',
  'signal_reward_event_actor_role_valid',
  'signal_reward_fulfillments_pkey',
  'signal_reward_fulfillments_redemption_id_fkey',
  'signal_reward_fulfillment_type_valid',
  'signal_reward_fulfillment_shipping_snapshot_valid',
  'signal_reward_fulfillment_tracking_pair',
];
const SIGNAL_POINT_REQUIRED_CONSTRAINT_SHAPES = {
  signal_point_ledger_sign_matches_kind: [
    "entry_kind=anyarray'credit','migration_credit','cancellation_credit'", 'points>0', 'balance_delta>=0', 'debt_delta<=0',
    "entry_kind=anyarray'debit','migration_debit','redemption_debit'", 'points<0', 'balance_delta<=0', 'debt_delta>=0',
  ],
  signal_point_ledger_economic_balance: ['points=balance_delta-debt_delta'],
  signal_point_reward_generation_nonnegative: ['generation>=0'],
  signal_point_reward_reconciled_generation_valid: ["reconciled_generation>='-1'"],
  signal_reward_fulfillment_shipping_snapshot_valid: ["fulfillment_type='digital'", 'shipping_addressisnull', "fulfillment_type='physical'", "jsonb_typeofshipping_address='object'"],
  signal_reward_fulfillment_tracking_pair: ['carrierisnull', 'tracking_numberisnull', 'carrierisnotnull', 'tracking_numberisnotnull'],
};
const SIGNAL_POINT_REQUIRED_TRIGGERS = {
  signal_point_ledger_append_only: ['before', 'update', 'delete', 'signal_point_ledger', 'reject_signal_point_ledger_mutation'],
  signal_reward_fulfillments_immutable_snapshot: ['before update', 'signal_reward_fulfillments', 'reject_signal_reward_fulfillment_snapshot_mutation'],
};
const TABLES = [
  'alert_baselines',
  'alert_candidates',
  'alert_deliveries',
  'alert_lifecycle_migrations',
  'alert_lifecycle_states',
  'alert_queue_migrations',
  'bottle_contributions',
  'bourbon_recommendation_feedback',
  'bourbon_recommendation_feedback_state',
  'clerk_alert_metadata_backups',
  'community_contributor_moderation',
  'community_sighting_idempotency',
  'community_sighting_alert_authority',
  'community_sighting_votes',
  'community_sightings',
  'coverage_request_automation_jobs',
  'coverage_requests',
  'engine_snapshots',
  'founder_glass_shipping',
  'hunt_outcomes',
  'gift_orders',
  'gift_order_events',
  'founder_spot_reservations',
  'founder_reconciliation_state',
  'gift_redemption_recipients',
  'gift_recipient_locks',
  'gift_payment_attempts',
  'direct_founder_checkout_reservations',
  'direct_founder_checkout_events',
  'member_collection_bottles',
  'member_collection_legacy_backups',
  'member_collection_state',
  'member_referral_codes',
  'member_referral_eligibility_events',
  'member_referral_glass_rewards',
  'member_referral_point_ledger',
  'member_referrals',
  ...SIGNAL_POINT_TABLES,
  'retailer_acquisition_migrations',
  'retailer_applications',
  'retailer_prospect_approval_packets',
  'retailer_prospect_contact_evidence',
  'retailer_prospect_message_versions',
  'retailer_prospect_outreach',
  'retailer_prospects',
  'retailer_regulator_authorities',
  'retailer_stores',
  'retailer_submissions',
];
const GIFT_TABLES = [
  'gift_orders',
  'gift_order_events',
  'founder_spot_reservations',
  'founder_reconciliation_state',
  'gift_redemption_recipients',
  'gift_recipient_locks',
  'gift_payment_attempts',
  'direct_founder_checkout_reservations',
  'direct_founder_checkout_events',
];
const REQUIRED_TABLES = [
  'bottle_contributions',
  'bourbon_recommendation_feedback',
  'community_contributor_moderation',
  'community_sighting_alert_authority',
  'community_sighting_votes',
  'community_sightings',
  'coverage_request_automation_jobs',
  'coverage_requests',
  'founder_glass_shipping',
  'hunt_outcomes',
  'member_collection_bottles',
  'member_collection_legacy_backups',
  'member_collection_state',
  'member_referral_codes',
  'member_referral_eligibility_events',
  'member_referral_glass_rewards',
  'member_referral_point_ledger',
  'member_referrals',
  'retailer_applications',
  'retailer_stores',
  'retailer_submissions',
];
const configuredRetention = Number(process.env.BOURBON_LOCAL_BACKUP_RETENTION || 30);
const retention = Number.isInteger(configuredRetention) && configuredRetention > 0
  ? Math.max(7, Math.min(180, configuredRetention))
  : 30;
const backupDirectory = path.resolve(process.env.BOURBON_LOCAL_BACKUP_DIR || path.join(homedir(), 'BourbonSignalBackups'));
const keyDirectory = path.resolve(process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local'), 'BourbonSignal');
const protectedKeyPath = path.join(keyDirectory, 'backup-key.dpapi');

function runDpapi(operation, input) {
  const method = operation === 'protect' ? 'Protect' : 'Unprotect';
  const script = `Add-Type -AssemblyName System.Security; $raw=[Console]::In.ReadToEnd(); $bytes=[Convert]::FromBase64String($raw); $result=[Security.Cryptography.ProtectedData]::${method}($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    input,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0 || !result.stdout.trim()) throw new Error(`Windows DPAPI ${operation} failed.`);
  return result.stdout.trim();
}

async function loadEncryptionKey() {
  const configured = process.env.BOURBON_LOCAL_BACKUP_KEY;
  if (configured) {
    const key = Buffer.from(configured, 'base64');
    if (key.length !== 32) throw new Error('BOURBON_LOCAL_BACKUP_KEY must be a base64-encoded 32-byte key.');
    return key;
  }
  if (process.platform !== 'win32') throw new Error('Set BOURBON_LOCAL_BACKUP_KEY outside Windows.');
  await mkdir(keyDirectory, { recursive: true });
  try {
    const protectedKey = (await readFile(protectedKeyPath, 'utf8')).trim();
    const key = Buffer.from(runDpapi('unprotect', protectedKey), 'base64');
    if (key.length !== 32) throw new Error('Invalid local backup key.');
    return key;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    const key = randomBytes(32);
    const protectedKey = runDpapi('protect', key.toString('base64'));
    await writeFile(protectedKeyPath, `${protectedKey}\n`, { mode: 0o600, flag: 'wx' });
    return key;
  }
}

function encryptPayload(payload, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const compressed = gzipSync(Buffer.from(JSON.stringify(payload)));
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  return {
    schemaVersion: 1,
    algorithm: 'aes-256-gcm',
    compression: 'gzip',
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

function decryptPayload(envelope, key) {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
  const compressed = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(gunzipSync(compressed).toString('utf8'));
}

async function main() {
  const connectionString = process.env.BOURBON_QUEUE_DATABASE_URL
    || process.env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED
    || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Missing durable application database connection.');
  const sql = neon(connectionString);
  const existingRows = await sql.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
  `, [TABLES]);
  const existing = new Set(existingRows.map((row) => row.table_name));
  // A safety backup must be possible before the gift migration creates its first table. Once any
  // gift table exists, treat the migration as started and require the complete post-migration set.
  const giftRequiredForObservedSchema = GIFT_TABLES.some((table) => existing.has(table))
    ? [...REQUIRED_TABLES, ...GIFT_TABLES]
    : REQUIRED_TABLES;
  // Signal Points tables are optional for a pre-migration safety backup. Once any appears,
  // a post-migration backup requires the complete unified ledger and rewards set.
  const requiredForObservedSchema = SIGNAL_POINT_TABLES.some((table) => existing.has(table))
    ? [...giftRequiredForObservedSchema, ...SIGNAL_POINT_TABLES]
    : giftRequiredForObservedSchema;
  const missingRequired = requiredForObservedSchema.filter((table) => !existing.has(table));
  if (missingRequired.length) {
    throw new Error(`Refusing incomplete backup; required tables are missing: ${missingRequired.join(', ')}`);
  }
  if (SIGNAL_POINT_TABLES.some((table) => existing.has(table))) {
    const [columnRows, constraintRows, triggerRows] = await Promise.all([
      sql.query(`SELECT table_name,column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name=ANY($1::text[])`, [SIGNAL_POINT_TABLES]),
      sql.query(`SELECT constraint_row.conname,pg_get_constraintdef(constraint_row.oid) AS definition FROM pg_constraint constraint_row
        JOIN pg_class table_row ON table_row.oid=constraint_row.conrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid=table_row.relnamespace
        WHERE namespace_row.nspname='public' AND table_row.relname=ANY($1::text[])`, [SIGNAL_POINT_TABLES]),
      sql.query(`SELECT trigger_row.tgname,pg_get_triggerdef(trigger_row.oid) AS definition FROM pg_trigger trigger_row
        JOIN pg_class table_row ON table_row.oid=trigger_row.tgrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid=table_row.relnamespace
        WHERE namespace_row.nspname='public' AND table_row.relname=ANY($1::text[]) AND NOT trigger_row.tgisinternal`, [SIGNAL_POINT_TABLES]),
    ]);
    const observedColumns = new Set(columnRows.map((row) => `${row.table_name}.${row.column_name}`));
    const missingColumns = Object.entries(SIGNAL_POINT_REQUIRED_COLUMNS).flatMap(([table, columns]) =>
      columns.filter((column) => !observedColumns.has(`${table}.${column}`)).map((column) => `${table}.${column}`));
    const observedConstraints = new Set(constraintRows.map((row) => row.conname));
    const missingConstraints = SIGNAL_POINT_REQUIRED_CONSTRAINTS.filter((constraint) => !observedConstraints.has(constraint));
    const normalizeDefinition = (value) => String(value || '').replace(/\s+|::text|::bpchar|\(|\)|\[|\]/g, '').toLowerCase();
    const invalidConstraintShapes = Object.entries(SIGNAL_POINT_REQUIRED_CONSTRAINT_SHAPES).flatMap(([name, fragments]) => {
      const row = constraintRows.find((constraint) => constraint.conname === name);
      const definition = normalizeDefinition(row?.definition);
      return row && fragments.every((fragment) => definition.includes(normalizeDefinition(fragment))) ? [] : [name];
    });
    const invalidTriggers = Object.entries(SIGNAL_POINT_REQUIRED_TRIGGERS).flatMap(([name, fragments]) => {
      const row = triggerRows.find((trigger) => trigger.tgname === name);
      const definition = String(row?.definition || '').replace(/\s+/g, ' ').toLowerCase();
      return row && fragments.every((fragment) => definition.includes(fragment)) ? [] : [name];
    });
    if (missingColumns.length || missingConstraints.length || invalidConstraintShapes.length || invalidTriggers.length) {
      throw new Error(`Refusing incomplete Signal Points backup; missing columns: ${missingColumns.join(', ') || 'none'}; missing constraints: ${missingConstraints.join(', ') || 'none'}; invalid constraint shapes: ${invalidConstraintShapes.join(', ') || 'none'}; invalid triggers: ${invalidTriggers.join(', ') || 'none'}`);
    }
  }
  const selectedTables = TABLES.filter((table) => existing.has(table));
  const snapshot = await sql.transaction((transaction) => selectedTables.flatMap((table) => [
    transaction.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [table]),
    transaction.query(`SELECT to_jsonb(source_row) AS row FROM "${table}" AS source_row`),
  ]), { isolationLevel: 'RepeatableRead', readOnly: true });
  const tables = {};
  selectedTables.forEach((table, index) => {
    const columns = snapshot[index * 2];
    const rows = snapshot[(index * 2) + 1];
    tables[table] = { columns: columns.map((row) => row.column_name), rows: rows.map((row) => row.row) };
  });
  const payload = { schemaVersion: 1, generatedAt: new Date().toISOString(), tables };
  const key = await loadEncryptionKey();
  const envelope = encryptPayload(payload, key);
  await mkdir(backupDirectory, { recursive: true });
  const stamp = payload.generatedAt.replace(/[:.]/g, '-');
  const file = path.join(backupDirectory, `bourbon-signal-neon-${stamp}.bsbackup`);
  const temporaryFile = `${file}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(envelope)}\n`, { mode: 0o600, flag: 'wx' });
  const persistedEnvelope = JSON.parse(await readFile(temporaryFile, 'utf8'));
  const verified = decryptPayload(persistedEnvelope, key);
  if (verified.generatedAt !== payload.generatedAt || Object.keys(verified.tables).length !== Object.keys(tables).length) {
    await unlink(temporaryFile).catch(() => undefined);
    throw new Error('Persisted encrypted backup verification failed.');
  }
  await rename(temporaryFile, file);

  const files = (await readdir(backupDirectory))
    .filter((name) => /^bourbon-signal-neon-.*\.bsbackup$/.test(name))
    .sort()
    .reverse();
  for (const stale of files.slice(retention)) await unlink(path.join(backupDirectory, stale));
  const counts = Object.fromEntries(Object.entries(tables).map(([name, value]) => [name, value.rows.length]));
  console.log(JSON.stringify({ ok: true, encrypted: true, verified: true, file, retention, counts }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

export { decryptPayload, encryptPayload, loadEncryptionKey };
