import type { CompanyMemberUser } from './company-control-room';
import type { MobileActivityRecord } from './mobile-activity';
import { monitoringScopesFromPreferences } from './monitoring-scopes.ts';
import { normalizeWatchlist } from './watchlist-state.ts';
import { resolveEffectiveMembershipTier } from './entitlements';

const DAY = 86_400_000;
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Saved settings and recorded app activity; never a claim of push delivery. */
export function buildMemberSetupProgress(users: CompanyMemberUser[], activity: Record<string, MobileActivityRecord[]> = {}, now = new Date()) {
  const report = { windowDays: 30, accounts: 0, appOpened: 0, areaSaved: 0, watchlistSaved: 0,
    alertMembers: 0, pushEnabled: 0, setupComplete: 0, missingArea: 0, missingWatchlist: 0, missingPush: 0,
    eligibleForLaterActivity: 0, activityAfter24Hours: 0 };
  for (const user of users) {
    if (user.createdAt === undefined) continue;
    const createdAt = new Date(user.createdAt).getTime();
    if (!Number.isFinite(createdAt) || createdAt > now.getTime() || now.getTime() - createdAt > 30 * DAY) continue;
    report.accounts++;
    const records = activity[user.id || ''] || [];
    const validActivity = records.filter(row => Number.isFinite(Date.parse(row.firstSeenAt))
      && Date.parse(row.firstSeenAt) <= Date.parse(row.lastSeenAt) && Date.parse(row.lastSeenAt) <= now.getTime());
    if (!validActivity.length) continue;
    report.appOpened++;
    const metadata = user.publicMetadata || {};
    const area = monitoringScopesFromPreferences(metadata.areaPreferences, metadata.monitoringScopes).length > 0;
    const watchlist = metadata.alertMode === 'anything_notable' || normalizeWatchlist(metadata.bottleAlertPreferences).bottleKeys.length > 0;
    if (area) report.areaSaved++;
    if (watchlist) report.watchlistSaved++;
    if (resolveEffectiveMembershipTier(metadata, now) !== 'free') {
      report.alertMembers++;
      const push = object(object(metadata.notificationPreferences).push).enabled === true;
      if (push) report.pushEnabled++;
      if (!area) report.missingArea++;
      else if (!watchlist) report.missingWatchlist++;
      else if (!push) report.missingPush++;
      else report.setupComplete++;
    }
    if (validActivity.some(row => now.getTime() - Date.parse(row.firstSeenAt) >= DAY)) {
      report.eligibleForLaterActivity++;
      if (validActivity.some(row => Date.parse(row.lastSeenAt) - Date.parse(row.firstSeenAt) >= DAY)) report.activityAfter24Hours++;
    }
  }
  return report;
}
