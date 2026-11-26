import type { DiscoveryRegion, LocalReport, SavedBottle } from '../../shared/local-discovery';
import { dropDisplayTime } from './drop-feed-policy';
import { isCurrentExactStoreInventoryEvidence, isFreshPublicDrop, publicEvidenceStateCode } from './public-drop-evidence';

type Drop = Record<string, unknown>;
function text(...values: unknown[]) {
  return values.find((v): v is string => typeof v === 'string' && Boolean(v.trim()))?.trim() || '';
}
function locality(value: string) {
  return value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Receives only the normal customer-visible evidence pool. The result is a
// single redacted card, so it cannot expose paid feed history or pagination.
export function selectLocalReport(rows: readonly Drop[], region: DiscoveryRegion, now: number, watch?: SavedBottle): LocalReport | null {
  const city = locality(region.city);
  let best: LocalReport | null = null;
  for (const row of rows) {
    if (publicEvidenceStateCode(text(row.state, row.state_code)) !== region.state || !isFreshPublicDrop(row, now)) continue;
    const storeCity = text(row.store_city, row.storeCity, row.city);
    const board = text(row.board_name, row.boardName);
    const exactArea = /^\d{5}$/.test(city)
      ? text(row.store_zip, row.storeZip, row.zip).slice(0, 5) === city
      : [storeCity, board, text(row.store_county, row.storeCounty)].some(value => locality(value) === city);
    if (city && !exactArea) continue;
    const inventory = isCurrentExactStoreInventoryEvidence(row, now);
    const type = text(row.event_type, row.eventType, row.type).toLowerCase();
    const shipment = /shipment|store_delivery|store_allocation/.test(type);
    if (!inventory && !shipment && !/release/.test(type)) continue;
    const bottle = text(row.bottle_name, row.canonicalName, row.canonical_name, row.bourbonName, row.rawName);
    const reportedAt = watch
      ? text(row.availabilityEpisodeStartedAt, row.availability_episode_started_at, row.first_seen_at, row.firstSeenAt)
      : inventory ? text(row.last_confirmed_at, row.lastConfirmedAt, dropDisplayTime(row)) : dropDisplayTime(row);
    if (!bottle || !Number.isFinite(Date.parse(reportedAt))) continue;
    const source = text(row.source_label, row.sourceLabel, row.source);
    const location = inventory
      ? [text(row.store_name, row.storeName, row.locationName), storeCity].filter(Boolean).join(' · ')
      : text(board, storeCity, row.display_location, row.locationName);
    if (!source || !location) continue;
    const bottleId = text(row.canonical_id, row.canonicalId).slice(0, 180) || null;
    const alertsAvailable = inventory && (row.canAlertAsInventory === true || row.can_alert_as_inventory === true);
    if (watch && (!alertsAvailable || !bottleId || bottleId !== watch.bottleId || Date.parse(reportedAt) <= Date.parse(watch.savedAt))) continue;
    const item: LocalReport = {
      bottle: bottle.slice(0, 150),
      bottleId,
      location: location.slice(0, 150),
      source: source.slice(0, 100),
      kind: inventory ? 'inventory' : shipment ? 'shipment' : 'release',
      reportedAt,
      price: inventory && typeof row.price === 'number' && row.price > 0 ? row.price : null,
      alertsAvailable,
    };
    if (!best || (item.kind === 'inventory' && best.kind !== 'inventory')
      || ((item.kind === 'inventory') === (best.kind === 'inventory') && Date.parse(item.reportedAt) > Date.parse(best.reportedAt))) best = item;
  }
  return best;
}
