export const COSTCO_SPIRITS_ELIGIBLE_STATES = new Set(['AL', 'IA', 'IL', 'IN', 'KY', 'SC']);

export const COSTCO_SPIRITS_INELIGIBLE_ACTIVE_STATES = {
  NC: 'Costco does not provide a useful spirits/bourbon retail path in North Carolina; ABC boards control spirits sales.',
  VA: 'Costco does not provide a useful spirits/bourbon retail path in Virginia; Virginia ABC controls spirits sales.',
  PA: 'Costco does not sell spirits through a useful bourbon retail path in Pennsylvania; FWGS/PLCB controls spirits sales.',
  ID: 'Costco does not provide a useful spirits/bourbon retail path in Idaho; state liquor stores control spirits sales.',
  TN: 'Costco is not a useful spirits/bourbon source in Tennessee for this rollout; keep Tennessee on existing retailer sources.',
  'MD-MONTGOMERY': 'Costco is not a useful bourbon source for current Montgomery County ABS coverage.'
};

export function isCostcoSpiritsEligibleState(state) {
  return COSTCO_SPIRITS_ELIGIBLE_STATES.has(String(state || '').toUpperCase());
}

export function costcoSourceForState(state) {
  if (!isCostcoSpiritsEligibleState(state)) return null;
  return {
    kind: 'costco',
    url: 'engine/data/costco-bourbon-watchlist.json',
    label: 'Costco warehouse bourbon item-number watchlist',
    precisionOnly: true,
    signalType: 'costco_warehouse_inventory',
    retailer: 'Costco',
    spiritsEligible: true
  };
}
