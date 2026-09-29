import { createHash } from "node:crypto";
import { compactMonitoringScopesForMetadata, monitoringScopesFromPreferences, normalizeMonitoringScopes } from "../monitoring-scopes";
import { compactClerkAlertDelivery, jsonUtf8Bytes } from "./clerk-alert-metadata";

type JsonRecord = Record<string, unknown>;

export const CLERK_METADATA_REPAIR_THRESHOLD_BYTES = 7600;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as JsonRecord)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, canonical(item)]));
}

export function metadataHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonical(value)), "utf8").digest("hex");
}

export function repairRollbackIsSafe(input: {
  currentPrivateMetadata: unknown;
  currentPublicMetadata: unknown;
  expectedPrivatePatch: unknown;
  expectedPublicPatch: unknown;
}) {
  const currentPrivate = record(input.currentPrivateMetadata);
  const currentPublic = record(input.currentPublicMetadata);
  const expectedPrivate = record(input.expectedPrivatePatch);
  const expectedPublic = record(input.expectedPublicPatch);
  const matches = (current: JsonRecord, expected: JsonRecord) => Object.entries(expected)
    .every(([key, value]) => JSON.stringify(canonical(current[key])) === JSON.stringify(canonical(value)));
  return matches(currentPrivate, expectedPrivate) && matches(currentPublic, expectedPublic);
}

function withoutKey(source: JsonRecord, key: string) {
  return Object.fromEntries(Object.entries(source).filter(([candidate]) => candidate !== key));
}

function scopeHash(scopes: unknown) {
  return metadataHash(normalizeMonitoringScopes(scopes)
    .map((scope) => ({ type: scope.type, id: scope.id, state: scope.state, label: scope.label }))
    .sort((left, right) => left.id.localeCompare(right.id)));
}

export function buildClerkAlertMetadataRepair(privateInput: unknown, publicInput: unknown) {
  const privateMetadata = record(privateInput);
  const publicMetadata = record(publicInput);
  const privateBytesBefore = jsonUtf8Bytes(privateMetadata);
  const publicBytesBefore = jsonUtf8Bytes(publicMetadata);
  const alertDelivery = record(privateMetadata.alertDelivery);
  const privatePatchRequired = privateBytesBefore >= CLERK_METADATA_REPAIR_THRESHOLD_BYTES
    && Object.keys(alertDelivery).length > 0;
  const nextPrivateMetadata = privatePatchRequired
    ? { ...privateMetadata, alertDelivery: compactClerkAlertDelivery(alertDelivery) }
    : privateMetadata;

  const publicHasExplicitScopes = Array.isArray(publicMetadata.monitoringScopes);
  const explicitScopes = publicHasExplicitScopes
    ? monitoringScopesFromPreferences(publicMetadata.areaPreferences, publicMetadata.monitoringScopes)
    : [];
  const derivedScopes = monitoringScopesFromPreferences(publicMetadata.areaPreferences);
  const explicitScopeHash = scopeHash(explicitScopes);
  const derivedScopeHash = scopeHash(derivedScopes);
  const effectivePublicScopesBeforeHash = publicHasExplicitScopes ? explicitScopeHash : derivedScopeHash;
  const publicNearLimit = publicBytesBefore >= CLERK_METADATA_REPAIR_THRESHOLD_BYTES;
  const publicScopesRedundant = publicHasExplicitScopes
    && explicitScopeHash === derivedScopeHash;
  const compactedExplicitScopes = compactMonitoringScopesForMetadata(publicMetadata.areaPreferences, explicitScopes);
  const compactedExplicitResolved = monitoringScopesFromPreferences(
    publicMetadata.areaPreferences,
    compactedExplicitScopes,
  );
  const compactedExplicitScopeHash = scopeHash(compactedExplicitResolved);
  const compactedScopesPreserveIdentity = compactedExplicitScopeHash === explicitScopeHash;
  const publicPatchRequired = publicNearLimit
    && publicHasExplicitScopes
    && (publicScopesRedundant || compactedScopesPreserveIdentity);
  const compactedScopeValue = publicScopesRedundant ? null : compactedExplicitScopes;
  const publicPatch: JsonRecord = publicPatchRequired ? { monitoringScopes: compactedScopeValue } : {};
  const nextPublicMetadata = publicPatchRequired
    ? { ...publicMetadata, monitoringScopes: compactedScopeValue }
    : publicMetadata;
  const nextPublicBytes = jsonUtf8Bytes(nextPublicMetadata);
  const blockedReason = publicNearLimit && !publicPatchRequired
    ? "public_monitoring_scopes_not_compactable"
    : publicNearLimit && nextPublicBytes >= CLERK_METADATA_REPAIR_THRESHOLD_BYTES
      ? "public_metadata_remains_near_limit"
      : "";
  const effectivePublicScopesAfterHash = publicPatchRequired
    ? publicScopesRedundant ? derivedScopeHash : compactedExplicitScopeHash
    : effectivePublicScopesBeforeHash;
  const unrelatedPrivateBefore = withoutKey(privateMetadata, "alertDelivery");
  const unrelatedPrivateAfter = withoutKey(nextPrivateMetadata, "alertDelivery");

  return {
    eligible: (privatePatchRequired || publicPatchRequired) && !blockedReason,
    blockedReason,
    privatePatchRequired,
    publicPatchRequired,
    privatePatch: privatePatchRequired ? { alertDelivery: nextPrivateMetadata.alertDelivery } : {},
    publicPatch,
    nextPrivateMetadata,
    nextPublicMetadata,
    privateBytesBefore,
    privateBytesAfter: jsonUtf8Bytes(nextPrivateMetadata),
    publicBytesBefore,
    publicBytesAfter: nextPublicBytes,
    unrelatedPrivateHashBefore: metadataHash(unrelatedPrivateBefore),
    unrelatedPrivateHashAfter: metadataHash(unrelatedPrivateAfter),
    effectivePublicScopesBeforeHash,
    effectivePublicScopesAfterHash,
  };
}

export function publicRepairMatchesPlan(currentPublicMetadata: unknown, plan: {
  publicPatchRequired: boolean;
  publicPatch: Record<string, unknown> | null;
  effectivePublicScopesBeforeHash: string;
}) {
  if (!plan.publicPatchRequired) return true;
  const current = record(currentPublicMetadata);
  const expectedPatch = record(plan.publicPatch);
  const effectiveScopes = monitoringScopesFromPreferences(current.areaPreferences, current.monitoringScopes);
  const monitoringScopesMatch = expectedPatch.monitoringScopes === null
    ? current.monitoringScopes == null
    : JSON.stringify(canonical(current.monitoringScopes)) === JSON.stringify(canonical(expectedPatch.monitoringScopes));
  return jsonUtf8Bytes(current) < CLERK_METADATA_REPAIR_THRESHOLD_BYTES
    && monitoringScopesMatch
    && scopeHash(effectiveScopes) === plan.effectivePublicScopesBeforeHash;
}
