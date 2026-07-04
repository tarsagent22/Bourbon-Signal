import { list, put } from "@vercel/blob";
import { normalizeBottleKey, searchBourbonBible } from "@/lib/bourbonBible";

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

const QUEUE_PATH = "bottle-contributions/queue.json";
const EMPTY_QUEUE: BottleContributionQueue = { version: 1, updatedAt: new Date(0).toISOString(), contributions: [] };

function nowIso() {
  return new Date().toISOString();
}

function contributionId(normalizedName: string, source: BottleContributionSource) {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `bottle_${source}_${normalizedName.replace(/\s+/g, "-").slice(0, 64)}_${stamp}_${random}`;
}

async function blobUrlForQueue() {
  const blobs = await list({ prefix: QUEUE_PATH, limit: 1 });
  return blobs.blobs.find((blob) => blob.pathname === QUEUE_PATH)?.url || null;
}

export async function readBottleContributionQueue(): Promise<BottleContributionQueue> {
  try {
    const url = await blobUrlForQueue();
    if (!url) return EMPTY_QUEUE;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return EMPTY_QUEUE;
    const data = await res.json() as Partial<BottleContributionQueue>;
    return {
      version: 1,
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : nowIso(),
      contributions: Array.isArray(data.contributions) ? data.contributions.filter((item): item is BottleContribution => Boolean(item && typeof item === "object" && item.id && item.rawName)) : [],
    };
  } catch {
    return EMPTY_QUEUE;
  }
}

export async function writeBottleContributionQueue(queue: BottleContributionQueue) {
  const next = { ...queue, version: 1 as const, updatedAt: nowIso() };
  await put(QUEUE_PATH, JSON.stringify(next, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return next;
}

export function candidateMatchForBottle(rawName: string) {
  const match = searchBourbonBible(rawName, 1)[0];
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
}) {
  const rawName = input.rawName.trim().replace(/\s+/g, " ").slice(0, 160);
  const normalizedName = normalizeBottleKey(rawName);
  if (!rawName || normalizedName.length < 2) throw new Error("Bottle name is required");

  const queue = await readBottleContributionQueue();
  const existing = queue.contributions.find((item) => item.normalizedName === normalizedName && ["new", "needs_human", "matched_existing"].includes(item.status));
  const candidate = candidateMatchForBottle(rawName);
  const now = nowIso();

  if (existing) {
    const updated: BottleContribution = {
      ...existing,
      duplicateCount: (existing.duplicateCount || 1) + 1,
      updatedAt: now,
      candidateBottleId: existing.candidateBottleId || candidate?.bottleId,
      candidateBottleName: existing.candidateBottleName || candidate?.bottleName,
      confidence: existing.confidence || candidate?.confidence,
      context: { ...(existing.context || {}), latestSource: input.source },
    };
    const nextQueue = { ...queue, contributions: queue.contributions.map((item) => item.id === existing.id ? updated : item) };
    await writeBottleContributionQueue(nextQueue);
    return updated;
  }

  const contribution: BottleContribution = {
    id: contributionId(normalizedName, input.source),
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
  await writeBottleContributionQueue({ ...queue, contributions: [contribution, ...queue.contributions].slice(0, 500) });
  return contribution;
}

export async function updateBottleContribution(id: string, patch: Partial<Pick<BottleContribution, "status" | "candidateBottleId" | "candidateBottleName" | "confidence" | "notes">>) {
  const queue = await readBottleContributionQueue();
  let updated: BottleContribution | null = null;
  const contributions = queue.contributions.map((item) => {
    if (item.id !== id) return item;
    updated = { ...item, ...patch, updatedAt: nowIso() };
    return updated;
  });
  if (!updated) throw new Error("Contribution not found");
  await writeBottleContributionQueue({ ...queue, contributions });
  return updated;
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
