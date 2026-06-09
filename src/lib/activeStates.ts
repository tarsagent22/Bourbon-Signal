export const ACTIVE_ENGINE_STATE_CODES = ["AL", "IL", "IN", "NC", "OH", "PA", "TN", "VA"] as const;

export const ACTIVE_ENGINE_STATE_NAMES: Record<(typeof ACTIVE_ENGINE_STATE_CODES)[number], string> = {
  AL: "Alabama",
  IL: "Illinois",
  IN: "Indiana",
  NC: "North Carolina",
  OH: "Ohio",
  PA: "Pennsylvania",
  TN: "Tennessee",
  VA: "Virginia",
};
