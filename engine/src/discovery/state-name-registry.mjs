export const STATE_NAME_REGISTRY = Object.freeze({
  AL: { name: 'Alabama', aliases: [] },
  AK: { name: 'Alaska', aliases: [] },
  AZ: { name: 'Arizona', aliases: [] },
  AR: { name: 'Arkansas', aliases: [] },
  CA: { name: 'California', aliases: [] },
  CO: { name: 'Colorado', aliases: [] },
  CT: { name: 'Connecticut', aliases: [] },
  DE: { name: 'Delaware', aliases: [] },
  FL: { name: 'Florida', aliases: [] },
  GA: { name: 'Georgia', aliases: [] },
  HI: { name: 'Hawaii', aliases: [] },
  ID: { name: 'Idaho', aliases: [] },
  IL: { name: 'Illinois', aliases: [] },
  IN: { name: 'Indiana', aliases: [] },
  IA: { name: 'Iowa', aliases: [] },
  KS: { name: 'Kansas', aliases: [] },
  KY: { name: 'Kentucky', aliases: [] },
  LA: { name: 'Louisiana', aliases: [] },
  ME: { name: 'Maine', aliases: [] },
  MD: { name: 'Maryland', aliases: [] },
  MA: { name: 'Massachusetts', aliases: [] },
  MI: { name: 'Michigan', aliases: [] },
  MN: { name: 'Minnesota', aliases: [] },
  MS: { name: 'Mississippi', aliases: [] },
  MO: { name: 'Missouri', aliases: [] },
  MT: { name: 'Montana', aliases: [] },
  NE: { name: 'Nebraska', aliases: [] },
  NV: { name: 'Nevada', aliases: [] },
  NH: { name: 'New Hampshire', aliases: [] },
  NJ: { name: 'New Jersey', aliases: [] },
  NM: { name: 'New Mexico', aliases: [] },
  NY: { name: 'New York', aliases: [] },
  NC: { name: 'North Carolina', aliases: [] },
  ND: { name: 'North Dakota', aliases: [] },
  OH: { name: 'Ohio', aliases: [] },
  OK: { name: 'Oklahoma', aliases: [] },
  OR: { name: 'Oregon', aliases: [] },
  PA: { name: 'Pennsylvania', aliases: ['Commonwealth of Pennsylvania'] },
  RI: { name: 'Rhode Island', aliases: [] },
  SC: { name: 'South Carolina', aliases: [] },
  SD: { name: 'South Dakota', aliases: [] },
  TN: { name: 'Tennessee', aliases: [] },
  TX: { name: 'Texas', aliases: [] },
  UT: { name: 'Utah', aliases: [] },
  VT: { name: 'Vermont', aliases: [] },
  VA: { name: 'Virginia', aliases: ['Commonwealth of Virginia'] },
  WA: { name: 'Washington', aliases: [] },
  WV: { name: 'West Virginia', aliases: [] },
  WI: { name: 'Wisconsin', aliases: [] },
  WY: { name: 'Wyoming', aliases: [] },
});

export const ALL_STATE_IDS = Object.freeze(Object.keys(STATE_NAME_REGISTRY));

export function normalizeStateId(value) {
  const state = String(value || '').trim().toUpperCase();
  return STATE_NAME_REGISTRY[state] ? state : null;
}

export function getStateName(stateId) {
  const state = normalizeStateId(stateId);
  return state ? STATE_NAME_REGISTRY[state].name : null;
}

export function stateSearchTerms(stateId) {
  const state = normalizeStateId(stateId);
  if (!state) return [];
  return [STATE_NAME_REGISTRY[state].name, ...STATE_NAME_REGISTRY[state].aliases];
}

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stateMatchesText(stateId, value) {
  const text = String(value || '');
  const terms = stateSearchTerms(stateId);
  if (terms.some((term) => new RegExp(`\\b${escaped(term)}\\b`, 'i').test(text))) return true;
  const state = normalizeStateId(stateId);
  return Boolean(state && new RegExp(`(?:,|\\b)\\s*${state}\\s*(?:\\d{5}(?:-\\d{4})?\\b|,|$)`, 'i').test(text));
}
