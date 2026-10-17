import React, { useEffect, useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useMobileApi as useBaseApi, fixture as baseFixture } from '../cohesion-preview/mocks.jsx';
import { preferencesFixture, profileFixture, feedFixture } from '../../src/api/astra-fixtures';
import seed from '../../src/cellar/bottle-catalog-seed.json';
import { EMPTY_ONBOARDING } from '../../../../shared/mobile-onboarding';
import { starterSuggestions } from '../../../../src/lib/onboarding-discovery';
import { canonicalBottleKey } from '../../src/interactions/member-interactions';

const query = new URLSearchParams(location.search);
let tier = query.get('tier') || 'barrel'; baseFixture.tier = tier;
const paths: Record<string, string> = { check: '/(app)/bottle-check', post: '/(app)/(tabs)/post', shelf: '/(app)/cellar/add', home: '/(app)/(tabs)', radar: '/(app)/(tabs)/radar', membership: '/(app)/account/membership', setup: '/(app)/setup', coverage: '/(app)/account/coverage', support: '/(app)/account/support', feedback: '/(app)/account/feedback', onboarding: '/(app)/onboarding', rewards: '/(app)/account/rewards', account: '/(app)/(tabs)/hq' };
let route = { pathname: paths[query.get('screen') || 'home'] || paths.home, params: Object.fromEntries([...query].filter(([key]) => !['screen', 'tier'].includes(key))) };
const history: typeof route[] = []; const listeners = new Set<() => void>();
function emit() { listeners.forEach(listener => listener()); }
function navigate(input: any, replace = false) {
  if (!replace) history.push(route);
  route = typeof input === 'string' ? { pathname: input, params: {} } : { pathname: input.pathname, params: input.params || {} };
  emit();
}
export function usePreviewRoute() { return useSyncExternalStore(callback => { listeners.add(callback); return () => listeners.delete(callback); }, () => route); }
export const router = { push: (input: any) => navigate(input), replace: (input: any) => navigate(input, true),
  dismissTo(input: any) { const index = history.findIndex(row => row.pathname === input.pathname); if (index >= 0) history.splice(index); navigate(input, true); },
  back() { route = history.pop() || { pathname: paths.home, params: {} }; emit(); },
  setParams(params: any) { route = { ...route, params: { ...route.params, ...params } }; emit(); }, canGoBack() { return history.length > 0; } };
