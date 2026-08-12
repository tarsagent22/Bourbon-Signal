import { createHash } from "node:crypto";
import { createClerkClient } from "@clerk/backend";
import * as signalPointsModule from "../src/lib/signal-points-repository.ts";

const repositoryExports = ("default" in signalPointsModule
  ? { ...signalPointsModule, ...(signalPointsModule.default as object) }
  : signalPointsModule) as typeof import("../src/lib/signal-points-repository.ts");
const { createSignalPointsRepository, normalizedClerkRewardPoints } = repositoryExports;
const VERIFIED_COMPLETE_MARKER = "signal_points_clerk_metadata_v1_verified_complete";

const apply = process.argv.includes("--apply");
const pageSizeArgument = process.argv.find((argument) => argument.startsWith("--page-size="));
const pageSize = Math.max(1, Math.min(500, Number(pageSizeArgument?.slice("--page-size=".length) || 100)));
const recognized = new Set(["--apply", ...(pageSizeArgument ? [pageSizeArgument] : [])]);
for (const argument of process.argv.slice(2)) {
  if (!recognized.has(argument)) throw new Error(`Unknown argument: ${argument}`);
}
if (!Number.isInteger(pageSize)) throw new Error("--page-size must be an integer from 1 to 500.");

const secretKey = process.env.CLERK_SECRET_KEY?.trim();
if (!secretKey) throw new Error("CLERK_SECRET_KEY is required.");

const clerk = createClerkClient({ secretKey });
const repository = createSignalPointsRepository();
type Snapshot = { userId: string; memberRewards: unknown; target: number; snapshotHash: string };
const summary = {
  mode: apply ? "apply" : "dry-run",
  dryRun: !apply,
  pageSize,
  scanned: 0,
  wouldChange: 0,
  reconciled: 0,
  verified: 0,
  mismatched: 0,
  firstPass: { scanned: 0, snapshotHash: "" },
  secondPass: { scanned: 0, snapshotHash: "", matchesFirstPass: false },
  verifiedMarker: VERIFIED_COMPLETE_MARKER,
  markedComplete: false,
  errors: [] as Array<{ userId: string; message: string }>,
};

function rewardSnapshot(userId: string, memberRewards: unknown): Snapshot {
  const serialized = JSON.stringify(memberRewards || {});
  return {
    userId,
    memberRewards,
    target: normalizedClerkRewardPoints(memberRewards),
    snapshotHash: createHash("sha256").update(serialized).digest("hex"),
  };
}

function passHash(snapshots: Snapshot[]) {
  return createHash("sha256")
    .update(snapshots.map((snapshot) => `${snapshot.userId}:${snapshot.target}:${snapshot.snapshotHash}`).sort().join("\n"))
    .digest("hex");
}

async function scanClerkMembers() {
  const snapshots: Snapshot[] = [];
  let offset = 0;
  while (true) {
    const page = await clerk.users.getUserList({ limit: pageSize, offset, orderBy: "+created_at" });
    for (const user of page.data) {
      const memberRewards = (user.privateMetadata as Record<string, unknown> | undefined)?.memberRewards;
      snapshots.push(rewardSnapshot(user.id, memberRewards));
    }
    offset += page.data.length;
    if (!page.data.length || offset >= page.totalCount) break;
  }
  return snapshots;
}

const firstSnapshots = await scanClerkMembers();
summary.scanned = firstSnapshots.length;
summary.firstPass = { scanned: firstSnapshots.length, snapshotHash: passHash(firstSnapshots) };
for (const snapshot of firstSnapshots) {
  try {
    const before = await repository.readClerkRewardSource(snapshot.userId);
    if (before?.sourcePoints !== snapshot.target) summary.wouldChange += 1;
    if (apply) {
      const rewardGeneration = await repository.nextRewardGeneration(snapshot.userId);
      const currentUser = await clerk.users.getUser(snapshot.userId);
      const currentRewards = (currentUser.privateMetadata as Record<string, unknown> | undefined)?.memberRewards;
      await repository.reconcileClerkRewards(snapshot.userId, currentRewards, rewardGeneration);
      summary.reconciled += 1;
    }
  } catch (error) {
    summary.errors.push({ userId: snapshot.userId, message: error instanceof Error ? error.message : String(error) });
  }
}

if (apply && summary.errors.length === 0) {
  const secondSnapshots = await scanClerkMembers();
  summary.secondPass = { scanned: secondSnapshots.length, snapshotHash: passHash(secondSnapshots), matchesFirstPass: false };
  summary.secondPass.matchesFirstPass = summary.firstPass.scanned === summary.secondPass.scanned
    && summary.firstPass.snapshotHash === summary.secondPass.snapshotHash;
  const firstById = new Map(firstSnapshots.map((snapshot) => [snapshot.userId, snapshot]));
  for (const snapshot of secondSnapshots) {
    const first = firstById.get(snapshot.userId);
    try {
      const verifiedState = await repository.readClerkRewardSource(snapshot.userId);
      if (first?.snapshotHash === snapshot.snapshotHash && first.target === snapshot.target && verifiedState?.sourcePoints === snapshot.target) summary.verified += 1;
      else summary.mismatched += 1;
    } catch (error) {
      summary.mismatched += 1;
      summary.errors.push({ userId: snapshot.userId, message: error instanceof Error ? error.message : String(error) });
    }
  }
  if (!summary.secondPass.matchesFirstPass) summary.mismatched += Math.max(1, Math.abs(firstSnapshots.length - secondSnapshots.length));
  if (summary.mismatched === 0 && summary.errors.length === 0 && summary.verified === firstSnapshots.length) {
    await repository.markClerkRewardBackfillVerifiedComplete({
      scanned: summary.scanned,
      reconciled: summary.reconciled,
      verified: summary.verified,
      firstPassSnapshotHash: summary.firstPass.snapshotHash,
      secondPassSnapshotHash: summary.secondPass.snapshotHash,
    });
    summary.markedComplete = true;
  }
}

console.log(JSON.stringify(summary, null, 2));
if (summary.errors.length || (apply && (summary.mismatched > 0 || !summary.markedComplete))) process.exitCode = 1;
