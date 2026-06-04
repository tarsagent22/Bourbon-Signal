import { readFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('out');

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function points(actual, target, weight) {
  if (!target) return 0;
  return Math.min(weight, (Number(actual || 0) / target) * weight);
}

function grade(score) {
  if (score >= 95) return 'excellent';
  if (score >= 88) return 'strong';
  if (score >= 78) return 'useful';
  if (score >= 65) return 'partial';
  return 'needs-work';
}

async function main() {
  const nc = await readJson(path.join(OUT, 'site', 'nc-intelligence.json'));
  const drops = await readJson(path.join(OUT, 'site', 'drops.json'));
  const events = await readJson(path.join(OUT, 'site', 'events.json'));
  const locations = await readJson(path.join(OUT, 'site', 'locations.json'));

  const ncDrops = (drops.drops || []).filter((drop) => drop.state === 'NC');
  const ncEvents = (events.events || []).filter((event) => event.state === 'NC');
  const ncLocations = (locations.locations || []).filter((location) => location.state === 'NC');
  const releasePages = Number(nc.coverage?.withReleasePages || 0);
  const inventoryPages = Number(nc.coverage?.withInventoryPages || 0);
  const trackedBoards = Number(nc.coverage?.withTrackedShipments || 0);
  const boardCount = Number(nc.coverage?.boardCount || 0);
  const shipmentSignals = Number(nc.signalCounts?.nc_board_shipment_snapshot || 0);
  const warehouseSignals = Number(nc.signalCounts?.nc_statewide_warehouse_stock || 0);
  const releaseSurfaceSignals = Object.entries(nc.signalCounts || {})
    .filter(([key]) => /release_surface|lottery_surface|barrel_pick_surface|release_page_match|inventory_page_match/i.test(key))
    .reduce((sum, [, value]) => sum + Number(value || 0), 0);

  const rubric = [
    { label: 'Board directory breadth', actual: boardCount, target: 170, weight: 14, score: points(boardCount, 170, 14) },
    { label: 'Tracked shipment board reach', actual: trackedBoards, target: 125, weight: 18, score: points(trackedBoards, 125, 18) },
    { label: 'Tracked shipment signal depth', actual: shipmentSignals, target: 800, weight: 16, score: points(shipmentSignals, 800, 16) },
    { label: 'State warehouse radar', actual: warehouseSignals, target: 1, weight: 10, score: points(warehouseSignals, 1, 10) },
    { label: 'Inventory/product source surfaces', actual: inventoryPages, target: 5, weight: 11, score: points(inventoryPages, 5, 11) },
    { label: 'Release/lottery/barrel source surfaces', actual: releasePages, target: 10, weight: 12, score: points(releasePages, 10, 12) },
    { label: 'Public NC drops/actionable rows', actual: ncDrops.length, target: 900, weight: 9, score: points(ncDrops.length, 900, 9) },
    { label: 'Public NC event/watch rows', actual: ncEvents.length, target: 20, weight: 6, score: points(ncEvents.length, 20, 6) },
    { label: 'NC locations exposed', actual: ncLocations.length, target: 700, weight: 4, score: points(ncLocations.length, 700, 4) }
  ];

  let score = rubric.reduce((sum, item) => sum + item.score, 0);
  const roadblocks = Number(nc.roadblockCount || 0);
  const roadblockPenalty = roadblocks === 0 ? 0 : Math.min(6, roadblocks * 1.5);
  score = Math.max(0, Math.round((score - roadblockPenalty) * 10) / 10);

  const payload = {
    generatedAt: new Date().toISOString(),
    state: 'NC',
    score,
    grade: grade(score),
    roadblockPenalty,
    sourcePolicy: nc.sourcePolicy,
    summary: {
      boardCount,
      trackedBoards,
      shipmentSignals,
      warehouseSignals,
      inventoryPages,
      releasePages,
      releaseSurfaceSignals,
      publicDrops: ncDrops.length,
      publicEvents: ncEvents.length,
      publicLocations: ncLocations.length,
      roadblocks
    },
    rubric: rubric.map((item) => ({ ...item, score: Math.round(item.score * 10) / 10 })),
    caveat: 'Score measures Bourbon Signal usefulness from official/public NC sources, not guaranteed live shelf inventory. Board shipment and release signals remain board-level unless a store-level feed is explicitly available.'
  };

  console.log(JSON.stringify(payload, null, 2));
  if (score < 95) {
    console.error(`NC usefulness score below 95 target: ${score}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