export function useRouter() { return router; }
export function useLocalSearchParams() { return usePreviewRoute().params; }
export function useFocusEffect(callback: any) { useEffect(callback, [callback]); }
export const Stack = { Screen: () => null };
export const SafeAreaView = View;
export function useSafeAreaInsets() { return { top: 18, bottom: 18, left: 0, right: 0 }; }
export function useAuth() { return { userId: 'continuity-preview', isLoaded: true, isSignedIn: true, signOut: async () => {} }; }
export const getItemAsync = async (key: string) => localStorage.getItem(key);
export const setItemAsync = async (key: string, value: string) => localStorage.setItem(key, value);
export const deleteItemAsync = async (key: string) => localStorage.removeItem(key);
export const CryptoDigestAlgorithm = { SHA256: 'SHA-256' };
export const randomUUID = () => crypto.randomUUID();
export const getRandomBytes = (length: number) => crypto.getRandomValues(new Uint8Array(length));
export const digestStringAsync = async (_algorithm: string, value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
export const runtimeVersion = 'fixture'; export const updateId = 'local-preview';
const owned = ['makers-mark', 'wild-turkey-101'].map((id, index) => {
  const bottle = seed.find(row => row.id === id)!;
  return { bottleId: id, bottleName: bottle.name, canonicalKey: canonicalBottleKey(bottle.name), rating: 85 + index, isRated: true, sealedQuantity: 1, openedQuantity: 0, finishedCount: 0, tastedOnly: false, wouldBuyAgain: true, tasteTags: ['Vanilla', 'Caramel'], addedAt: '2026-10-01', updatedAt: '2026-10-16' };
});
let prefs = preferencesFixture({ entitlements: { canUseCollection: true, canUseRecommendations: tier === 'barrel', trackedBottleLimit: tier === 'free' ? 0 : 15, alertAreaLimit: tier === 'free' ? 0 : 5 }, monitoringScopes: [{ id: 'city:NC:raleigh', type: 'city', state: 'NC', label: 'Raleigh' }], notificationPreferences: { ...preferencesFixture().notificationPreferences, rarityTiers: ['allocated', 'limited', 'unicorn'] }, collectionPreferences: { version: 1, bottles: owned } });
let draft = { ...EMPTY_ONBOARDING, displayName: 'Oak Street', homeState: query.get('homeState') || 'NC', step: Number(query.get('step') || 2), savedBottleIds: ['four-roses-single-barrel'] };
let completed = query.get('screen') !== 'onboarding';
const requests: any[] = [{ id: 'request-1', stateCode: 'NC', areaLabel: 'Raleigh', status: 'on_radar', memberUpdate: 'We are reviewing local stores.', updatedAt: '2026-10-16', storeName: null }];
const postPayloads: any[] = [];
const api: any = { ...useBaseApi(), accountIdentity: 'continuity-preview:session', pushAccountId: 'continuity-preview',
  getMemberProfile: async () => profileFixture({ homeState: draft.homeState, membership: { tier: tier as any, label: tier, paid: tier !== 'free', hasBetaAccess: false }, feedAreas: { states: ['NC', 'VA'].map(code => ({ code, label: code === 'NC' ? 'North Carolina' : 'Virginia', areaLabel: 'City' as const, options: [{ value: code === 'NC' ? 'Raleigh' : 'Richmond', label: code === 'NC' ? 'Raleigh' : 'Richmond' }] })) } }),
  getMemberPreferences: async () => structuredClone(prefs),
  updateMemberPreferences: async (patch: any) => {
    if (patch.watchlistMutation) { const names = prefs.bottleAlertPreferences.bottleNames.filter(name => name !== patch.watchlistMutation.bottleName); if (patch.watchlistMutation.watched) names.push(patch.watchlistMutation.bottleName); prefs.bottleAlertPreferences = { bottleNames: names, bottleKeys: names.map(canonicalBottleKey) }; }
    if (patch.monitoringScopes) prefs.monitoringScopes = patch.monitoringScopes;
    if (patch.collectionPreferences) prefs.collectionPreferences = { ...patch.collectionPreferences, version: prefs.collectionPreferences.version + 1 };
    if (patch.alertMode) prefs.alertMode = patch.alertMode;
    if (patch.notificationPreferences) Object.entries(patch.notificationPreferences).forEach(([key, value]) => { (prefs.notificationPreferences as any)[key] = Array.isArray(value) ? value : { ...(prefs.notificationPreferences as any)[key], ...(value as object) }; });
    return structuredClone(prefs);
  },
  getMobileOnboardingStatus: async () => ({ completed, draft: structuredClone(draft) }),
  saveOnboardingDraft: async (value: any) => { draft = structuredClone(value); return { completed, draft }; },
  completeMobileOnboarding: async (body: any) => { draft = body.draft; completed = body.action === 'complete'; return { completed }; },
  getOnboardingDiscovery: async () => ({ suggestions: starterSuggestions(seed.map(row => ({ ...row, tags: [] })), draft), signals: [], signalsUnavailable: false }),
  getBottleProfile: async (id: string) => { const row = seed.find(bottle => bottle.id === id)!; return { bottle: { id: row.id, name: row.name, producer: row.producer || '', category: 'bourbon', proof: row.proof || null, age: row.ageStatement || null, msrp: 40, rarity: { label: 'Allocated', tier: 'allocated', pending: false, reviewedAt: '2026-10-16' } } }; },
  getSignalAreaOptions: async (state: string) => [{ value: state === 'VA' ? 'Richmond' : 'Raleigh', label: state === 'VA' ? 'Richmond' : 'Raleigh' }],
  listSignals: async (input: any) => ({ ...feedFixture(), signals: query.get('empty') === '1' ? [] : [owned[0], owned[1]].map((bottle, index) => ({ contractVersion: 'bourbon-signal/signal@1', id: 'fixture-' + index, kind: 'availability', source: { type: 'trusted_source', label: 'Synthetic retailer report' }, bottle: { id: bottle.bottleId, name: bottle.bottleName, rarity: 'limited' }, location: { scope: 'exact_store', state: input?.state || 'NC', store: { id: 'preview-store', name: 'Downtown ABC', city: 'Raleigh', state: 'NC', address: '100 Main Street' } }, timing: { displayAt: new Date().toISOString() }, evidence: { photo: false, corroborationCount: 0, helpfulCount: 0, retailerReported: false, sourceBacked: true }, strength: 'best', availability: { price: 39.99, quantity: 3, status: 'reported' }, actions: ['watch_bottle'], alertEligibility: { inventory: true, watch: true } })) }),
  getPushDeviceStatus: async () => ({ enabled: false, supported: true, currentDeviceRegistered: false, registeredDeviceCount: 0 }),
  getMemberAlerts: async () => ({ alerts: [], unreadCount: 0 }),
  getSubscriptionManagement: async () => ({ provider: 'apple' }),
  submitSighting: async (payload: any) => { postPayloads.push(payload); return { ok: true, created: true, duplicate: false, sighting: { id: 'sighting_preview' } }; },
  getSignalPoints: async () => ({ balance: 130, debt: 0, catalog: [{ key: 'glencairn', name: 'Bourbon Signal Glencairn', points: 500, fulfillmentType: 'physical', inventoryRemaining: 10 }], redemptions: [], redemptionEligible: tier !== 'free' }),
  getCoverageRequests: async () => ({ requests }), submitCoverageRequest: async (body: any) => { const row = { id: 'request-2', stateCode: body.stateCode, areaLabel: body.manualCity || body.manualCounty || body.stateCode, storeName: body.manualStoreName, status: 'requested', updatedAt: '2026-10-16' }; requests.push(row); return { request: row }; },
  submitFeedback: async (body: any) => { (window as any).feedbackSubmitted = body; return { ok: true, id: body.id }; },
  clearReadCache() {},
};
export function useMobileApi() { return api; }
export const radarPushDeviceId = async () => 'fixture-device'; export const radarPushPermission = async () => 'granted';
export const refreshRadarPushIfEnabled = async () => null; export const watchRadarPushToken = () => ({ remove() {} });
export const enableRadarPush = async () => ({ enabled: true, currentDeviceRegistered: true }); export const disableRadarPush = async () => null;
export const signOutWithRadarPushDisabled = async (_api: any, signOut: any) => signOut();
export const nativePhotoJournal = () => ({ load: async () => null });
export const chooseSightingPhoto = async () => ({ error: 'Camera and photo access require a device.' });
export const discardSightingPhoto = () => {}; export const sightingPhotoBlob = () => new Blob(); export const retainSightingPhoto = (_owner: any, photo: any) => photo;
const purchases: any = { status: 'ready', products: ['standard', 'barrel'].map(value => ({ tier: value, productId: `com.bourbonsignal.app.${value}.monthly`, localizedPrice: value === 'standard' ? '$2.99' : '$5.99', localizedPeriod: 'month' })), eligibleProductIds: ['com.bourbonsignal.app.standard.monthly', 'com.bourbonsignal.app.barrel.monthly'], restoreAvailable: true, profile: null, membership: null,
  refresh: async () => {}, restore: async () => {}, purchase: async (id: string) => { tier = id.includes('barrel') ? 'barrel' : 'standard'; prefs.entitlements = { ...prefs.entitlements, trackedBottleLimit: 15, alertAreaLimit: 5 }; purchases.profile = (await api.getMemberProfile()).profile; } };
export function usePurchases() { return purchases; }
export function NativeBottleScanner({ onMatches }: any) { return <Pressable accessibilityRole="button" onPress={() => onMatches([seed.find(row => row.id === 'makers-mark')])}><Text>Simulate label match</Text></Pressable>; }
(window as any).continuityPreview = { navigate, completePurchase: async () => { await purchases.purchase('com.bourbonsignal.app.standard.monthly'); route = { ...route }; emit(); }, get route() { return route; }, get preferences() { return prefs; }, get draft() { return draft; }, get posted() { return postPayloads; } };
