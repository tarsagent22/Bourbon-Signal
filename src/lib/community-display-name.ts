export const COMMUNITY_DISPLAY_NAME_METADATA_KEY = "communityDisplayName" as const;

import { normalizeCommunityDisplayName } from '../../shared/community-display-name.ts';
export { normalizeCommunityDisplayName, type CommunityDisplayNameResult } from '../../shared/community-display-name.ts';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function communityDisplayNameFromMetadata(metadata: unknown) {
  const candidate = normalizeCommunityDisplayName(record(metadata)[COMMUNITY_DISPLAY_NAME_METADATA_KEY]);
  return candidate.ok ? candidate.value : null;
}

export function communityDisplayNameSeparateFromIdentity(value: unknown, immutableIdentityLabel: string | null | undefined) {
  const candidate = normalizeCommunityDisplayName(value);
  if (!candidate.ok) return null;
  const label = typeof immutableIdentityLabel === "string" ? immutableIdentityLabel.trim() : "";
  return label && candidate.value.toLocaleLowerCase() === label.toLocaleLowerCase() ? null : candidate.value;
}
