#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { createClerkClient } from "@clerk/backend";
import { neon } from "@neondatabase/serverless";
import * as repairModule from "../src/lib/alert-queue/clerk-alert-repair.ts";
import * as metadataModule from "../src/lib/alert-queue/clerk-alert-metadata.ts";
import * as runtimeModule from "../src/lib/alert-queue/runtime.ts";
import * as migrationModule from "../src/lib/alert-queue/clerk-migration.ts";

const {
  buildClerkAlertMetadataRepair,
  CLERK_METADATA_REPAIR_THRESHOLD_BYTES,
  metadataHash,
  publicRepairMatchesPlan,
  repairRollbackIsSafe,
} = ((repairModule as { default?: unknown }).default || repairModule) as typeof import("../src/lib/alert-queue/clerk-alert-repair.ts");
const {
  CLERK_ALERT_DELIVERY_TARGET_BYTES,
  jsonUtf8Bytes,
} = ((metadataModule as { default?: unknown }).default || metadataModule) as typeof import("../src/lib/alert-queue/clerk-alert-metadata.ts");
const { createProductionAlertQueueRepository } = ((runtimeModule as { default?: unknown }).default || runtimeModule) as typeof import("../src/lib/alert-queue/runtime.ts");
const { extractClerkAlertBaselines } = ((migrationModule as { default?: unknown }).default || migrationModule) as typeof import("../src/lib/alert-queue/clerk-migration.ts");

const modes = ["--apply", "--verify", "--rollback"].filter((flag) => process.argv.includes(flag));
if (modes.length > 1) throw new Error("Choose only one of --apply, --verify, or --rollback.");
const mode = modes[0]?.slice(2) || "plan";
const value = (name: string) => process.argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1) || "";
const expectedManifestHash = value("--expected-manifest-hash");
const limit = Number(value("--limit") || "0");
if (!Number.isInteger(limit) || limit < 0 || limit > 100) throw new Error("--limit must be an integer from 0 to 100.");
if (mode !== "plan" && !/^[0-9a-f]{64}$/.test(expectedManifestHash)) {
  throw new Error(`${mode} requires --expected-manifest-hash=<64 hex characters> from a fresh plan.`);
}

const clerkSecretKey = process.env.CLERK_SECRET_KEY?.trim();
const connectionString = process.env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED
  || process.env.BOURBON_QUEUE_DATABASE_URL
  || process.env.DATABASE_URL;
if (!clerkSecretKey) throw new Error("CLERK_SECRET_KEY is required.");
if (!connectionString) throw new Error("A Bourbon alert queue database connection is required.");
const clerk = createClerkClient({ secretKey: clerkSecretKey });
const sql = neon(connectionString);
const repository = createProductionAlertQueueRepository();
const migrationId = expectedManifestHash
  ? `clerk-alert-capacity-v1:${expectedManifestHash.slice(0, 24)}`
  : "";

