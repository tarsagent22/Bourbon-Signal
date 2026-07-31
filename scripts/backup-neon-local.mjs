#!/usr/bin/env node
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { neon } from '@neondatabase/serverless';

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
  'community_sighting_votes',
  'community_sightings',
  'coverage_request_automation_jobs',
  'coverage_requests',
  'engine_snapshots',
  'member_collection_bottles',
  'member_collection_legacy_backups',
  'member_collection_state',
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
const REQUIRED_TABLES = [
  'bottle_contributions',
  'bourbon_recommendation_feedback',
  'community_sighting_votes',
  'community_sightings',
  'coverage_request_automation_jobs',
  'coverage_requests',
  'member_collection_bottles',
  'member_collection_legacy_backups',
  'member_collection_state',
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
  const missingRequired = REQUIRED_TABLES.filter((table) => !existing.has(table));
  if (missingRequired.length) {
    throw new Error(`Refusing incomplete backup; required tables are missing: ${missingRequired.join(', ')}`);
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
