import { createClerkClient } from "@clerk/backend";
import { assessLegacyCollectionRetirement } from "./lib/legacy-collection-retirement.mjs";

const loadedCollection = await import("../src/lib/member-collection.ts");
const collectionModule = ((loadedCollection as { default?: unknown }).default || loadedCollection) as typeof import("../src/lib/member-collection.ts");
const loadedRepository = await import("../src/lib/member-collection-repository.ts");
const repositoryModule = ((loadedRepository as { default?: unknown }).default || loadedRepository) as typeof import("../src/lib/member-collection-repository.ts");
const { collectionFingerprint, normalizeCollectionBottles } = collectionModule;
const { getMemberCollectionRepository } = repositoryModule;

interface ClerkCollectionUser {
  id: string;
  publicMetadata?: Record<string, unknown>;
}

const applyMigrations = process.argv.includes("--apply");
const clearLegacy = process.argv.includes("--clear");
if (applyMigrations && clearLegacy) throw new Error("Use --apply and --clear in separate runs.");

function clerkClientFromEnvironment() {
  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is required.");
  return createClerkClient({ secretKey });
}

async function listAllUsers(client: ReturnType<typeof createClerkClient>) {
  const users: ClerkCollectionUser[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const page = await client.users.getUserList({ limit, offset, orderBy: "+created_at" });
    users.push(...page.data as ClerkCollectionUser[]);
    offset += page.data.length;
    if (!page.data.length || offset >= page.totalCount) break;
  }
  return users;
}

function reasonCounts(assessments: Array<{ reasons: string[] }>) {
  const counts: Record<string, number> = {};
  for (const assessment of assessments) {
    for (const reason of assessment.reasons) counts[reason] = (counts[reason] || 0) + 1;
  }
  return counts;
}

async function main() {
  const client = clerkClientFromEnvironment();
  const repository = getMemberCollectionRepository();
  const users = await listAllUsers(client);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const candidates = users.map((user) => ({
    user,
    legacy: { bottles: normalizeCollectionBottles(user.publicMetadata?.collectionPreferences) },
  })).filter((row) => row.legacy.bottles.length > 0);

  const checked = [];
  for (const candidate of candidates) {
    if (applyMigrations) await repository.migrateLegacyForUser(candidate.user.id, candidate.legacy.bottles);
    const [durable, evidence] = await Promise.all([
      repository.getForUser(candidate.user.id),
      repository.getLegacyRetirementEvidence(candidate.user.id),
    ]);
    checked.push({
      user: candidate.user,
      legacy: candidate.legacy,
      durable,
      evidence,
      assessment: assessLegacyCollectionRetirement({
        legacyBottleCount: candidate.legacy.bottles.length,
        durableBottleCount: durable.bottles.length,
        backupBottleCount: normalizeCollectionBottles(evidence.backup).length,
        durableVersion: durable.version,
        legacyFingerprint: collectionFingerprint(candidate.legacy),
        durableFingerprint: collectionFingerprint(durable),
        backupFingerprint: collectionFingerprint(evidence.backup),
        evidence,
      }),
    });
  }

  const unsafe = checked.filter((row) => !row.assessment.safeToClear);
  const summary = {
    mode: clearLegacy ? "clear" : applyMigrations ? "apply" : "check",
    scanned: users.length,
    eligible: checked.length,
    safeToClear: checked.length - unsafe.length,
    unsafe: unsafe.length,
    bottleCount: checked.reduce((sum, row) => sum + row.assessment.legacyBottleCount, 0),
    reasons: reasonCounts(unsafe.map((row) => row.assessment)),
  };

  if (!clearLegacy) {
    console.log(JSON.stringify(summary));
    if (unsafe.length > 0) {
      throw new Error(`Legacy collection parity preflight failed for ${unsafe.length} collection(s).`);
    }
    return;
  }
  if (unsafe.length > 0) {
    throw new Error(`Refusing to clear Clerk collection fallback: ${unsafe.length} collection(s) failed parity or backup checks (${JSON.stringify(summary.reasons)}).`);
  }

  let reconciledAuditRows = 0;
  const pendingAuditUserIds = await repository.listPendingLegacyClearAuditUserIds();
  const eligibleIds = new Set(checked.map((row) => row.user.id));
  for (const userId of pendingAuditUserIds) {
    if (eligibleIds.has(userId)) continue;
    const user = usersById.get(userId);
    if (!user || normalizeCollectionBottles(user.publicMetadata?.collectionPreferences).length > 0) continue;
    const evidence = await repository.getLegacyRetirementEvidence(userId);
    if (!evidence.backup || !evidence.backedUpAt) continue;
    await repository.markLegacyCleared(userId);
    reconciledAuditRows += 1;
  }

  let cleared = 0;
  for (const row of checked) {
    const currentUser = await client.users.getUser(row.user.id);
    const currentLegacy = { bottles: normalizeCollectionBottles(currentUser.publicMetadata?.collectionPreferences) };
    const [currentDurable, currentEvidence] = await Promise.all([
      repository.getForUser(row.user.id),
      repository.getLegacyRetirementEvidence(row.user.id),
    ]);
    const currentAssessment = assessLegacyCollectionRetirement({
      legacyBottleCount: currentLegacy.bottles.length,
      durableBottleCount: currentDurable.bottles.length,
      backupBottleCount: normalizeCollectionBottles(currentEvidence.backup).length,
      durableVersion: currentDurable.version,
      legacyFingerprint: collectionFingerprint(currentLegacy),
      durableFingerprint: collectionFingerprint(currentDurable),
      backupFingerprint: collectionFingerprint(currentEvidence.backup),
      evidence: currentEvidence,
    });
    if (!currentAssessment.safeToClear) {
      throw new Error(`Refusing to clear a Clerk collection after its parity or backup evidence changed (${currentAssessment.reasons.join(",")}).`);
    }
    await client.users.updateUserMetadata(row.user.id, {
      publicMetadata: { collectionPreferences: null },
    });
    const verified = await client.users.getUser(row.user.id);
    if (normalizeCollectionBottles(verified.publicMetadata?.collectionPreferences).length > 0) {
      throw new Error("Refusing to mark a Clerk collection cleared because post-write verification still found legacy bottles.");
    }
    await repository.markLegacyCleared(row.user.id);
    cleared += 1;
  }

  console.log(JSON.stringify({ ...summary, cleared, reconciledAuditRows }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
