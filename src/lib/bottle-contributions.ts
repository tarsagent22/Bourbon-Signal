import { createHash } from "node:crypto";
import { list } from "@vercel/blob";
import { normalizeBottleKey, searchBourbonBible } from "@/lib/bourbonBible";
import { selectLatestQueueBlob } from "@/lib/admin-review";
import { validBottleContributionIdempotencyKey } from "@/lib/bottle-contribution-idempotency";
import { createBottleContributionRepository, isStoredBottleContributionStatus, type BottleContributionRepository } from "@/lib/bottle-contribution-repository";

export type BottleContributionSource = "sighting" | "collection" | "bottle_check";
export type BottleContributionStatus = "new" | "matched_existing" | "needs_human" | "rejected" | "added" | "ignored";

export interface BottleContribution {
  id: string;
  rawName: string;
  normalizedName: string;
  source: BottleContributionSource;
  userId?: string;
  userEmail?: string;
  context?: Record<string, unknown>;
  status: BottleContributionStatus;
  duplicateCount: number;
  candidateBottleId?: string;
  candidateBottleName?: string;
  confidence?: "high" | "medium" | "low";
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BottleContributionQueue {
  version: 1;
  updatedAt: string;
  contributions: BottleContribution[];
}

const LEGACY_QUEUE_PREFIX = "bottle-contributions/queue";

function nowIso() {
  return new Date().toISOString();
}

function contributionId(normalizedName: string, source: BottleContributionSource) {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `bottle_${source}_${normalizedName.replace(/\s+/g, "-").slice(0, 64)}_${stamp}_${random}`;
}

export function deterministicBottleContributionId(source: BottleContributionSource, userId: string, idempotencyKey: string) {
  const digest = createHash("sha256")
    .update("bottle-contribution:v1\0")
    .update(source)
    .update("\0")
    .update(userId)
    .update("\0")
    .update(idempotencyKey)
    .digest("hex");
  return `bottle_idem_v1_${digest}`;
}

function isLegacyContribution(value: unknown): value is BottleContribution {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<BottleContribution>;
  return typeof item.id === "string"
    && typeof item.rawName === "string"
    && typeof item.normalizedName === "string"
    && typeof item.createdAt === "string"
    && typeof item.updatedAt === "string"
    && isStoredBottleContributionStatus(item.status);
}

async function migrateLegacyBlobQueue(repository: BottleContributionRepository) {
  try {
    const blobs: Array<{ pathname: string; url: string; uploadedAt: Date }> = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: LEGACY_QUEUE_PREFIX, limit: 1000, cursor });
      blobs.push(...page.blobs);
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    const latest = selectLatestQueueBlob(blobs);
    if (!latest) return;
    const response = await fetch(latest.url, { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to read the legacy bottle queue.");
    const payload = await response.json() as Partial<BottleContributionQueue>;
    const contributions = Array.isArray(payload.contributions) ? payload.contributions.filter(isLegacyContribution) : [];
    for (const contribution of contributions) await repository.importLegacyContribution(contribution);
  } catch (error) {
    console.error("Legacy bottle queue reconciliation failed", error);
  }
}

export async function readBottleContributionQueue(): Promise<BottleContributionQueue> {
  const repository = createBottleContributionRepository();
  await migrateLegacyBlobQueue(repository);
  const contributions = await repository.listContributions(500);
  const updatedAt = contributions.reduce((latest, item) => item.updatedAt > latest ? item.updatedAt : latest, new Date(0).toISOString());
  return { version: 1, updatedAt, contributions };
}

export async function candidateMatchForBottle(rawName: string) {
  const match = (await searchBourbonBible(rawName, 1))[0];
  if (!match) return null;
  const confidence: BottleContribution["confidence"] = match.matchScore >= 108 ? "high" : match.matchScore >= 82 ? "medium" : "low";
  return {
    bottleId: match.id,
    bottleName: match.canonicalName,
    matchScore: match.matchScore,
    confidence,
  };
}

export async function addBottleContribution(input: {
  rawName: string;
  source: BottleContributionSource;
  userId?: string;
  userEmail?: string;
  context?: Record<string, unknown>;
  idempotencyKey?: string;
}, dependencies: {
  repository?: Pick<BottleContributionRepository, "upsertContribution" | "insertOrReplayContribution">;
  candidateMatcher?: typeof candidateMatchForBottle;
  now?: () => string;
} = {}) {
  const rawName = input.rawName.trim().replace(/\s+/g, " ").slice(0, 160);
  const normalizedName = normalizeBottleKey(rawName);
  if (!rawName || normalizedName.length < 2) throw new Error("Bottle name is required");
  const idempotencyKey = validBottleContributionIdempotencyKey(input.idempotencyKey);
  if (input.idempotencyKey && !idempotencyKey) throw new Error("Invalid Idempotency-Key.");
  if (idempotencyKey && !input.userId) throw new Error("Authenticated user is required for idempotent bottle contributions.");

  const candidate = await (dependencies.candidateMatcher || candidateMatchForBottle)(rawName);
  const now = (dependencies.now || nowIso)();
  const contribution: BottleContribution = {
    id: idempotencyKey
      ? deterministicBottleContributionId(input.source, input.userId!, idempotencyKey)
      : contributionId(normalizedName, input.source),
    rawName,
    normalizedName,
    source: input.source,
    userId: input.userId,
    userEmail: input.userEmail,
    context: input.context || {},
    status: candidate?.confidence === "high" ? "matched_existing" : "new",
    duplicateCount: 1,
    candidateBottleId: candidate?.bottleId,
    candidateBottleName: candidate?.bottleName,
    confidence: candidate?.confidence,
    notes: candidate?.confidence === "high" ? `Auto-matched to existing Bottle Bible entry: ${candidate.bottleName}.` : undefined,
    createdAt: now,
    updatedAt: now,
  };
  const repository = dependencies.repository || createBottleContributionRepository();
  if (!dependencies.repository) await migrateLegacyBlobQueue(repository as BottleContributionRepository);
  return idempotencyKey
    ? repository.insertOrReplayContribution(contribution)
    : repository.upsertContribution(contribution);
}

export async function updateBottleContribution(id: string, patch: Partial<Pick<BottleContribution, "status" | "candidateBottleId" | "candidateBottleName" | "confidence" | "notes">>) {
  const repository = createBottleContributionRepository();
  await migrateLegacyBlobQueue(repository);
  return repository.updateContribution(id, patch, nowIso());
}

export function bottleContributionDigest(queue: BottleContributionQueue) {
  return queue.contributions
    .filter((item) => item.status === "new" || item.status === "needs_human")
    .slice(0, 20)
    .map((item) => ({
      id: item.id,
      rawName: item.rawName,
      normalizedName: item.normalizedName,
      source: item.source,
      duplicateCount: item.duplicateCount,
      candidateBottleName: item.candidateBottleName,
      confidence: item.confidence,
      notes: item.notes,
      createdAt: item.createdAt,
    }));
}
