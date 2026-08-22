function slug(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function stableLocationHash(value: string) {
  const normalized = value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

export function buildManualStoreId(name: string, address: string, city: string, state: string) {
  const identity = [name, address, city, state]
    .map((value) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim())
    .join("|");
  const label = slug(name).slice(0, 48) || "store";
  return `manual:${label}-${stableLocationHash(identity)}`;
}

export function createSightingIdempotencyKey(now = Date.now(), entropy = Math.random().toString(36).slice(2, 10)) {
  return `mobile-post-${now}-${entropy}`;
}

export interface SightingDraftBinding {
  key: string;
  fingerprint: string | null;
}

export function parseSightingDraftBinding(value: string | null): SightingDraftBinding | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SightingDraftBinding>;
    if (typeof parsed.key !== "string" || parsed.key.length < 8) return null;
    return { key: parsed.key, fingerprint: typeof parsed.fingerprint === "string" ? parsed.fingerprint : null };
  } catch {
    return value.length >= 8 ? { key: value, fingerprint: null } : null;
  }
}

export function serializeSightingDraftBinding(binding: SightingDraftBinding) {
  return JSON.stringify(binding);
}

export const SIGHTING_IDEMPOTENCY_STORAGE_KEY = "bourbon-signal.pending-sighting-idempotency-key.v1";
