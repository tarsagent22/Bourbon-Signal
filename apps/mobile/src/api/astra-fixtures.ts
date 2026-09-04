import type { MemberPreferences, MemberProfile, SignalFeedPage } from './types';
// Offline complete wire fixtures, not observed service responses.
export function preferencesFixture(patch: Partial<MemberPreferences> = {}): MemberPreferences {
  return { collectionAccess: { canRead: true, canEditExisting: true, canAdd: true, limit: null, remaining: null, showCapacityNotice: false },
    areaPreferences: { states: [], ncBoards: [], gaAreas: [], tnAreas: [], vaCities: [], ohCities: [], iaCities: [], idCities: [], scAreas: [], caAreas: [], nvAreas: [], nyAreas: [], coAreas: [], paCounties: [], paStores: [] },
    monitoringScopes: [], notificationPreferences: { rarityTiers: [], onSite: { enabled: true }, push: { enabled: false }, email: { enabled: false, mode: 'all' }, sms: { enabled: false, available: false, verified: false, mode: 'major_only' }, sightings: { enabled: true } },
    alertMode: 'specific_bottles', bottleAlertPreferences: { bottleNames: [], bottleKeys: [] }, collectionPreferences: { bottles: [], version: 1 }, ...patch };
}
export function profileFixture(patch: Partial<MemberProfile['profile']> = {}): MemberProfile {
  return { contractVersion: 'bourbon-signal/mobile-api@1', profile: { identity: null, displayName: 'Fixture member', customDisplayName: null,
    feedAreas: { states: [] }, membership: { tier: 'barrel', label: 'Barrel', paid: true, hasBetaAccess: false }, entitlements: { fullFeed: true, canSubmitSignals: true }, ...patch } };
}
export function feedFixture(): SignalFeedPage {
  return { contractVersion: 'bourbon-signal/signal@1', view: 'all', signals: [], marketSummaries: [], total: 0, nextCursor: null, hasMore: false, degraded: false,
    access: { previewLocked: false, requiresAccountForFullFeed: false, memberSignalsAvailable: true, marketDetailsLocked: false } };
}
