import type { MemberAlert, MemberPreferences } from '../api/types';
import { alertIsStale, watchedBottleCount } from './radar-preferences';

export function partitionRadarAlerts(alerts: MemberAlert[], now = new Date()) {
  const current: MemberAlert[] = [];
  const history: MemberAlert[] = [];
  for (const alert of alerts) {
    if (alert.archivedAt) continue;
    (alertIsStale(alert, now) ? history : current).push(alert);
  }
  return { current, history };
}

export function radarBottleSummary(preferences: MemberPreferences) {
  const tiers = preferences.notificationPreferences.rarityTiers.map(tier => tier[0].toUpperCase() + tier.slice(1)).join(' + ');
  return preferences.alertMode === 'specific_bottles'
    ? `${watchedBottleCount(preferences)} watched bottle${watchedBottleCount(preferences) === 1 ? "" : "s"} · ${tiers}`
    : tiers;
}

export function radarLocationSummary(preferences: MemberPreferences) {
  const scopes = preferences.monitoringScopes;
  if (!scopes.length) return 'Choose locations';
  const states = [...new Set(scopes.map(scope => scope.state))];
  return `${states.join(' + ')} · ${scopes.length} selected area${scopes.length === 1 ? '' : 's'}`;
}

export function radarSetupNeeded(preferences: MemberPreferences) {
  return preferences.entitlements?.alertAreaLimit === 0 || !preferences.monitoringScopes.length ||
    (preferences.alertMode === 'specific_bottles' && watchedBottleCount(preferences) === 0);
}
