import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const OUT = path.join(ROOT, 'out');

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function fail(message, details = null) {
  console.error(`KY hardening verification failed: ${message}`);
  if (details) console.error(JSON.stringify(details, null, 2));
  process.exit(1);
}

async function main() {
  const lifecycle = await readJson(path.join(ROOT, '..', 'src', 'config', 'state-lifecycle.json'));
  const kyLifecycle = lifecycle.states?.KY;
  if (!Array.isArray(lifecycle.activeStates) || !lifecycle.activeStates.includes('KY')) fail('KY must be in activeStates.');
  if (kyLifecycle?.publicStatus !== 'active') fail('KY lifecycle must be active.', kyLifecycle);
  if (kyLifecycle?.coverageTier !== 'distillery_release_watch') fail('KY must use distillery_release_watch coverage tier.', kyLifecycle);
  if (kyLifecycle?.lifecycle !== 'distillery_drop_release_watch') fail('KY must use distillery_drop_release_watch lifecycle.', kyLifecycle);

  const ky = await readJson(path.join(OUT, 'states', 'KY.json'));
  const distillerySignals = (ky.signals || []).filter((signal) => String(signal.eventType || '').startsWith('distillery_'));
  const giftShopDrops = distillerySignals.filter((signal) => signal.eventType === 'distillery_gift_shop_availability');
  const releaseWatchSignals = distillerySignals.filter((signal) => signal.eventType === 'distillery_release_watch');
  if (ky.status !== 'useful') fail('KY state report should be useful.', { status: ky.status });
  if (!giftShopDrops.length) fail('KY should include at least one official distillery gift-shop availability signal.');
  if (!releaseWatchSignals.length) fail('KY should include at least one official distillery release-watch source.');
  const badInventorySignals = distillerySignals.filter((signal) => signal.canAlertAsInventory || signal.locationPrecision !== 'distillery');
  if (badInventorySignals.length) fail('Distillery signals must not be retailer inventory and must use distillery precision.', badInventorySignals.slice(0, 5));
  const weakSemantics = distillerySignals.filter((signal) => !/not retailer store inventory|not.*store shipment/i.test(String(signal.inventorySemantics || '')));
  if (weakSemantics.length) fail('Distillery signals must explicitly distinguish from retailer inventory/store shipment.', weakSemantics.slice(0, 5));

  const dropsPayload = await readJson(path.join(OUT, 'site', 'drops.json'));
  const eventsPayload = await readJson(path.join(OUT, 'site', 'events.json'));
  const kyDrops = (dropsPayload.drops || []).filter((drop) => drop.state === 'KY');
  const kyEvents = (eventsPayload.events || []).filter((event) => event.state === 'KY');
  const badDrops = kyDrops.filter((drop) => drop.canAlertAsInventory || drop.dataLane !== 'distillery_release_watch');
  if (!kyDrops.length) fail('Site export should expose KY distillery gift-shop drops.');
  if (badDrops.length) fail('KY site drops must remain in distillery_release_watch lane, not actionable_inventory.', badDrops.slice(0, 5));
  if (!kyEvents.some((event) => event.sourceType === 'official_distillery')) fail('Site events should classify KY release-watch pages as official_distillery.', kyEvents.slice(0, 5));

  console.log(`KY hardening verification passed: ${distillerySignals.length} distillery signals, ${kyDrops.length} site drops, ${kyEvents.length} site events.`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
