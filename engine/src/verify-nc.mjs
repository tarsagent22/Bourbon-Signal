import { readFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('out');

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

async function main() {
  const snapshot = await readJson(path.join(OUT, 'current-snapshot.json'));
  const stats = await readJson(path.join(OUT, 'site', 'stats.json'));
  const nc = await readJson(path.join(OUT, 'site', 'nc-intelligence.json'));
  const drops = await readJson(path.join(OUT, 'site', 'drops.json'));
  const events = await readJson(path.join(OUT, 'site', 'events.json'));
  const locations = await readJson(path.join(OUT, 'site', 'locations.json'));
  const ncStateReport = await readJson(path.join(OUT, 'states', 'NC.json'));

  assert(nc.contractVersion === 'bourbon-signal-site-v0.1', `Unexpected NC contract version: ${nc.contractVersion}`);
  assert(/official\/public online sources only/i.test(String(nc.sourcePolicy || '')), 'NC official/public source policy is missing');
  assert(stats.ncBoardIntelligence?.boardCount >= 170, 'NC board coverage below threshold', stats.ncBoardIntelligence);
  assert(nc.coverage?.boardCount >= 170, 'NC intelligence board coverage below threshold', nc.coverage);
  assert(nc.coverage?.withTrackedShipments >= 100, 'NC tracked-shipment board coverage below threshold', nc.coverage);
  assert(nc.coverage?.withInventoryPages >= 5, 'NC inventory/product/release page coverage below threshold', nc.coverage);
  assert(nc.coverage?.withReleasePages >= 10, 'NC release/lottery/barrel page coverage below threshold', nc.coverage);
  assert((nc.signalCounts?.nc_board_shipment_snapshot || 0) >= 500, 'NC board shipment signal count below threshold', nc.signalCounts);
  assert((nc.signalCounts?.nc_statewide_warehouse_stock || 0) >= 1, 'NC positive warehouse radar is missing', nc.signalCounts);

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
  const unsafeAggregate = ncSignals.filter((s) => s.canAlertAsInventory && s.locationPrecision !== 'store_level');
  assert(!unsafeAggregate.length, 'NC aggregate board/warehouse signals must not be inventory-alertable', unsafeAggregate.slice(0, 10));

  const ncEvents = (events.events || []).filter((event) => event.state === 'NC');
  const ncLocations = (locations.locations || []).filter((location) => location.state === 'NC');
  assert(ncDrops.length >= 500, 'NC site drops below threshold', ncDrops.length);
  assert(ncEvents.length >= 20, 'NC site events/release-watch rows below threshold', ncEvents.length);
  assert(ncLocations.length >= 600, 'NC site locations below threshold', ncLocations.length);

  console.log(`NC verified: ${nc.coverage.boardCount} boards, ${nc.coverage.withTrackedShipments} boards with tracked shipments, ${nc.coverage.withInventoryPages} inventory/product pages, ${nc.coverage.withReleasePages} release pages, ${nc.signalCounts.nc_board_shipment_snapshot} shipment signals, ${nc.signalCounts.nc_statewide_warehouse_stock} warehouse stock signals, ${ncDrops.length} site drops, ${ncEvents.length} site events, ${ncLocations.length} locations, ${actionableRoadblocks.length} actionable roadblocks (${nc.roadblockCount || 0} raw).`);
}

main().catch((error) => {
  console.error(error.message || error);
  if (error.detail) console.error(JSON.stringify(error.detail, null, 2));
  process.exit(1);
});
