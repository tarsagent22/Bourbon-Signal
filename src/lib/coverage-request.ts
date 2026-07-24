import { US_STATE_OPTIONS, coverageTargetToken } from "./coverage-model.ts";

export type CoverageRequestTargetType = "state" | "city" | "store";
export type CoverageRequestStatus = "requested" | "on_radar" | "improved" | "closed";

export interface MatchedCoverageStore {
  id: string;
  name: string;
  city?: string;
  address?: string;
}

export interface NormalizedCoverageRequestTarget {
  targetType: CoverageRequestTargetType;
  stateCode: string;
  areaKey: string | null;
  areaLabel: string;
  storeId: string | null;
  storeName: string | null;
  storeAddress: string | null;
  canonicalTargetKey: string;
  notificationEnabled: boolean;
  baselineCoverageFingerprint: string;
}

export interface MemberCoverageRequest extends NormalizedCoverageRequestTarget {
  id: string;
  status: CoverageRequestStatus;
  requestedAt: string;
  updatedAt: string;
}

export class CoverageRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoverageRequestValidationError";
  }
}

function sourceRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sanitizedText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function validState(value: unknown) {
  const code = sanitizedText(value, 2).toUpperCase();
  const state = US_STATE_OPTIONS.find((option) => option.code === code);
  if (!state) throw new CoverageRequestValidationError("Choose a valid U.S. state.");
  return state;
}

function targetType(value: unknown): CoverageRequestTargetType {
  if (value === "state" || value === "city" || value === "store") return value;
  throw new CoverageRequestValidationError("Choose state, city, or store coverage.");
}

export function normalizeCoverageRequestTarget(
  input: unknown,
  context: {
    baselineCoverageFingerprint: string;
    matchedStore?: MatchedCoverageStore | null;
    matchedAreaLabel?: string | null;
  },
): NormalizedCoverageRequestTarget {
  const source = sourceRecord(input);
  const type = targetType(source.targetType);
  const state = validState(source.stateCode);
  const baselineCoverageFingerprint = sanitizedText(context.baselineCoverageFingerprint, 240);
  if (!baselineCoverageFingerprint) throw new CoverageRequestValidationError("Current coverage context is unavailable.");
  const notificationEnabled = source.notificationEnabled === true;

  if (type === "state") {
    return {
      targetType: type,
      stateCode: state.code,
      areaKey: null,
      areaLabel: state.name,
      storeId: null,
      storeName: null,
      storeAddress: null,
      canonicalTargetKey: `state:${state.code}`,
      notificationEnabled,
      baselineCoverageFingerprint,
    };
  }

  if (type === "city") {
    const areaLabel = sanitizedText(context.matchedAreaLabel || source.areaLabel || source.manualCity, 120);
    const areaKey = coverageTargetToken(areaLabel, 80);
    if (!areaLabel || areaLabel.length < 2 || !areaKey) {
      throw new CoverageRequestValidationError("Enter a city or area.");
    }
    return {
      targetType: type,
      stateCode: state.code,
      areaKey,
      areaLabel,
      storeId: null,
      storeName: null,
      storeAddress: null,
      canonicalTargetKey: `city:${state.code}:${areaKey}`,
      notificationEnabled,
      baselineCoverageFingerprint,
    };
  }

  const requestedStoreId = sanitizedText(source.storeId, 160);
  if (requestedStoreId) {
    const matched = context.matchedStore;
    if (!matched || matched.id !== requestedStoreId) {
      throw new CoverageRequestValidationError("Choose a store from the current directory.");
    }
    const storeName = sanitizedText(matched.name, 180);
    const city = sanitizedText(matched.city, 120);
    if (!storeName) throw new CoverageRequestValidationError("The selected store is missing a name.");
    return {
      targetType: type,
      stateCode: state.code,
      areaKey: city ? coverageTargetToken(city, 80) : null,
      areaLabel: city || state.name,
      storeId: requestedStoreId,
      storeName,
      storeAddress: sanitizedText(matched.address, 220) || null,
      canonicalTargetKey: `store:${state.code}:${coverageTargetToken(requestedStoreId, 120)}`,
      notificationEnabled,
      baselineCoverageFingerprint,
    };
  }

  const storeName = sanitizedText(source.manualStoreName || source.storeName, 180);
  const city = sanitizedText(source.manualCity || source.areaLabel, 120);
  const address = sanitizedText(source.manualAddress || source.storeAddress, 220);
  if (storeName.length < 2) throw new CoverageRequestValidationError("Enter the store name.");
  const cityKey = coverageTargetToken(city, 80);
  const storeKey = coverageTargetToken(storeName, 80);
  if (!storeKey) throw new CoverageRequestValidationError("Enter a valid store name.");
  return {
    targetType: type,
    stateCode: state.code,
    areaKey: cityKey || null,
    areaLabel: city || state.name,
    storeId: null,
    storeName,
    storeAddress: address || null,
    canonicalTargetKey: `store:${state.code}:manual:${cityKey || "unspecified"}:${storeKey}`.slice(0, 180),
    notificationEnabled,
    baselineCoverageFingerprint,
  };
}
