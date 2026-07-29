function normalizeBoard(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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
