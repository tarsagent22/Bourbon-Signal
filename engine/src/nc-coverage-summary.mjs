function normalizeBoard(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const NC_STOCK_SHIPPED_DATA_URL = 'https://abc2.nc.gov/Search/StockShippedData';
const MAX_CURRENT_SHIPMENT_AGE_MS = 36 * 60 * 60 * 1000;
const MAX_ISOLATED_NC_ROADBLOCKS = 5;

export function hasHealthyLowerVolumeShipmentRun(nc, shipmentSignals, now = Date.now()) {
  const stock = nc?.stockShipped || {};
  const observedAt = Date.parse(stock.observedAt || '');
  const observationAge = Number(now) - observedAt;
  const signalCount = Number(shipmentSignals || 0);
  return stock.sourceUrl === NC_STOCK_SHIPPED_DATA_URL
    && Number.isFinite(observedAt)
    && observationAge >= -10 * 60 * 1000
    && observationAge <= MAX_CURRENT_SHIPMENT_AGE_MS
    && signalCount >= 250
    && Number(stock.trackedSignalCount || 0) >= signalCount
    && Number(stock.controlledDistributionSignalCount || 0) >= 100
    && Number(stock.priceEnrichedSignalCount || 0) >= Math.floor(signalCount * 0.95)
    && Number(stock.recordCount || 0) >= 50_000
    && Number(stock.productCount || 0) >= 2_000
    && Number(stock.boardCount || 0) >= 170
    && Number(nc?.coverage?.withTrackedShipments || 0) >= 100
    && Number(nc?.roadblockCount || 0) <= MAX_ISOLATED_NC_ROADBLOCKS;
}

export function hasSafeScheduledPartialShipmentFallback(nc, stateReport, shipmentSignals, now = Date.now()) {
  const stock = nc?.stockShipped || {};
  const observedAt = Date.parse(stock.observedAt || '');
  const observationAge = Number(now) - observedAt;
  const signalCount = Number(shipmentSignals || 0);
  const boardCount = Number(nc?.coverage?.boardCount || stock.boardCount || 0);
  const trackedBoardCount = Number(nc?.coverage?.withTrackedShipments || 0);
  const signals = Array.isArray(stateReport?.signals) ? stateReport.signals : [];
  const retained = signals.filter((signal) => signal.sourceStale === true
    || signal.stale === true
    || signal.raw?.staleFallback === true);
  const current = signals.filter((signal) => signal.sourceStale !== true
    && signal.stale !== true
    && signal.raw?.staleFallback !== true);
  const retainedIsSafe = retained.length > 0 && retained.every((signal) => signal.canAlertAsInventory === false
    && signal.canAlertAsWatch === false
    && signal.alertable === false
    && signal.sourceAvailabilityVerified === false);

  return (stateReport?.partial === true || stateReport?.status === 'partial_useful_quality_fallback')
    && stateReport?.stale === false
    && current.length > 0
    && retainedIsSafe
    && stock.sourceUrl === NC_STOCK_SHIPPED_DATA_URL
    && Number.isFinite(observedAt)
    && observationAge >= -10 * 60 * 1000
    && observationAge <= MAX_CURRENT_SHIPMENT_AGE_MS
    && signalCount >= 200
    && Number(stock.trackedSignalCount || 0) >= signalCount
    && Number(stock.controlledDistributionSignalCount || 0) >= 100
    && Number(stock.priceEnrichedSignalCount || 0) >= Math.floor(signalCount * 0.95)
    && Number(stock.recordCount || 0) >= 50_000
    && Number(stock.productCount || 0) >= 2_000
    && boardCount >= 170
    && trackedBoardCount >= Math.max(90, Math.ceil(boardCount * 0.5))
    && Number(nc?.roadblockCount || 0) <= MAX_ISOLATED_NC_ROADBLOCKS;
}

export function buildNcBoardCoverageSummary(activeOfficialLocations = [], ncIntelligenceRaw = null) {
  if (!ncIntelligenceRaw) return null;

  const officialBoards = activeOfficialLocations.filter((location) => location.state === 'NC'
    && location.source === 'NC ABC Commission board list');
  const officialStores = activeOfficialLocations.filter((location) => location.state === 'NC'
    && location.source === 'NC ABC Commission store locator'
    && location.searchable !== false);
  const officialBoardNames = new Set(officialBoards.map((location) => normalizeBoard(location.name)).filter(Boolean));
  const trackedBoardNames = new Set((ncIntelligenceRaw.boards || [])
    .filter((board) => Number(board.trackedShipmentRows || 0) > 0)
    .map((board) => normalizeBoard(board.boardName))
    .filter((boardName) => officialBoardNames.has(boardName)));
  const storesByBoard = new Map();

  for (const location of officialStores) {
    const boardName = String(location.notes || '').match(/\bfor (.+? ABC (?:Board|Commission)) \(board id\b/i)?.[1];
    const boardKey = normalizeBoard(boardName);
    if (!boardKey) continue;
    const ids = storesByBoard.get(boardKey) || new Set();
    ids.add(String(location.id || `${location.address || ''}|${location.city || ''}`));
    storesByBoard.set(boardKey, ids);
  }

  const representedAreas = new Set(officialStores
    .flatMap((location) => [location.city, location.county])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean));

  return {
    boardCount: officialBoardNames.size,
    officialStoreCount: officialStores.length,
    representedAreaCount: representedAreas.size,
    boardsWithTrackedShipments: trackedBoardNames.size,
    singleStoreShipmentBoardCount: [...storesByBoard.entries()]
      .filter(([boardName, ids]) => ids.size === 1 && trackedBoardNames.has(boardName)).length,
    unresolvedShipmentBoardIdentityCount: Math.max(
      0,
      Number(ncIntelligenceRaw.coverage?.withTrackedShipments || 0) - trackedBoardNames.size,
    ),
    boardsWithWebsites: ncIntelligenceRaw.coverage?.withWebsite || 0,
    boardsWithReleasePages: ncIntelligenceRaw.coverage?.withReleasePages || 0,
    boardsWithInventoryPages: ncIntelligenceRaw.coverage?.withInventoryPages || 0,
    sourcePolicy: ncIntelligenceRaw.sourcePolicy,
  };
}
