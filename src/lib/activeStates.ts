export const ACTIVE_ENGINE_STATE_CODES = [
  "NC",
  "VA",
  "PA",
  "OH",
  "IA",
  "ID",
  "AL",
  "IL",
  "IN",
  "TN",
  "UT",
  "MD-MONTGOMERY",
] as const;

export type ActiveEngineStateCode = (typeof ACTIVE_ENGINE_STATE_CODES)[number];

export const ACTIVE_ENGINE_STATE_NAMES: Record<ActiveEngineStateCode, string> = {
  NC: "North Carolina",
  VA: "Virginia",
  PA: "Pennsylvania",
  OH: "Ohio",
  IA: "Iowa",
  ID: "Idaho",
  AL: "Alabama",
  IL: "Illinois",
  IN: "Indiana",
  TN: "Tennessee",
  UT: "Utah",
  "MD-MONTGOMERY": "Montgomery County, MD",
};

export function getActiveEngineStateName(code: string) {
  return (ACTIVE_ENGINE_STATE_NAMES as Record<string, string>)[code] || code;
}
