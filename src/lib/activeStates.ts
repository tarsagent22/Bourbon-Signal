import { STATE_LIFECYCLE_CONFIG } from "@/config/stateLifecycle";

type StateLifecycleEntry = {
  customerLabel?: string;
  sourceLabel?: string;
  customerAreaLabel?: string;
  areaOptions?: readonly string[];
  publicStatus?: string;
  lifecycle?: string;
  coverageTier?: string;
  refinementLevel?: string;
  inventoryAlertable?: boolean;
  watchAlertable?: boolean;
  customerSummary?: string;
};

const config = STATE_LIFECYCLE_CONFIG as unknown as {
  activeStates: readonly string[];
  states: Record<string, StateLifecycleEntry>;
};

export const ACTIVE_ENGINE_STATE_CODES = [...config.activeStates];
export type ActiveEngineStateCode = string;

export const ACTIVE_ENGINE_STATE_METADATA = config.states;

export const ACTIVE_ENGINE_STATE_NAMES: Record<string, string> = Object.fromEntries(
  ACTIVE_ENGINE_STATE_CODES.map((code) => [code, config.states[code]?.customerLabel || code])
);

export function getActiveEngineStateName(code: string) {
  return config.states[code]?.customerLabel || code;
}

export function getActiveEngineStateSourceName(code: string) {
  return config.states[code]?.sourceLabel || getActiveEngineStateName(code);
}

export function getActiveEngineStateAreaLabel(code: string) {
  return config.states[code]?.customerAreaLabel || null;
}

export function getActiveEngineStateAreaOptions(code: string) {
  return config.states[code]?.areaOptions ? [...config.states[code].areaOptions] : [];
}

export function getActiveEngineStateRefinementLevel(code: string) {
  return config.states[code]?.refinementLevel || "statewide";
}

export function getActiveEngineStateSummary(code: string) {
  return config.states[code]?.customerSummary || null;
}