type JsonRecord = Record<string, unknown>;
function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}
function memberHash(userId: string) {
  return createHash("sha256").update(userId).digest("hex").slice(0, 12);
}
function withoutAlertDelivery(value: unknown) {
  return Object.fromEntries(Object.entries(record(value)).filter(([key]) => key !== "alertDelivery"));
}
function repairPatch(plan: ReturnType<typeof buildClerkAlertMetadataRepair>, privateMetadata: JsonRecord, publicMetadata: JsonRecord) {
  return {
    privatePatch: plan.privatePatchRequired ? plan.privatePatch : {},
    publicPatch: plan.publicPatchRequired ? plan.publicPatch : {},
    originalPrivatePatch: plan.privatePatchRequired ? { alertDelivery: privateMetadata.alertDelivery } : {},
    originalPublicPatch: plan.publicPatchRequired ? { monitoringScopes: publicMetadata.monitoringScopes } : {},
  };
}
async function listAllUsers() {
  const users: Array<Awaited<ReturnType<typeof clerk.users.getUser>>> = [];
  let offset = 0;
  while (true) {
    const page = await clerk.users.getUserList({ limit: 100, offset });
    users.push(...page.data);
    offset += page.data.length;
    if (!page.data.length || !page.totalCount || offset >= page.totalCount) break;
  }
  return users;
}
async function baselineCount(userId: string) {
  const rows = await sql.query("select count(*)::int as count from alert_baselines where user_id = $1", [userId]);
  return Number(rows[0]?.count || 0);
}
async function assertBackupSchema() {
  const rows = await sql.query(`select column_name from information_schema.columns
    where table_schema='public' and table_name='clerk_alert_metadata_backups'
      and column_name in ('private_metadata','public_metadata','private_metadata_hash','public_metadata_hash')`);
  if (rows.length !== 4) throw new Error("clerk_metadata_capacity_backup_schema_missing");
}
async function assertRepairLease(leaseKey: string, owner: string) {
  const renewed = await repository.renewLease(leaseKey, owner, 300);
  if (!renewed) throw new Error("Member alert lease was lost before metadata mutation.");
}
async function updateRepairFields(userId: string, privatePatch: JsonRecord, publicPatch: JsonRecord) {
  const payload: { privateMetadata?: JsonRecord; publicMetadata?: JsonRecord } = {};
  if (Object.keys(privatePatch).length) payload.privateMetadata = privatePatch;
  if (Object.keys(publicPatch).length) payload.publicMetadata = publicPatch;
  if (!payload.privateMetadata && !payload.publicMetadata) throw new Error("Repair contains no metadata fields.");
  await clerk.users.updateUserMetadata(userId, payload);
}
async function updateRepairFieldsUnderLease(
  leaseKey: string,
  owner: string,
  userId: string,
  privatePatch: JsonRecord,
  publicPatch: JsonRecord,
) {
  await assertRepairLease(leaseKey, owner);
  await updateRepairFields(userId, privatePatch, publicPatch);
  await assertRepairLease(leaseKey, owner);
}
async function restoreRepairFieldsIfSafe(input: {
  userId: string;
  leaseKey: string;
  owner: string;
  originalPrivate: JsonRecord;
  originalPublic: JsonRecord;
}) {
  const originalPlan = buildClerkAlertMetadataRepair(input.originalPrivate, input.originalPublic);
  const patches = repairPatch(originalPlan, input.originalPrivate, input.originalPublic);
  const current = await clerk.users.getUser(input.userId);
  const currentPrivate = record(current.privateMetadata);
  const currentPublic = record(current.publicMetadata);
  const alreadyOriginal = repairRollbackIsSafe({
    currentPrivateMetadata: currentPrivate,
    currentPublicMetadata: currentPublic,
    expectedPrivatePatch: patches.originalPrivatePatch,
    expectedPublicPatch: patches.originalPublicPatch,
  });
  if (alreadyOriginal) return;
  if (!repairRollbackIsSafe({
    currentPrivateMetadata: currentPrivate,
    currentPublicMetadata: currentPublic,
    expectedPrivatePatch: patches.privatePatch,
    expectedPublicPatch: patches.publicPatch,
  })) throw new Error(`Repair rollback compare-and-swap failed for ${memberHash(input.userId)}.`);
  await updateRepairFieldsUnderLease(
    input.leaseKey,
    input.owner,
    input.userId,
    patches.originalPrivatePatch,
    patches.originalPublicPatch,
  );
  const restored = await clerk.users.getUser(input.userId);
  if (!repairRollbackIsSafe({
    currentPrivateMetadata: restored.privateMetadata,
    currentPublicMetadata: restored.publicMetadata,
    expectedPrivatePatch: patches.originalPrivatePatch,
    expectedPublicPatch: patches.originalPublicPatch,
  })) throw new Error(`Repair rollback verification failed for ${memberHash(input.userId)}.`);
}

