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
    !preferences.notificationPreferences.rarityTiers.length ||
    (preferences.alertMode === 'specific_bottles' && watchedBottleCount(preferences) === 0);
}

export function radarSetupStatus(preferences:MemberPreferences,phone:'On'|'Off'|'Setup needed') {
  if(preferences.entitlements?.alertAreaLimit===0)return {title:'Explore Radar',detail:'Saved-area alerts require Standard or Barrel Proof. You can still browse Signals and start your Shelf.'};
  if(!preferences.monitoringScopes.length)return {title:'Choose an area',detail:'Radar needs a saved area before it can match reports. Source coverage varies by market.'};
  if(!preferences.notificationPreferences.rarityTiers.length)return {title:'Choose bottle tiers',detail:'Select at least one rarity tier so matching reports can appear.'};
  if(preferences.alertMode==='specific_bottles'&&watchedBottleCount(preferences)===0)return {title:'Watch your first bottle',detail:'Your watched bottles and selected tiers must both match. Add a bottle or choose Discover rare bottles.'};
  if(!preferences.notificationPreferences.onSite.enabled&&phone!=='On')return {title:'Enable an alert channel',detail:'Turn on Radar inbox matches or explicitly enable Phone alerts. Your watch preferences are saved.'};
  if(phone==='Setup needed')return {title:'Phone alerts need attention',detail:'Review Notifications below to finish registration or allow notifications in phone Settings.'};
  return {title:'Watch preferences ready',detail:phone==='On'?'Matching recent reports can reach Radar and this phone. Delivery depends on fresh reports in your selected areas.':'Matching recent reports can appear in Radar. Phone alerts are off; enable them below if you want notifications.'};
}
