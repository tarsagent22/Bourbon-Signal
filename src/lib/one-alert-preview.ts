import { createHash } from 'node:crypto';
import type { LocalReport, SavedBottle } from '../../shared/local-discovery';

export function isAlertPreviewMarket(state: string, value = process.env.MOBILE_ALERT_PREVIEW_MARKETS || '') {
  // Only enable after the named market has passed live freshness and alert checks.
  return value.split(',').some(entry => entry.trim().toUpperCase() === state);
}
export function huntPreviewKey(saved: SavedBottle, report: LocalReport) {
  return createHash('sha256').update(JSON.stringify([
    saved.bottleId, saved.state, saved.city, report.reportedAt, report.location, report.source,
  ])).digest('hex');
}