async function buildCohort() {
  const selected: Array<{
    userId: string;
    memberHash: string;
    privateHash: string;
    publicHash: string;
    baselineCount: number;
    legacyBaselines: ReturnType<typeof extractClerkAlertBaselines>;
    plan: ReturnType<typeof buildClerkAlertMetadataRepair>;
    identityVersion: unknown;
  }> = [];
  const blocked: Array<{ memberHash: string; reason: string }> = [];
  for (const user of await listAllUsers()) {
    const privateMetadata = record(user.privateMetadata);
    const publicMetadata = record(user.publicMetadata);
    if (jsonUtf8Bytes(privateMetadata) < CLERK_METADATA_REPAIR_THRESHOLD_BYTES
      && jsonUtf8Bytes(publicMetadata) < CLERK_METADATA_REPAIR_THRESHOLD_BYTES) continue;
    const plan = buildClerkAlertMetadataRepair(privateMetadata, publicMetadata);
    if (!plan.eligible) {
      blocked.push({ memberHash: memberHash(user.id), reason: plan.blockedReason || "not_repairable" });
      continue;
    }
    const baselines = await baselineCount(user.id);
    const identityVersion = record(privateMetadata.alertDelivery).dedupeIdentityVersion;
    const legacyBaselines = plan.privatePatchRequired
      ? extractClerkAlertBaselines(user.id, privateMetadata, new Date().toISOString())
      : [];
    if (plan.privatePatchRequired && baselines === 0 && legacyBaselines.length === 0) {
      blocked.push({ memberHash: memberHash(user.id), reason: "missing_durable_baseline" });
      continue;
    }
    selected.push({
      userId: user.id,
      memberHash: memberHash(user.id),
      privateHash: metadataHash(privateMetadata),
      publicHash: metadataHash(publicMetadata),
      baselineCount: baselines,
      legacyBaselines,
      plan,
      identityVersion,
    });
  }
  selected.sort((left, right) => left.memberHash.localeCompare(right.memberHash));
  const limited = limit ? selected.slice(0, limit) : selected;
  const manifest = limited.map((item) => ({
    userId: item.userId,
    privateHash: item.privateHash,
    publicHash: item.publicHash,
    privateBytesAfter: item.plan.privateBytesAfter,
    publicBytesAfter: item.plan.publicBytesAfter,
    privatePatchRequired: item.plan.privatePatchRequired,
    publicPatchRequired: item.plan.publicPatchRequired,
    legacyBaselineCount: item.legacyBaselines.length,
  }));
  return { selected: limited, blocked, manifestHash: metadataHash(manifest) };
}

async function verifyBackups(manifestHash: string) {
  const id = `clerk-alert-capacity-v1:${manifestHash.slice(0, 24)}`;
  const backups = await sql.query(`select user_id,private_metadata,public_metadata,private_metadata_hash,public_metadata_hash
    from clerk_alert_metadata_backups where migration_id=$1 order by user_id`, [id]);
  if (!backups.length) throw new Error("No backups found for the requested manifest.");
  const results = [];
  for (const backup of backups) {
    const userId = String(backup.user_id);
    const current = await clerk.users.getUser(userId);
    const currentPrivate = record(current.privateMetadata);
    const currentPublic = record(current.publicMetadata);
    const originalPrivate = record(backup.private_metadata);
    const originalPublic = record(backup.public_metadata);
    const originalPlan = buildClerkAlertMetadataRepair(originalPrivate, originalPublic);
    const alertDelivery = record(currentPrivate.alertDelivery);
    const privateOk = !originalPlan.privatePatchRequired || (
      alertDelivery.dedupeIdentityVersion === 2
      && alertDelivery.durableBaselineVersion === 1
      && jsonUtf8Bytes(alertDelivery) <= CLERK_ALERT_DELIVERY_TARGET_BYTES
      && metadataHash(withoutAlertDelivery(currentPrivate)) === metadataHash(withoutAlertDelivery(originalPrivate))
    );
    const publicOk = publicRepairMatchesPlan(currentPublic, originalPlan);
    if (!privateOk || !publicOk) throw new Error(`Verification failed for member ${memberHash(userId)}.`);
    results.push({ memberHash: memberHash(userId), privateBytes: jsonUtf8Bytes(currentPrivate), publicBytes: jsonUtf8Bytes(currentPublic) });
  }
  return { migrationId: id, verified: results };
}

