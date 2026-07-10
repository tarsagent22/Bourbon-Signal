import { createHash } from "node:crypto";

export type GroupedAlertIdentity = {
  matchKey?: unknown;
  dedupeKey?: unknown;
  id?: unknown;
};

function nonEmptyString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function stableGroupedAlertDedupeKey(locationKey: string, candidates: GroupedAlertIdentity[]) {
  const stableCandidateKeys = Array.from(new Set(candidates
    .map((candidate) => nonEmptyString(candidate.matchKey) || nonEmptyString(candidate.dedupeKey) || nonEmptyString(candidate.id))
    .filter(Boolean)))
    .sort();
  const digest = createHash("sha256")
    .update([locationKey.trim(), ...stableCandidateKeys].join("|"))
    .digest("hex")
    .slice(0, 24);
  return `location-group:${digest}`;
}
