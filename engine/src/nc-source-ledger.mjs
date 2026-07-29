function normalizeBoard(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function boardIdFromNotes(notes = '') {
  return String(notes || '').match(/\bboard (?:option )?id\s+(\d+)\b/i)?.[1] || null;
}

function storeBoardName(notes = '') {
  return String(notes || '').match(/\bfor (.+? ABC (?:Board|Commission)) \(board id\b/i)?.[1] || null;
}

function unique(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function hasCapability(board, pattern) {
  return (board?.capabilities || []).some((capability) => pattern.test(String(capability || '')));
}

function successfulPages(board) {
  return (board?.officialPageReports || []).filter((report) => Number(report?.status) >= 200 && Number(report?.status) < 300);
}

function qualificationFor(board, officialStoreCount) {
  const directInventory = hasCapability(board, /store_level_probe_attached|store_inventory_search_attached|suitecommerce_pickup_inventory_attached|powerbi_store_inventory_attached/i);
  const trackedShipments = Number(board?.trackedShipmentRows || 0) > 0;
  const releaseSurface = hasCapability(board, /lottery|release|drop|allocation|barrel/i);
  if (directInventory) return 'direct_inventory_monitored';
  if (officialStoreCount === 1 && trackedShipments) return 'single_store_board_shipment_intelligence';
  if (trackedShipments) return 'board_shipment_intelligence';
  if (releaseSurface) return 'official_release_watch';
  if (board?.website) return 'official_board_website_watch';
  return 'official_directory_only';
}

function cadenceFor(qualification) {
  if (qualification === 'direct_inventory_monitored') return 'hourly';
  if (qualification === 'single_store_board_shipment_intelligence' || qualification === 'board_shipment_intelligence' || qualification === 'official_release_watch') return 'daily';
  if (qualification === 'official_board_website_watch') return 'weekly';
  return 'quarterly_directory_verification';
}

function nextActionFor(qualification) {
  if (qualification === 'direct_inventory_monitored') return 'Measure exact-store freshness and reliability; promote to alerts only when the current-inventory policy passes.';
  if (qualification === 'single_store_board_shipment_intelligence') return 'Retain official shipment evidence as store-equivalent shipment intelligence only; do not treat it as shelf inventory.';
  if (qualification === 'board_shipment_intelligence') return 'Discover a compliant official exact-store inventory or release surface while retaining board shipment semantics.';
  if (qualification === 'official_release_watch') return 'Add a fixture-backed parser only when the official page publishes product-specific dated evidence.';
  if (qualification === 'official_board_website_watch') return 'Probe official inventory, allocation, lottery, release, RSS, sitemap, and structured-data routes.';
  return 'Locate and verify an official board website or first-party public data surface.';
}

function storesByOfficialBoard(activeOfficialLocations = []) {
  const storesByBoard = new Map();
  for (const store of activeOfficialLocations.filter((location) => location?.state === 'NC' && location?.source === 'NC ABC Commission store locator' && location?.searchable !== false)) {
    const key = normalizeBoard(storeBoardName(store.notes));
    if (!key) continue;
    const stores = storesByBoard.get(key) || [];
    stores.push(store);
    storesByBoard.set(key, stores);
  }
  return storesByBoard;
}

export function enrichNcSingleStoreShipmentSignals(signals = [], activeOfficialLocations = []) {
  const storesByBoard = storesByOfficialBoard(activeOfficialLocations);
  return signals.map((signal) => {
    if (signal?.state !== 'NC' || signal?.eventType !== 'nc_board_shipment_snapshot') return signal;
    const stores = storesByBoard.get(normalizeBoard(signal.locationName || signal.boardName));
    if (stores?.length !== 1) return signal;
    const store = stores[0];
    const boardShipmentQuantity = Number.isFinite(Number(signal.quantity)) ? Number(signal.quantity) : null;
    return {
      ...signal,
      boardName: signal.boardName || signal.locationName || null,
      locationPrecision: 'store_equivalent_shipment',
      locationName: store.name || signal.locationName,
      storeId: store.id || null,
      storeName: store.name || null,
      storeAddress: store.address || null,
      city: store.city || signal.city || null,
      postalCode: store.zip || signal.postalCode || null,
      zip: store.zip || signal.zip || null,
      quantity: null,
      boardShipmentQuantity,
      shipmentStoreEquivalent: true,
      sourceAvailabilityVerified: false,
      canAlertAsInventory: false,
      canAlertAsWatch: false,
      alertable: false,
      inventorySemantics: 'Official shipment intelligence for a board with exactly one official store; geographically store-equivalent, but not current shelf inventory or alert-grade availability.',
      raw: {
        ...(signal.raw || {}),
        shipmentScope: 'single_store_board_shipment_not_shelf_inventory',
        boardShipmentQuantity,
        shipmentStoreEquivalent: true,
      },
    };
  });
}

export function buildNcSourceLedger(activeOfficialLocations = [], ncIntelligenceRaw = null) {
  const officialBoards = activeOfficialLocations.filter((location) => location?.state === 'NC' && location?.source === 'NC ABC Commission board list');
  const officialStores = activeOfficialLocations.filter((location) => location?.state === 'NC' && location?.source === 'NC ABC Commission store locator' && location?.searchable !== false);
  const intelligenceByBoard = new Map((ncIntelligenceRaw?.boards || []).map((board) => [normalizeBoard(board.boardName), board]));
  const storesByBoard = new Map();

  for (const store of officialStores) {
    const key = normalizeBoard(storeBoardName(store.notes));
    if (!key) continue;
    const stores = storesByBoard.get(key) || [];
    stores.push({ id: store.id || null, name: store.name || null, address: store.address || null, city: store.city || null, zip: store.zip || null });
    storesByBoard.set(key, stores);
  }

  const boards = officialBoards.map((officialBoard) => {
    const key = normalizeBoard(officialBoard.name);
    const intelligence = intelligenceByBoard.get(key) || { boardName: officialBoard.name, capabilities: [], officialPageReports: [] };
    const stores = storesByBoard.get(key) || [];
    const qualification = qualificationFor(intelligence, stores.length);
    const pages = successfulPages(intelligence);
    const hasCurrentEvidence = pages.length > 0 || Number(intelligence.trackedShipmentRows || 0) > 0;
    const supportingEvidenceHealth = hasCurrentEvidence
      ? 'healthy'
      : intelligence.website
        ? 'watch_only'
        : 'directory_only';
    const health = qualification === 'direct_inventory_monitored'
      ? 'monitored_unverified'
      : supportingEvidenceHealth;
    return {
      boardId: boardIdFromNotes(officialBoard.notes),
      boardName: officialBoard.name,
      officialDirectoryUrl: officialBoard.sourceUrl || 'https://abc2.nc.gov/Search/ABCStoreLocator',
      officialWebsite: intelligence.website || null,
      officialSourceUrls: unique([
        intelligence.website,
        ...(intelligence.sourceUrls || []),
        ...(intelligence.officialPageReports || []).map((report) => report?.url),
      ]),
      officialStoreCount: stores.length,
      representedStores: stores,
      evidenceClass: qualification,
      qualification,
      expectedCadence: cadenceFor(qualification),
      health,
      supportingEvidenceHealth,
      lastSuccessfulRetrievalAt: qualification === 'direct_inventory_monitored'
        ? null
        : hasCurrentEvidence
          ? (ncIntelligenceRaw?.generatedAt || null)
          : (officialBoard.lastVerifiedAt || null),
      lastSuccessfulSupportingEvidenceAt: hasCurrentEvidence ? (ncIntelligenceRaw?.generatedAt || null) : (officialBoard.lastVerifiedAt || null),
      trackedShipmentRows: Number(intelligence.trackedShipmentRows || 0),
      capabilities: unique(intelligence.capabilities || []),
      canAlertAsInventory: false,
      nextAction: nextActionFor(qualification),
    };
  }).sort((left, right) => left.boardName.localeCompare(right.boardName));

  return {
    contractVersion: 'bourbon-signal-nc-source-ledger-v1',
    generatedAt: ncIntelligenceRaw?.generatedAt || null,
    sourcePolicy: ncIntelligenceRaw?.sourcePolicy || 'Official/public first-party sources only.',
    boardCount: boards.length,
    boards,
  };
}
