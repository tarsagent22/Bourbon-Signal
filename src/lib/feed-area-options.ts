import { STATE_LIFECYCLE_CONFIG } from "../config/stateLifecycle.ts";
import { demandMetroAreaLabel } from "./demand-metro-areas.ts";
import { canonicalNcAbcBoardPreference, NC_ABC_BOARD_OPTIONS, ncAbcBoardPreferencesMatch } from "./nc-abc-boards.ts";
import { locationLabelsMatch, locationMatchKeys, normalizeLocationText } from "./location-normalization.ts";
import { geographyState, listMonitoringStates } from "./geography-directory.ts";

type AreaState = { areaOptions?: readonly string[]; customerLabel?: string };
type AreaConfig = { activeStates: readonly string[]; states: Record<string, AreaState> };
type DropFeedAreaRequest = { key: "area" | "store"; value: string };

export interface SignalFeedAreaOption { value: string; label: string }
export interface SignalFeedStateOption {
  code: string;
  label: string;
  areaLabel: "Board" | "City";
  options: SignalFeedAreaOption[];
  monitoringLevels?: Array<"state" | "county" | "city" | "board" | "store">;
  engineCoverage?: "active" | "expanding";
}
export interface SignalFeedAreaDirectory { states: SignalFeedStateOption[] }

export function formatNcAbcAreaMenuLabel(label: string) {
  return /\bABC(?:\s+Commission)?$/i.test(label) ? label : `${label} ABC`;
}

export function getCoveredAreaOptionsForState(state?: string | null) {
  const stateCode = String(state || "").trim().toUpperCase();
  if (!stateCode) return [];
  const states = STATE_LIFECYCLE_CONFIG.states as Record<string, AreaState>;
  const configured = states[stateCode]?.areaOptions ? [...states[stateCode].areaOptions] : [];
  return stateCode === "NC"
    ? Array.from(new Set([...configured, ...NC_ABC_BOARD_OPTIONS]))
    : configured;
}

export function signalFeedAreaLabel(state?: string | null): "Board" | "City" {
  return String(state || "").trim().toUpperCase() === "NC" ? "Board" : "City";
}

export function buildSignalFeedAreaDirectory(): SignalFeedAreaDirectory {
  const config = STATE_LIFECYCLE_CONFIG as unknown as AreaConfig;
  const active = new Set(config.activeStates.map((code) => geographyState(code)?.state || code));
  return {
    states: listMonitoringStates()
      .map(({ code, name }) => ({
        code,
        label: config.states[code]?.customerLabel || name,
        areaLabel: signalFeedAreaLabel(code),
        monitoringLevels: code === "NC" ? ["state", "county", "city", "board", "store"] as SignalFeedStateOption["monitoringLevels"] : ["state", "county", "city", "store"] as SignalFeedStateOption["monitoringLevels"],
        engineCoverage: active.has(code) ? "active" as const : "expanding" as const,
        options: getCoveredAreaOptionsForState(code).map((value) => ({
          value,
          label: code === "NC" && NC_ABC_BOARD_OPTIONS.includes(value) ? formatNcAbcAreaMenuLabel(value) : value,
        })),
      }))
      .sort((left, right) => left.label.localeCompare(right.label)),
  };
}

export function coveredAreaLabelsMatch(a?: string | null, b?: string | null) {
  const aKeys = locationMatchKeys(a);
  const bKeys = locationMatchKeys(b);
  return aKeys.some((left) => bKeys.some((right) => left === right));
}

export function canonicalSignalFeedAreaSelection(state?: string | null, area?: string | null) {
  const stateCode = String(state || "").trim().toUpperCase();
  const requested = String(area || "").replace(/\s+/g, " ").trim();
  if (!stateCode || !requested || requested.length > 120 || !/^[A-Za-z0-9 .,'’&()/-]+$/.test(requested)) return null;
  if (stateCode === "NC") {
    const board = canonicalNcAbcBoardPreference(requested);
    if (board) return board;
  }
  const configured = getCoveredAreaOptionsForState(stateCode).find((option) => coveredAreaLabelsMatch(option, requested)
    || coveredAreaLabelsMatch(stateCode === "NC" ? formatNcAbcAreaMenuLabel(option) : option, requested));
  if (configured) return configured;
  const config = STATE_LIFECYCLE_CONFIG as unknown as AreaConfig;
  return stateCode !== "NC" && config.activeStates.includes(stateCode) ? requested : null;
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
  const configuredArea = getCoveredAreaOptionsForState(stateCode).some((option) => coveredAreaLabelsMatch(option, value));
  const usesCanonicalAreaQuery = (["CA", "NV", "NY", "CO"].includes(stateCode) && configuredArea)
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

export function dropFeedAreaSearchNeedles(area: string) {
  return storeQueryNeedles(area);
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
  if (String(state || "").toUpperCase() === "NC" && canonicalNcAbcBoardPreference(value)) {
    return ncAbcBoardPreferencesMatch(fields, [value]);
  }
  return storeQueryNeedles(value).some((needle) =>
    fields.some((field) => typeof field === "string" && locationLabelsMatch(field, needle)),
  );
}
