import { createHash } from "node:crypto";

export type GroupedAlertIdentity = {
  matchKey?: unknown;
  dedupeKey?: unknown;
  id?: unknown;
  signalAt?: unknown;
  changeType?: unknown;
  eventIdentityKey?: unknown;
  availabilityEpisodeId?: unknown;
  legacyDedupeKey?: unknown;
  __groupCandidates?: unknown;
};

function nonEmptyString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function stableUnderlyingAlertKey(candidate: GroupedAlertIdentity) {
  const explicit = nonEmptyString(candidate.eventIdentityKey);
  if (explicit) return explicit;
  const availabilityEpisodeId = nonEmptyString(candidate.availabilityEpisodeId);
  if (availabilityEpisodeId) return `availability-episode:${availabilityEpisodeId}`;
  const matchKey = nonEmptyString(candidate.matchKey);
  const dedupeKey = nonEmptyString(candidate.dedupeKey);
  const changeType = nonEmptyString(candidate.changeType);
  const signalAt = nonEmptyString(candidate.signalAt);
  if (/^(?:new_signal|changed_signal)$/.test(changeType) && matchKey && signalAt) {
    return `event:${matchKey}:${signalAt}:${dedupeKey || nonEmptyString(candidate.id)}`;
  }
  return dedupeKey || nonEmptyString(candidate.id) || matchKey;
}

export function withAvailabilityEpisodeIdentity<T extends GroupedAlertIdentity>(candidate: T): T {
  const availabilityEpisodeId = nonEmptyString(candidate.availabilityEpisodeId);
  if (!availabilityEpisodeId || nonEmptyString(candidate.eventIdentityKey)) return candidate;
  return {
    ...candidate,
    eventIdentityKey: `availability-episode:${availabilityEpisodeId}`,
  };
}

function underlyingAlertIdentityKeys(candidate: GroupedAlertIdentity) {
  return [stableUnderlyingAlertKey(candidate), nonEmptyString(candidate.legacyDedupeKey)].filter(Boolean);
}

export function enumerateUnderlyingAlertChildren<T extends GroupedAlertIdentity>(candidate: T): T[] {
  const source = Array.isArray(candidate.__groupCandidates) ? candidate.__groupCandidates : [candidate];
  const seen = new Set<string>();
  const children: T[] = [];
  for (const value of source) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const child = value as T;
    const stableKey = stableUnderlyingAlertKey(child);
    if (!stableKey || seen.has(stableKey)) continue;
    seen.add(stableKey);
    children.push(child);
  }
  return children;
}

export function selectUnseenUnderlyingAlertChildren<T extends GroupedAlertIdentity>(
  candidate: T,
  seenStableKeys: ReadonlySet<string>,
) {
  return enumerateUnderlyingAlertChildren(candidate)
    .filter((child) => !underlyingAlertIdentityKeys(child).some((key) => seenStableKeys.has(key)));
}

export function stableGroupedAlertDedupeKey(locationKey: string, candidates: GroupedAlertIdentity[]) {
  const stableCandidateKeys = Array.from(new Set(candidates
    .map(stableUnderlyingAlertKey)
    .filter(Boolean)))
    .sort();
  const digest = createHash("sha256")
    .update([locationKey.trim(), ...stableCandidateKeys].join("|"))
    .digest("hex")
    .slice(0, 24);
  return `location-group:${digest}`;
}
