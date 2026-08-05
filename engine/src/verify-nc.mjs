import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateNcSingleStoreCoverage, validateNcSourceLedgerContract } from './nc-source-ledger.mjs';
import { hasHealthyLowerVolumeShipmentRun, hasSafeScheduledPartialShipmentFallback } from './nc-coverage-summary.mjs';

const OUT = path.resolve('out');
const allowSafePartialFallback = process.argv.includes('--allow-safe-partial-fallback');

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function assert(condition, message, detail = null) {
  if (!condition) {
    const error = new Error(message);
    error.detail = detail;
    throw error;
  }
}

function warn(condition, message, detail = null) {
  if (!condition) console.warn(`NC warning: ${message}${detail ? ` ${JSON.stringify(detail)}` : ''}`);
}

async function main() {
  const snapshot = await readJson(path.join(OUT, 'current-snapshot.json'));
  const stats = await readJson(path.join(OUT, 'site', 'stats.json'));
  const nc = await readJson(path.join(OUT, 'site', 'nc-intelligence.json'));
  const drops = await readJson(path.join(OUT, 'site', 'drops.json'));
  const events = await readJson(path.join(OUT, 'site', 'events.json'));
  const locations = await readJson(path.join(OUT, 'site', 'locations.json'));
  const ncStateReport = await readJson(path.join(OUT, 'states', 'NC.json'));
  const bible = await readJson(path.join(OUT, 'bourbon-bible.json'));
  const ncShipmentSignals = nc.signalCounts?.nc_board_shipment_snapshot || 0;
  const safeScheduledPartialFallback = allowSafePartialFallback
    && hasSafeScheduledPartialShipmentFallback(nc, ncStateReport, ncShipmentSignals);

  const henryMckenna = (bible.records || []).find((record) => record.canonical === 'Henry McKenna 10 Year');
  assert(henryMckenna, 'Henry McKenna 10 Year bible record is missing');
  assert((henryMckenna.aliases || []).includes('Henry McKenna Single Barrel'), 'NC Henry McKenna Single Barrel alias is missing from the allocated 10 Year record', henryMckenna);

  assert(nc.contractVersion === 'bourbon-signal-site-v0.1', `Unexpected NC contract version: ${nc.contractVersion}`);
  assert(/official\/public online sources only/i.test(String(nc.sourcePolicy || '')), 'NC official/public source policy is missing');
  assert(stats.ncBoardIntelligence?.boardCount >= 170, 'NC board coverage below threshold', stats.ncBoardIntelligence);
  assert(nc.coverage?.boardCount >= 170, 'NC intelligence board coverage below threshold', nc.coverage);
  assert(nc.coverage?.withTrackedShipments >= 100 || safeScheduledPartialFallback, 'NC tracked-shipment board coverage below threshold', nc.coverage);
  assert(nc.coverage?.withInventoryPages >= 5, 'NC inventory/product/release page coverage below threshold', nc.coverage);
  assert(nc.coverage?.withReleasePages >= 10, 'NC release/lottery/barrel page coverage below threshold', nc.coverage);
  assert(nc.sourceLedger?.contractVersion === 'bourbon-signal-nc-source-ledger-v1', 'NC operational source ledger is missing', nc.sourceLedger);
  const ledgerContractErrors = validateNcSourceLedgerContract(nc.sourceLedger);
  assert(ledgerContractErrors.length === 0, 'NC operational source ledger is incomplete', { errors: ledgerContractErrors, boardCount: nc.sourceLedger?.boardCount, rows: nc.sourceLedger?.boards?.length });
  assert((nc.sourceLedger.boards || []).every((board) => board.boardId && board.qualification && board.expectedCadence && board.health && board.nextAction), 'NC operational source ledger contains incomplete board rows');
  assert((nc.sourceLedger.boards || []).every((board) => board.canAlertAsInventory === false), 'Board-level source ledger must never claim inventory alertability');
  const singleStoreCoverageErrors = validateNcSingleStoreCoverage(nc.sourceLedger);
  assert(singleStoreCoverageErrors.length === 0, 'NC official single-store board coverage below threshold', { errors: singleStoreCoverageErrors });
  assert(ncShipmentSignals >= 400 || hasHealthyLowerVolumeShipmentRun(nc, ncShipmentSignals) || safeScheduledPartialFallback, 'NC board shipment signal count below source-volume-aware hard floor', { signalCounts: nc.signalCounts, stockShipped: nc.stockShipped, coverage: nc.coverage, roadblockCount: nc.roadblockCount });
  warn(ncShipmentSignals >= 400, 'official daily StockShipped extract is below the legacy 400-signal floor; treating as pass because the current official source volume, board breadth, product coverage, price enrichment, and roadblocks are healthy', { signalCounts: nc.signalCounts, stockShipped: nc.stockShipped, coverage: nc.coverage, roadblockCount: nc.roadblockCount });
  warn(ncShipmentSignals >= 500, 'official daily StockShipped extract is below the historical 500-signal target; treating as pass because board coverage/roadblocks remain healthy', nc.signalCounts);
  assert(nc.warehouse?.sourceUrl === 'https://abc2.nc.gov/StoresBoards/Stocks' && Number.isFinite(Date.parse(nc.warehouse?.observedAt || '')), 'NC warehouse radar observation metadata is missing', nc.warehouse);
  warn((nc.signalCounts?.nc_statewide_warehouse_stock || 0) >= 1, 'NC warehouse source returned no positive tracked rows in this observation; keeping the lane healthy but publishing no warehouse availability signal', nc.warehouse);

  const ncDrops = (drops.drops || []).filter((drop) => drop.state === 'NC');
  const highPointPowerBiDrops = ncDrops.filter((drop) => /High Point ABC public Power BI/i.test(String(drop.source || drop.sourceLabel || '')));
  const wakeDrops = ncDrops.filter((drop) => /Wake County ABC store inventory search/i.test(String(drop.source || drop.sourceLabel || '')));
  const actionableRoadblocks = (ncStateReport.roadblocks || []).filter((roadblock) => {
    const supersededHighPointShopifyProbe = /High Point ABC Shopify product suggestion API/i.test(String(roadblock.source || ''))
      && highPointPowerBiDrops.length >= 100;
    return !supersededHighPointShopifyProbe;
  });
  assert(actionableRoadblocks.length <= 5, `NC actionable roadblocks exceed threshold: ${actionableRoadblocks.length}`, actionableRoadblocks.slice(0, 10));
  assert(wakeDrops.length >= 100, 'Wake County ABC exact-store site drops below threshold', wakeDrops.length);

  const ncSignals = (snapshot.signals || []).filter((s) => s.state === 'NC');
  if (ncStateReport.partial === true || ncStateReport.status === 'partial_useful_quality_fallback') {
    const retained = (ncStateReport.signals || []).filter((signal) => signal.sourceStale === true || signal.raw?.staleFallback === true);
    const current = (ncStateReport.signals || []).filter((signal) => signal.sourceStale !== true && signal.stale !== true && signal.raw?.staleFallback !== true);
    assert(ncStateReport.stale === false, 'NC partial current-plus-stale report must not label current signals as wholly stale');
    assert(current.length > 0, 'NC partial current-plus-stale report must contain current source observations');
    assert(retained.length > 0, 'NC partial current-plus-stale report must contain retained context when a collapse occurred');
    assert(retained.every((signal) => signal.canAlertAsInventory === false && signal.canAlertAsWatch === false && signal.alertable === false && signal.sourceAvailabilityVerified === false), 'NC retained partial-context rows must remain fully non-alertable');
  }
  const ncCreamSignals = ncSignals.filter((s) => /nc_board_shipment_snapshot|nc_statewide_warehouse_stock/i.test(String(s.eventType || '')) && /cream|liqueur|cordial/i.test(String(s.rawName || s.canonicalName || '')));
  assert(!ncCreamSignals.length, 'NC tracked shipment/warehouse signals include non-bourbon cream/liqueur rows', ncCreamSignals.slice(0, 10));
  const unsafeAggregate = ncSignals.filter((s) => s.canAlertAsInventory && s.locationPrecision !== 'store_level');
  assert(!unsafeAggregate.length, 'NC aggregate board/warehouse signals must not be inventory-alertable', unsafeAggregate.slice(0, 10));

  const ncEvents = (events.events || []).filter((event) => event.state === 'NC');
  const ncLocations = (locations.locations || []).filter((location) => location.state === 'NC');
  assert(ncDrops.length >= 400 || (ncDrops.length >= 300 && (hasHealthyLowerVolumeShipmentRun(nc, ncShipmentSignals) || safeScheduledPartialFallback)), 'NC site drops below source-volume-aware hard floor', { drops: ncDrops.length, signalCounts: nc.signalCounts, stockShipped: nc.stockShipped, coverage: nc.coverage, roadblockCount: nc.roadblockCount });
  warn(ncDrops.length >= 400, 'NC site drops below legacy 400-row floor after official source-volume dip', { drops: ncDrops.length, signalCounts: nc.signalCounts });
  warn(ncDrops.length >= 500, 'NC site drops below historical 500-row target after official source-volume dip', ncDrops.length);
  assert(ncEvents.length >= 20, 'NC site events/release-watch rows below threshold', ncEvents.length);
  assert(ncLocations.length >= 600, 'NC site locations below threshold', ncLocations.length);

  console.log(`NC verified: ${nc.coverage.boardCount} boards, ${nc.coverage.withTrackedShipments} boards with tracked shipments, ${nc.coverage.withInventoryPages} inventory/product pages, ${nc.coverage.withReleasePages} release pages, ${nc.signalCounts.nc_board_shipment_snapshot} shipment signals, ${nc.signalCounts.nc_statewide_warehouse_stock || 0} warehouse stock signals, ${ncDrops.length} site drops, ${ncEvents.length} site events, ${ncLocations.length} locations, ${actionableRoadblocks.length} actionable roadblocks (${nc.roadblockCount || 0} raw).`);
}

main().catch((error) => {
  console.error(error.message || error);
  if (error.detail) console.error(JSON.stringify(error.detail, null, 2));
  process.exit(1);
});
