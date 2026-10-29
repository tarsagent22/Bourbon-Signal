const DAY_MS = 86_400_000;

function releaseDay(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match && !iso) return null;
  const [year, month, day] = match
    ? [Number(match[3]), Number(match[1]), Number(match[2])]
    : [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  const timestamp = Date.UTC(year, month - 1, day), date = new Date(timestamp);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? timestamp : null;
}

function inventoryClaim(row) {
  return row.canAlertAsInventory === true || row.can_alert_as_inventory === true
    || row.dataLane === 'inventory' || row.data_lane === 'inventory'
    || /inventory/i.test(String(row.type || row.eventType || row.event_type || row.changeType || ''))
    || /^(in_stock|live_inventory|shelf_stock|quantity_on_hand)$/i.test(String(row.availabilityStatus || ''));
}

// Absence is legitimate only when the official store-release material has aged out.
// An observation refresh cannot make an old release date current again.
export function alabamaExpiredReleaseAbsence({ stateReport, coverage, partition, events = [], alerts = [], now = Date.now(), historyDays = 30 } = {}) {
  const reject = reason => ({ allowed: false, reason });
  const nowMs = typeof now === 'number' ? now : Date.parse(now);
  if (!Number.isFinite(nowMs) || !Number.isFinite(historyDays) || historyDays <= 0) return reject('invalid_history_window');
  if (coverage?.state !== 'AL' || coverage.publicStatus !== 'active'
    || coverage.lifecycle !== 'scheduled_release_leads' || coverage.coverageTier !== 'shipment_drop_intelligence') return reject('missing_scheduled_release_coverage');
  if (partition?.state !== 'AL' || partition.count !== 0 || !Array.isArray(partition.drops) || partition.drops.length !== 0) return reject('missing_coherent_empty_partition');
  if (stateReport?.state !== 'AL' || !Array.isArray(stateReport.signals)
    || !['useful', 'useful_retained_not_due'].includes(stateReport.status)) return reject('missing_useful_source_report');
  const signals = stateReport.signals;
  if (coverage.signalCount !== signals.length) return reject('source_coverage_count_mismatch');
  if ([...signals, ...events.filter(row => row.state === 'AL'), ...alerts.filter(row => row.state === 'AL')].some(inventoryClaim)) return reject('unexpected_inventory_claim');
  const releases = signals.filter(row => row.eventType === 'alabc_limited_release_store_drop');
  if (!releases.length) return reject('missing_official_release_rows');
  const cutoff = Math.floor(nowMs / DAY_MS) * DAY_MS - historyDays * DAY_MS;
  const dates = [];
  for (const row of releases) {
    const date = releaseDay(row.releaseDate), originalDate = releaseDay(row.raw?.release?.releaseDate);
    if (row.state !== 'AL' || date == null || originalDate !== date || (row.eventDate && releaseDay(row.eventDate) !== date)
      || row.locationPrecision !== 'store_level' || !/^alabc:\d+$/.test(String(row.storeId || ''))
      || row.storeId !== `alabc:${row.raw?.release?.storeNumber}` || !row.storeAddress
      || !row.canonicalBottleId || !(Number(row.price) > 0) || row.quantity !== 0) return reject('incomplete_original_release_evidence');
    try {
      const url = new URL(row.sourceUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'alabcboard.gov' || url.port || url.username || url.password
        || !url.pathname.toLowerCase().endsWith('.pdf')) return reject('unreviewed_release_source');
    } catch { return reject('unreviewed_release_source'); }
    if (date >= cutoff) return reject('current_or_upcoming_release_requires_drops');
    dates.push(date);
  }
  return {
    allowed: true, reason: 'official_release_dates_expired', expiredReleaseCount: releases.length,
    latestReleaseDate: new Date(Math.max(...dates)).toISOString().slice(0, 10),
    historyCutoff: new Date(cutoff).toISOString().slice(0, 10),
    diagnostic: `AL has no Feed drops: ${releases.length} official store-release rows predate the ${historyDays}-day history window; original dates remain in source evidence and future lottery material remains separate from inventory.`,
  };
}
