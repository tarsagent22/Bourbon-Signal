#!/usr/bin/env node
import { createClerkClient } from '@clerk/backend';
import { neon } from '@neondatabase/serverless';
import { extractClerkAlertBaselines } from '../src/lib/alert-queue/clerk-migration.ts';

const connectionString = process.env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED
  || process.env.BOURBON_QUEUE_DATABASE_URL
  || process.env.DATABASE_URL;
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
if (!connectionString) throw new Error('Missing Bourbon queue database connection.');
if (!clerkSecretKey) throw new Error('Missing CLERK_SECRET_KEY.');

const apply = process.argv.includes('--apply');
const rollback = process.argv.includes('--rollback');
if (apply && rollback) throw new Error('Choose either --apply or --rollback.');
const idArg = process.argv.find((arg) => arg.startsWith('--migration-id='));
const migrationId = idArg?.slice('--migration-id='.length) || 'clerk-alert-state-v1';
const now = new Date().toISOString();
const sql = neon(connectionString);
const clerk = createClerkClient({ secretKey: clerkSecretKey });

if (rollback) {
  const removed = await sql.query(
    'delete from alert_baselines where migration_id = $1 returning id',
    [migrationId],
  );
  console.log(JSON.stringify({ ok: true, rollback: true, migrationId, baselinesRemoved: removed.length, clerkModified: false }, null, 2));
  process.exit(0);
}

let offset = 0;
let usersScanned = 0;
const sourceKeys = new Set();
const pages = [];
while (true) {
  const page = await clerk.users.getUserList({ limit: 100, offset });
  if (!page.data.length) break;
  const normalized = page.data.map((user) => {
    const privateMetadata = user.privateMetadata || {};
    const baselines = extractClerkAlertBaselines(user.id, privateMetadata, now);
    for (const baseline of baselines) {
      sourceKeys.add(`${baseline.userId}\u001f${baseline.channel}\u001f${baseline.stableMatchKey}`);
    }
    return {
      userId: user.id,
      alertDelivery: privateMetadata.alertDelivery || {},
      alertInbox: privateMetadata.alertInbox || {},
      baselines,
    };
  });
  pages.push(normalized);
  usersScanned += normalized.length;
  offset += page.data.length;
  if (!page.totalCount || offset >= page.totalCount) break;
}

if (!apply) {
  console.log(JSON.stringify({
    ok: true,
    dryRun: true,
    migrationId,
    usersScanned,
    uniqueBaselinesFound: sourceKeys.size,
    clerkModified: false,
    databaseModified: false,
  }, null, 2));
  process.exit(0);
}

for (const page of pages) {
  await sql.transaction((txn) => page.flatMap((user) => [
    txn.query(`
      insert into clerk_alert_metadata_backups (
        migration_id, user_id, alert_delivery, alert_inbox, backed_up_at
      ) values ($1, $2, $3::jsonb, $4::jsonb, $5::timestamptz)
      on conflict (migration_id, user_id) do nothing
    `, [migrationId, user.userId, JSON.stringify(user.alertDelivery), JSON.stringify(user.alertInbox), now]),
    ...user.baselines.map((baseline) => txn.query(`
      insert into alert_baselines (
        user_id, channel, stable_match_key, created_at, reason, migration_id
      ) values ($1, $2, $3, $4::timestamptz, 'clerk_metadata_migration', $5)
      on conflict (user_id, channel, stable_match_key) do nothing
    `, [baseline.userId, baseline.channel, baseline.stableMatchKey, baseline.createdAt, migrationId])),
  ]));
}

const allBaselines = await sql.query('select user_id, channel, stable_match_key from alert_baselines');
const databaseKeys = new Set(allBaselines.map((row) => `${row.user_id}\u001f${row.channel}\u001f${row.stable_match_key}`));
const missing = Array.from(sourceKeys).filter((key) => !databaseKeys.has(key));
const backupRows = await sql.query(
  'select count(*)::int as count from clerk_alert_metadata_backups where migration_id = $1',
  [migrationId],
);
const backupCount = Number(backupRows[0]?.count || 0);
if (missing.length || backupCount !== usersScanned) {
  throw new Error(`Clerk alert migration reconciliation failed: ${missing.length} missing baselines; ${backupCount}/${usersScanned} backups.`);
}

console.log(JSON.stringify({
  ok: true,
  dryRun: false,
  migrationId,
  usersScanned,
  uniqueBaselinesFound: sourceKeys.size,
  missingBaselines: missing.length,
  backupCount,
  clerkModified: false,
  rollbackCommand: `node --experimental-strip-types scripts/migrate-clerk-alert-state.mts --rollback --migration-id=${migrationId}`,
}, null, 2));