if (mode === "verify") {
  const result = await verifyBackups(expectedManifestHash);
  console.log(JSON.stringify({ ok: true, mode, ...result, verifiedCount: result.verified.length }, null, 2));
  process.exit(0);
}

if (mode === "rollback") {
  const id = migrationId;
  const backups = await sql.query(`select user_id,private_metadata,public_metadata from clerk_alert_metadata_backups where migration_id=$1 order by user_id`, [id]);
  if (!backups.length) throw new Error("No backups found for rollback.");
  for (const backup of backups) {
    const userId = String(backup.user_id);
    const owner = `alert-metadata-rollback:${randomUUID()}`;
    const leaseKey = `member:${userId}`;
    const acquiredAt = new Date().toISOString();
    if (!await repository.acquireLease(leaseKey, owner, acquiredAt, new Date(Date.parse(acquiredAt) + 300_000).toISOString())) {
      throw new Error(`Could not acquire rollback lease for ${memberHash(userId)}.`);
    }
    try {
      await restoreRepairFieldsIfSafe({
        userId,
        leaseKey,
        owner,
        originalPrivate: record(backup.private_metadata),
        originalPublic: record(backup.public_metadata),
      });
    } finally {
      await repository.releaseLease(leaseKey, owner);
    }
  }
  console.log(JSON.stringify({ ok: true, mode, migrationId: id, rolledBackCount: backups.length }, null, 2));
  process.exit(0);
}

const cohort = await buildCohort();
const publicSummary = {
  selectedCount: cohort.selected.length,
  blocked: cohort.blocked,
  members: cohort.selected.map((item) => ({
    memberHash: item.memberHash,
    identityVersion: item.identityVersion ?? null,
    baselineCount: item.baselineCount,
    legacyBaselineCount: item.legacyBaselines.length,
    privateBytesBefore: item.plan.privateBytesBefore,
    privateBytesAfter: item.plan.privateBytesAfter,
    publicBytesBefore: item.plan.publicBytesBefore,
    publicBytesAfter: item.plan.publicBytesAfter,
    privatePatchRequired: item.plan.privatePatchRequired,
    publicPatchRequired: item.plan.publicPatchRequired,
  })),
};
if (mode === "plan") {
  console.log(JSON.stringify({ ok: true, mode, dryRun: true, manifestHash: cohort.manifestHash, ...publicSummary }, null, 2));
  process.exit(0);
}
if (cohort.manifestHash !== expectedManifestHash) throw new Error("Fresh repair manifest does not match --expected-manifest-hash.");
if (!cohort.selected.length) throw new Error("Repair manifest contains no eligible members.");
if (cohort.blocked.length) throw new Error("Repair plan contains blocked near-limit members.");
await assertBackupSchema();

