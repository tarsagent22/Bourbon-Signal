export const COMMUNITY_DISPLAY_NAME_METADATA_KEY = "communityDisplayName" as const;

export type CommunityDisplayNameResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeCommunityDisplayName(value: unknown): CommunityDisplayNameResult {
  if (typeof value !== "string") return { ok: false, error: "Enter a Community display name." };
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalized) return { ok: false, error: "Community display name cannot be blank." };
  if (normalized.length < 2 || normalized.length > 32) return { ok: false, error: "Community display name must be 2 to 32 characters." };
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u.test(normalized)) {
    return { ok: false, error: "Use letters, numbers, spaces, periods, apostrophes, or hyphens only." };
  }
  const reserved = normalized.toLowerCase().replace(/[^a-z0-9#]+/g, " ").trim();
  if (/\b(bourbon signal|admin|administrator|moderator|staff|support|official|owner|founder|member)\b/.test(reserved)
    || /^(founder|member)\s*#?\s*\d+$/i.test(normalized)) {
    return { ok: false, error: "That name is reserved or could mislead other members." };
  }
  return { ok: true, value: normalized };
}

export function communityDisplayNameFromMetadata(metadata: unknown) {
  const candidate = normalizeCommunityDisplayName(record(metadata)[COMMUNITY_DISPLAY_NAME_METADATA_KEY]);
  return candidate.ok ? candidate.value : null;
}

export function resolvedCommunityDisplayName(metadata: unknown, immutableIdentityLabel: string) {
  return communityDisplayNameFromMetadata(metadata) || immutableIdentityLabel;
}
