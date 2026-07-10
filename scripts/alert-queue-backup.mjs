#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';

const TABLES = [
  'engine_snapshots',
  'alert_candidates',
  'alert_deliveries',
  'alert_baselines',
  'clerk_alert_metadata_backups',
  'alert_queue_migrations',
];
const connectionString = process.env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED
  || process.env.BOURBON_QUEUE_DATABASE_URL
  || process.env.DATABASE_URL;
if (!connectionString) throw new Error('Missing Bourbon queue database connection.');

const mode = process.argv[2] || 'backup';
const fileArg = process.argv.find((arg) => arg.startsWith('--file='))?.slice('--file='.length);
const apply = process.argv.includes('--apply');
const replace = process.argv.includes('--replace');
const sql = neon(connectionString);

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function checksum(data) {
  return createHash('sha256').update(stableJson(data)).digest('hex');
}

async function columnsFor(table) {
  const rows = await sql.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = $1
    order by ordinal_position
  `, [table]);
  return rows.map((row) => String(row.column_name));
}

if (mode === 'backup') {
  const tables = {};
  for (const table of TABLES) {
    const columns = await columnsFor(table);
    if (!columns.length) throw new Error(`Cannot back up missing alert queue table: ${table}`);
    tables[table] = {
      columns,
      rows: await sql.query(`select * from ${table} order by 1`),
    };
  }
  const payload = {
    contractVersion: 'bourbon-signal-alert-queue-backup-v1',
    createdAt: new Date().toISOString(),
    tables,
  };
  const serializablePayload = JSON.parse(JSON.stringify(payload));
  const envelope = { ...serializablePayload, sha256: checksum(serializablePayload) };
  const defaultFile = path.join(process.cwd(), '.hermes', 'backups', `alert-queue-${payload.createdAt.replace(/[:.]/g, '-')}.json`);
  const outputFile = path.resolve(fileArg || defaultFile);
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(envelope, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({
    ok: true,
    mode,
    file: outputFile,
    sha256: envelope.sha256,
    counts: Object.fromEntries(TABLES.map((table) => [table, tables[table].rows.length])),
  }, null, 2));
} else if (mode === 'verify' || mode === 'restore' || mode === 'restore-test') {
  if (!fileArg) throw new Error(`${mode} requires --file=/absolute/path/to/backup.json`);
  const input = JSON.parse(await readFile(path.resolve(fileArg), 'utf8'));
  const { sha256, ...payload } = input;
  if (payload.contractVersion !== 'bourbon-signal-alert-queue-backup-v1') throw new Error('Unsupported alert queue backup contract.');
  if (checksum(payload) !== sha256) throw new Error('Alert queue backup checksum mismatch.');
  for (const table of TABLES) {
    if (!payload.tables?.[table] || !Array.isArray(payload.tables[table].rows) || !Array.isArray(payload.tables[table].columns)) {
      throw new Error(`Alert queue backup is missing ${table}.`);
    }
  }
  if (mode === 'verify') {
    console.log(JSON.stringify({
      ok: true,
      mode,
      file: path.resolve(fileArg),
      sha256,
      counts: Object.fromEntries(TABLES.map((table) => [table, payload.tables[table].rows.length])),
    }, null, 2));
    process.exit(0);
  }
  if (mode === 'restore-test') {
    const statements = [];
    for (const table of TABLES) {
      const tempTable = `restore_test_${table}`;
      const backupColumns = payload.tables[table].columns;
      const identifiers = backupColumns.map((column) => `"${column.replaceAll('"', '""')}"`).join(', ');
      const overriding = table === 'alert_deliveries' || table === 'alert_baselines' ? ' overriding system value' : '';
      statements.push({ text: `create temporary table ${tempTable} (like ${table} including all) on commit drop`, params: [] });
      statements.push({
        text: `insert into ${tempTable} (${identifiers})${overriding} select ${identifiers} from jsonb_populate_recordset(null::${table}, $1::jsonb)`,
        params: [JSON.stringify(payload.tables[table].rows)],
      });
      statements.push({ text: `select count(*)::integer as count from ${tempTable}`, params: [] });
    }
    const results = await sql.transaction((txn) => statements.map((statement) => txn.query(statement.text, statement.params)));
    const counts = {};
    TABLES.forEach((table, index) => {
      const countResult = results[index * 3 + 2];
      counts[table] = Number(countResult?.[0]?.count || 0);
      if (counts[table] !== payload.tables[table].rows.length) throw new Error(`Restore test count mismatch for ${table}.`);
    });
    console.log(JSON.stringify({ ok: true, mode, file: path.resolve(fileArg), sha256, counts }, null, 2));
    process.exit(0);
  }
  if (!apply || !replace) throw new Error('Restore is destructive and requires both --apply and --replace.');

  const deleteOrder = ['alert_deliveries', 'alert_candidates', 'alert_baselines', 'clerk_alert_metadata_backups', 'engine_snapshots', 'alert_queue_migrations'];
  const restoreOrder = ['engine_snapshots', 'alert_candidates', 'alert_deliveries', 'alert_baselines', 'clerk_alert_metadata_backups', 'alert_queue_migrations'];
  const restoreStatements = [];
  for (const table of restoreOrder) {
    const currentColumns = await columnsFor(table);
    const backupColumns = payload.tables[table].columns;
    if (currentColumns.join('|') !== backupColumns.join('|')) {
      throw new Error(`Refusing restore because ${table} schema differs from the backup.`);
    }
    const identifiers = backupColumns.map((column) => `"${column.replaceAll('"', '""')}"`).join(', ');
    const overriding = table === 'alert_deliveries' || table === 'alert_baselines' ? ' overriding system value' : '';
    restoreStatements.push({
      text: `insert into ${table} (${identifiers})${overriding} select ${identifiers} from jsonb_populate_recordset(null::${table}, $1::jsonb)`,
      params: [JSON.stringify(payload.tables[table].rows)],
    });
  }
  await sql.transaction((txn) => [
    ...deleteOrder.map((table) => txn.query(`delete from ${table}`)),
    ...restoreStatements.map((statement) => txn.query(statement.text, statement.params)),
    txn.query("select setval(pg_get_serial_sequence('alert_deliveries', 'id'), greatest(coalesce((select max(id) from alert_deliveries), 1), 1), exists(select 1 from alert_deliveries))"),
    txn.query("select setval(pg_get_serial_sequence('alert_baselines', 'id'), greatest(coalesce((select max(id) from alert_baselines), 1), 1), exists(select 1 from alert_baselines))"),
  ]);
  const actualCounts = {};
  for (const table of TABLES) {
    const rows = await sql.query(`select count(*)::integer as count from ${table}`);
    actualCounts[table] = Number(rows[0]?.count || 0);
    if (actualCounts[table] !== payload.tables[table].rows.length) throw new Error(`Restore count mismatch for ${table}.`);
  }
  console.log(JSON.stringify({ ok: true, mode, file: path.resolve(fileArg), sha256, counts: actualCounts }, null, 2));
} else {
  throw new Error('Usage: alert-queue-backup.mjs backup [--file=...] | verify --file=... | restore --file=... --apply --replace');
}