const applied: Array<{ memberHash: string; privateBytes: number; publicBytes: number }> = [];
for (const candidate of cohort.selected) {
  const owner = `alert-metadata-repair:${randomUUID()}`;
  const acquiredAt = new Date().toISOString();
  const leaseKey = `member:${candidate.userId}`;
  if (!await repository.acquireLease(leaseKey, owner, acquiredAt, new Date(Date.parse(acquiredAt) + 300_000).toISOString())) {
    throw new Error(`Could not acquire repair lease for ${candidate.memberHash}.`);
  }
  let backupWritten = false;
  try {
    const fresh = await clerk.users.getUser(candidate.userId);
    const privateMetadata = record(fresh.privateMetadata);
    const publicMetadata = record(fresh.publicMetadata);
    if (metadataHash(privateMetadata) !== candidate.privateHash || metadataHash(publicMetadata) !== candidate.publicHash) {
      throw new Error(`Member ${candidate.memberHash} changed after planning.`);
    }
    const plan = buildClerkAlertMetadataRepair(privateMetadata, publicMetadata);
    if (!plan.eligible) throw new Error(`Member ${candidate.memberHash} is no longer eligible for the planned repair.`);
    const legacyBaselines = plan.privatePatchRequired
      ? extractClerkAlertBaselines(candidate.userId, privateMetadata, new Date().toISOString())
      : [];
    if (legacyBaselines.length !== candidate.legacyBaselines.length) {
      throw new Error(`Member ${candidate.memberHash} baseline identity changed after planning.`);
    }
    await sql.query(`insert into clerk_alert_metadata_backups
      (migration_id,user_id,alert_delivery,alert_inbox,private_metadata,public_metadata,private_metadata_hash,public_metadata_hash,backed_up_at)
      values ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,$9::timestamptz)
      on conflict (migration_id,user_id) do nothing`, [
      migrationId,
      candidate.userId,
      JSON.stringify(privateMetadata.alertDelivery || {}),
      JSON.stringify(privateMetadata.alertInbox || {}),
      JSON.stringify(privateMetadata),
      JSON.stringify(publicMetadata),
      candidate.privateHash,
      candidate.publicHash,
      new Date().toISOString(),
    ]);
    backupWritten = true;
    for (let index = 0; index < legacyBaselines.length; index += 1) {
      if (index % 100 === 0) await assertRepairLease(leaseKey, owner);
      await repository.baseline(legacyBaselines[index]);
    }
    await updateRepairFieldsUnderLease(
      leaseKey,
      owner,
      candidate.userId,
      plan.privatePatch,
      plan.publicPatch,
    );
    const repaired = await clerk.users.getUser(candidate.userId);
    const repairedPrivate = record(repaired.privateMetadata);
    const repairedPublic = record(repaired.publicMetadata);
    const repairedDelivery = record(repairedPrivate.alertDelivery);
    const privateOk = !plan.privatePatchRequired || (
      repairedDelivery.dedupeIdentityVersion === 2
      && repairedDelivery.durableBaselineVersion === 1
      && jsonUtf8Bytes(repairedDelivery) <= CLERK_ALERT_DELIVERY_TARGET_BYTES
      && metadataHash(withoutAlertDelivery(repairedPrivate)) === plan.unrelatedPrivateHashBefore
    );
    const publicOk = publicRepairMatchesPlan(repairedPublic, plan);
    if (!privateOk || !publicOk) {
      throw new Error(`Post-write verification failed for ${candidate.memberHash}.`);
    }
    applied.push({ memberHash: candidate.memberHash, privateBytes: jsonUtf8Bytes(repairedPrivate), publicBytes: jsonUtf8Bytes(repairedPublic) });
  } catch (error) {
    if (backupWritten) {
      const backup = await sql.query(`select private_metadata,public_metadata from clerk_alert_metadata_backups where migration_id=$1 and user_id=$2`, [migrationId, candidate.userId]);
      if (backup[0]) {
        await restoreRepairFieldsIfSafe({
          userId: candidate.userId,
          leaseKey,
          owner,
          originalPrivate: record(backup[0].private_metadata),
          originalPublic: record(backup[0].public_metadata),
        });
      }
    }
    throw error;
  } finally {
    await repository.releaseLease(leaseKey, owner);
  }
}

const verification = await verifyBackups(expectedManifestHash);
console.log(JSON.stringify({
  ok: true,
  mode,
  migrationId,
  manifestHash: expectedManifestHash,
  ...publicSummary,
  applied,
  verifiedCount: verification.verified.length,
}, null, 2));
