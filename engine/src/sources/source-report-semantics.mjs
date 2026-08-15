const NON_REACHABILITY_SIGNAL_TYPES = new Set([
  'costco_item_watchlist',
  'skipped_precision_probe_only',
]);

export function sourceReportCountsTowardReachability(source = {}) {
  return source.ok === true
    && source.reachabilityEligible !== false
    && source.contentType !== 'precision-probe-only'
    && !NON_REACHABILITY_SIGNAL_TYPES.has(String(source.signalType || ''));
}

export function sourceReportProvesMonitoredNoInventory(source = {}) {
  return sourceReportCountsTowardReachability(source)
    && source.zeroOutputExpected === true
    && source.signalType === 'costco_warehouse_no_current_inventory';
}

export function sourceReportCountsTowardSignalProduction(source = {}) {
  return sourceReportCountsTowardReachability(source)
    && source.signalProducingEligible !== false
    && !sourceReportProvesMonitoredNoInventory(source);
}
