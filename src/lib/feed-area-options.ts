import { STATE_LIFECYCLE_CONFIG } from "../config/stateLifecycle.ts";
import { demandMetroAreaLabel } from "./demand-metro-areas.ts";
import { locationLabelsMatch, locationMatchKeys, normalizeLocationText } from "./location-normalization.ts";

type AreaState = { areaOptions?: readonly string[] };
type DropFeedAreaRequest = { key: "area" | "store"; value: string };

export function getCoveredAreaOptionsForState(state?: string | null) {
  const stateCode = String(state || "").trim().toUpperCase();
  if (!stateCode) return [];
  const states = STATE_LIFECYCLE_CONFIG.states as Record<string, AreaState>;
  return states[stateCode]?.areaOptions ? [...states[stateCode].areaOptions] : [];
}

export function coveredAreaLabelsMatch(a?: string | null, b?: string | null) {
  const aKeys = locationMatchKeys(a);
  const bKeys = locationMatchKeys(b);
  return aKeys.some((left) => bKeys.some((right) => left === right));
}

function areaQueryFromFilter(value?: string | null) {
  if (!value || value === "ALL") return "";
  const [, ...parts] = value.split("::");
  return (parts.join("::") || value).trim();
}

export function buildDropFeedAreaRequest(state?: string | null, filterValue?: string | null): DropFeedAreaRequest | null {
  const stateCode = String(state || "").trim().toUpperCase();
  const value = areaQueryFromFilter(filterValue);
  if (!stateCode || !value) return null;

  const canonicalMetro = demandMetroAreaLabel(stateCode);
  const isCanonicalMetro = Boolean(
    canonicalMetro
    && normalizeLocationText(value) === normalizeLocationText(canonicalMetro),
  );
  const usesCanonicalAreaQuery = ["CA", "NV", "NY", "CO"].includes(stateCode)
    || (["NC", "GA", "TN"].includes(stateCode) && isCanonicalMetro);
  return { key: usesCanonicalAreaQuery ? "area" : "store", value };
}

function storeQueryNeedles(value: string) {
  return Array.from(new Set(
    [
      value,
      value.replace(/\s+abc\s+board$/i, ""),
      value.replace(/\s+county\s+abc\s+board$/i, " county"),
    ]
      .map((item) => item.toLowerCase().trim())
      .filter(Boolean),
  ));
}

export function dropFeedStoreQueryMatches({
  state,
  query,
  isBoardLevel = false,
  fields,
}: {
  state?: string | null;
  query: string;
  isBoardLevel?: boolean;
  fields: readonly unknown[];
}) {
  const value = query.trim().toLowerCase();
  if (!value) return true;
  const allowBoardLevel = String(state || "").toUpperCase() === "NC" || /\b(board|abc)\b/i.test(value);
  if (isBoardLevel && !allowBoardLevel) return false;
  return storeQueryNeedles(value).some((needle) =>
    fields.some((field) => typeof field === "string" && locationLabelsMatch(field, needle)),
  );
}
