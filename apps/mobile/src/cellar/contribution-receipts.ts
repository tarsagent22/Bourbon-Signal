const BOTTLE_CONTRIBUTION_RECEIPTS_STORAGE_PREFIX = "bourbon-signal.cellar-contribution-receipts.v1";
export const BOTTLE_CONTRIBUTION_RECEIPT_LIMIT = 100;

const RECEIPT_VERSION = 1;
const MAX_SERIALIZED_LENGTH = 32_768;
const MAX_ID_LENGTH = 128;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export type BottleContributionReceipts = ReadonlyMap<string, string>;

function normalizedId(value: unknown) {
  if (typeof value !== "string") return "";
  const id = value.trim();
  return id.length <= MAX_ID_LENGTH && SAFE_ID.test(id) ? id : "";
}

export function bottleContributionReceiptsStorageKey(userId: string | null | undefined) {
  if (typeof userId !== "string" || userId !== userId.trim()) return "";
  const normalizedUserId = normalizedId(userId);
  return normalizedUserId ? `${BOTTLE_CONTRIBUTION_RECEIPTS_STORAGE_PREFIX}.${normalizedUserId}` : "";
}

function appendBounded(receipts: Map<string, string>, bottleId: string, contributionId: string) {
  receipts.delete(bottleId);
  receipts.set(bottleId, contributionId);
  while (receipts.size > BOTTLE_CONTRIBUTION_RECEIPT_LIMIT) {
    const oldest = receipts.keys().next().value;
    if (oldest === undefined) break;
    receipts.delete(oldest);
  }
}

export function parseBottleContributionReceipts(value: string | null | undefined) {
  const receipts = new Map<string, string>();
  if (!value || value.length > MAX_SERIALIZED_LENGTH) return receipts;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || (parsed as { version?: unknown }).version !== RECEIPT_VERSION) return receipts;
    const entries = (parsed as { receipts?: unknown }).receipts;
    if (!Array.isArray(entries)) return receipts;
    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length !== 2) continue;
      const bottleId = normalizedId(entry[0]);
      const contributionId = normalizedId(entry[1]);
      if (bottleId && contributionId) appendBounded(receipts, bottleId, contributionId);
    }
  } catch {
    return receipts;
  }
  return receipts;
}

export function serializeBottleContributionReceipts(receipts: BottleContributionReceipts) {
  const bounded = new Map<string, string>();
  for (const [rawBottleId, rawContributionId] of receipts) {
    const bottleId = normalizedId(rawBottleId);
    const contributionId = normalizedId(rawContributionId);
    if (!bottleId || !contributionId) throw new Error("Bottle contribution receipt IDs are invalid.");
    appendBounded(bounded, bottleId, contributionId);
  }
  return JSON.stringify({ version: RECEIPT_VERSION, receipts: [...bounded] });
}

export function mergeBottleContributionReceipt(receipts: BottleContributionReceipts, rawBottleId: string, rawContributionId: string) {
  const bottleId = normalizedId(rawBottleId);
  const contributionId = normalizedId(rawContributionId);
  if (!bottleId || !contributionId) throw new Error("Bottle contribution receipt IDs are invalid.");
  const next = new Map<string, string>();
  for (const [existingBottleId, existingContributionId] of receipts) {
    const validBottleId = normalizedId(existingBottleId);
    const validContributionId = normalizedId(existingContributionId);
    if (validBottleId && validContributionId) appendBounded(next, validBottleId, validContributionId);
  }
  appendBounded(next, bottleId, contributionId);
  return next;
}

export function removeBottleContributionReceipts(receipts: BottleContributionReceipts, bottleIds: Iterable<string>) {
  let next: Map<string, string> | undefined;
  for (const rawBottleId of bottleIds) {
    const bottleId = normalizedId(rawBottleId);
    if (!bottleId || !(next || receipts).has(bottleId)) continue;
    next ||= new Map(receipts);
    next.delete(bottleId);
  }
  return next || receipts;
}
