import { STATE_LIFECYCLE_CONFIG } from "../config/stateLifecycle.ts";
import { locationMatchKeys } from "./location-normalization.ts";

type AreaState = { areaOptions?: readonly string[] };

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
