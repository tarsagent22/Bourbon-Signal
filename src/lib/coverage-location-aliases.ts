export interface CoverageAreaOption {
  value: string;
  label: string;
  searchText: string;
}

export interface CoverageRequestStoreAliasInput {
  stateCode: unknown;
  targetType: unknown;
  areaLabel?: unknown;
  county?: unknown;
  storeName?: unknown;
  address?: unknown;
}

export interface CoverageRequestStoreAliasPayload extends CoverageRequestStoreAliasInput {
  storeId?: unknown;
  manualCity?: unknown;
  manualCounty?: unknown;
  manualStoreName?: unknown;
  manualAddress?: unknown;
  storeAddress?: unknown;
}

export interface CoverageRequestStoreAlias {
  storeId: string;
  sourceStoreId: string;
  canonicalCity: string;
  displayArea: string;
}

const BALLSTON_STORE_49 = {
  storeId: "49",
  sourceStoreId: "49",
  canonicalCity: "Arlington",
  displayArea: "Ballston",
} as const;

function clean(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function token(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function coverageAreaOption(stateCode: string, city: string): CoverageAreaOption {
  const value = clean(city);
  if (stateCode.toUpperCase() === "VA" && token(value) === "arlington") {
    return { value, label: "Arlington (Ballston)", searchText: "Arlington Ballston" };
  }
  return { value, label: value, searchText: value };
}

function consistentPayloadField(...candidates: unknown[]) {
  const populated = candidates
    .map((candidate) => ({ raw: clean(candidate), normalized: token(candidate) }))
    .filter((candidate) => candidate.normalized);
  if (new Set(populated.map((candidate) => candidate.normalized)).size > 1) {
    return { valid: false, value: "" };
  }
  return { valid: true, value: populated[0]?.raw || "" };
}

export type CoverageRequestStoreAliasInspection =
  | { status: "matched"; alias: CoverageRequestStoreAlias }
  | { status: "conflict" }
  | { status: "unmatched" };

const STORE_49_NAME = /^(?:virginia )?abc store 0*49$/;
const STORE_49_SHORT_NAME = /^(?:virginia )?store 0*49$/;
const STORE_49_STREET = /^881 (?:n|north) quincy (?:st|street)(?: arlington (?:va|virginia)(?: 22203)?)?$/;
const STORE_49_FULL_ADDRESS = /^881 (?:n|north) quincy (?:st|street) arlington (?:va|virginia)(?: 22203)?$/;

export function inspectCoverageRequestStoreAliasPayload(
  input: CoverageRequestStoreAliasPayload,
): CoverageRequestStoreAliasInspection {
  if (clean(input.stateCode).toUpperCase() !== "VA" || input.targetType !== "store") {
    return { status: "unmatched" };
  }

  const areaField = consistentPayloadField(input.manualCity, input.areaLabel);
  const countyField = consistentPayloadField(input.manualCounty, input.county);
  const storeField = consistentPayloadField(input.manualStoreName, input.storeName);
  const addressField = consistentPayloadField(input.manualAddress, input.storeAddress, input.address);
  if (!areaField.valid || !countyField.valid || !storeField.valid || !addressField.valid) {
    return { status: "conflict" };
  }

  const suppliedStoreId = token(input.storeId);
  const area = token(areaField.value);
  const county = token(countyField.value);
  const store = token(storeField.value);
  const address = token(addressField.value);
  const storeIdMatches = suppliedStoreId === BALLSTON_STORE_49.storeId;
  const storeNameMatches = STORE_49_NAME.test(store) || STORE_49_SHORT_NAME.test(store);
  const areaMatches = area === "ballston" || area === "arlington";
  const countyMatches = county === "arlington" || county === "arlington county";
  const streetMatches = STORE_49_STREET.test(address);
  const fullAddressMatches = STORE_49_FULL_ADDRESS.test(address);
  const premisesMatches = fullAddressMatches || (areaMatches && streetMatches);
  const store49Candidate = storeIdMatches || storeNameMatches || premisesMatches;
  if (!store49Candidate) return { status: "unmatched" };
  if ((suppliedStoreId && !storeIdMatches) || (store && !storeNameMatches)) return { status: "conflict" };

  if (area && !areaMatches) return { status: "conflict" };
  if (county && !countyMatches) return { status: "conflict" };
  if (address && !(areaMatches ? streetMatches : fullAddressMatches)) return { status: "conflict" };
  if (!storeIdMatches && !areaMatches && !fullAddressMatches) return { status: "conflict" };

  return { status: "matched", alias: { ...BALLSTON_STORE_49 } };
}

export function resolveCoverageRequestStoreAlias(
  input: CoverageRequestStoreAliasInput,
): CoverageRequestStoreAlias | null {
  const inspection = inspectCoverageRequestStoreAliasPayload(input);
  return inspection.status === "matched" ? inspection.alias : null;
}

export function resolveCoverageRequestStoreAliasPayload(
  input: CoverageRequestStoreAliasPayload,
): CoverageRequestStoreAlias | null {
  const inspection = inspectCoverageRequestStoreAliasPayload(input);
  return inspection.status === "matched" ? inspection.alias : null;
}
